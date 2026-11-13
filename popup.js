let tab, st, timer;

async function load() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  st = await send({ type: "getState", url: tab?.url || "", tabId: tab?.id });
  render();
}

function render() {
  const paused = !st.enabled;
  document.body.classList.toggle("paused", paused);
  $("pause").checked = paused;
  document.querySelector(".bar img").src = paused ? "icons/off32.png" : "icons/icon32.png";

  // The site and its power button
  const host = st.web ? st.host.replace(/^www\./, "") : "";
  $("site").textContent = host || "This page";
  const on = st.web && !paused && !st.off;
  const power = $("power");
  power.classList.toggle("is-off", !on);
  power.disabled = !st.web || paused;
  power.setAttribute("aria-pressed", String(on));
  power.title = st.off ? "Turn protection back on for this site" : "Turn protection off for this site";
  power.setAttribute("aria-label", power.title);

  if (!st.web) { $("state").textContent = "Nothing to protect here"; $("hint").textContent = "Popup Guard works on websites only"; }
  else if (paused) { $("state").textContent = "Paused"; $("hint").textContent = "Popups are not being blocked anywhere"; }
  else if (st.off) { $("state").textContent = "Off for this site"; $("hint").textContent = "Popups are allowed here. Click to turn back on."; }
  else { $("state").textContent = "Protected"; $("hint").textContent = "Ad popups are blocked on this site"; }

  // The number that matters, then the rest small
  $("tabCount").textContent = fmt(st.tabCount);
  $("tabLabel").textContent = st.tabCount === 1 ? "popup blocked on this tab" : "popups blocked on this tab";
  $("totals").textContent = `${fmt(st.stats.today)} today · ${fmt(st.stats.total)} since install`;

  // Allow for 30 s
  const allow = $("allow");
  allow.disabled = !on;
  clearInterval(timer);
  const tick = () => {
    const left = Math.ceil((st.allowedUntil - Date.now()) / 1000);
    $("allowLeft").textContent = left > 0 ? `${left}s left` : "";
    if (left <= 0) clearInterval(timer);
  };
  tick();
  if (st.allowedUntil > Date.now()) timer = setInterval(tick, 500);

  // Recent activity
  $("recentCount").textContent = st.recent.length ? String(Math.min(st.recent.length, 30)) : "";
  const list = $("recentList");
  list.textContent = "";
  if (!st.recent.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nothing blocked yet. Popups that get stopped show up here.";
    list.append(li);
  } else {
    for (const it of st.recent.slice(0, 5)) {
      list.append(activityItem(it, st.trustedHosts, (u) => send({ type: "trustHost", url: u })));
    }
  }
  $("allActivity").hidden = st.recent.length <= 5;
}

// Show the change immediately, then save it; report a problem instead of silently doing nothing.
async function act(optimistic, msg, reloadTab) {
  optimistic();
  render();
  let res;
  try { res = await send(msg); } catch (e) { res = { ok: false, error: String(e && e.message || e) }; }
  if (res && res.ok === false) {
    await load();
    $("hint").textContent = "Couldn't save that change. Try again.";
    console.warn("[Popup Guard]", res.error);
    return;
  }
  if (reloadTab) chrome.tabs.reload(tab.id);
  load();
}

$("power").onclick = () => act(() => { st.off = !st.off; }, { type: "toggleSite", url: tab.url }, true);
$("pause").onchange = (e) => { const paused = e.target.checked; act(() => { st.enabled = !paused; }, { type: "setEnabled", value: !paused }, true); };
$("resume").onclick = () => act(() => { st.enabled = true; }, { type: "setEnabled", value: true }, true);
$("allow").onclick = async () => { await send({ type: "allowForSeconds", tabId: tab.id, seconds: 30 }); load(); };
$("toggleRecent").onclick = () => {
  const open = $("recent").classList.toggle("open");
  $("toggleRecent").setAttribute("aria-expanded", String(open));
};
$("settings").onclick = () => chrome.runtime.openOptionsPage();
$("allActivity").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("options.html#activity") });

load();
