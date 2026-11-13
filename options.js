let st;

const LISTS = {
  exceptions: {
    empty: "None. Popup Guard is on for every site.",
    placeholder: "Add a site, e.g. example.com",
  },
  trustedHosts: {
    empty: "No sites added. Sign-in, payment and share windows are already allowed.",
    placeholder: "Add a site, e.g. example.org",
    builtin: true,
  },
  adDomains: {
    empty: "No domains yet. Domains that keep opening popups you didn't ask for are added here as you browse.",
    placeholder: "Add a domain, e.g. ads.example.net",
    collapsed: true,
  },
};

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 1400);
}

// Accept "example.com", "www.example.com", "https://example.com/page".
function normalizeHost(v) {
  v = v.trim().toLowerCase();
  if (!v) return "";
  try { v = new URL(v.includes("://") ? v : "https://" + v).hostname; } catch { return ""; }
  v = v.replace(/^www\./, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v) ? v : "";
}

async function saveList(key, value, message) {
  await send({ type: "setList", key, value });
  toast(message);
  await load();
}

function siteRow(key, host) {
  const row = document.createElement("div");
  row.className = "row site-row";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = host;
  const rm = document.createElement("button");
  rm.className = "remove";
  rm.title = `Remove ${host}`;
  rm.setAttribute("aria-label", `Remove ${host}`);
  rm.append($("removeIcon").content.cloneNode(true));
  rm.onclick = () => saveList(key, st[key].filter((h) => h !== host), `Removed ${host}`);
  row.append(name, rm);
  return row;
}

function addForm(key) {
  const form = document.createElement("form");
  form.className = "add-row row";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = LISTS[key].placeholder;
  input.setAttribute("aria-label", LISTS[key].placeholder);
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = "Add";
  const err = document.createElement("span");
  err.className = "error";
  form.append(input, btn);
  form.onsubmit = (e) => {
    e.preventDefault();
    const host = normalizeHost(input.value);
    if (!host) { err.textContent = "Enter a site like example.com"; form.append(err); return; }
    if (st[key].includes(host)) { err.textContent = "Already in the list"; form.append(err); return; }
    saveList(key, [...st[key], host], `Added ${host}`);
  };
  input.oninput = () => err.remove();
  return form;
}

function renderList(key) {
  const box = $(key);
  const wasOpen = box.querySelector("details")?.open;
  box.textContent = "";
  const cfg = LISTS[key];
  const items = st[key];

  const rows = document.createDocumentFragment();
  if (!items.length) {
    const r = document.createElement("div");
    r.className = "row empty-row";
    r.textContent = cfg.empty;
    rows.append(r);
  }
  for (const h of items) rows.append(siteRow(key, h));

  if (cfg.collapsed) {
    // Long technical list: keep it folded.
    const d = document.createElement("details");
    d.open = !!wasOpen;
    const s = document.createElement("summary");
    s.innerHTML = '<svg class="i" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>';
    s.append(`${items.length} domain${items.length === 1 ? "" : "s"}`);
    d.append(s, rows, addForm(key));
    box.append(d);
  } else {
    box.append(rows, addForm(key));
  }

  if (cfg.builtin) {
    const d = document.createElement("details");
    const s = document.createElement("summary");
    s.innerHTML = '<svg class="i" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>';
    s.append("Built-in sign-in, payment and share sites");
    const p = document.createElement("div");
    p.className = "builtin";
    p.textContent = st.builtinTrusted.join(", ");
    d.append(s, p);
    box.append(d);
  }
}

function renderActivity() {
  $("total").textContent = fmt(st.stats.total);
  const ul = $("recent");
  ul.textContent = "";
  if (!st.recent.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nothing blocked yet. Every popup Popup Guard stops will be listed here.";
    ul.append(li);
    return;
  }
  for (const it of st.recent) {
    ul.append(activityItem(it, st.trustedHosts, async (u) => {
      await send({ type: "trustHost", url: u });
      toast(`Popups to ${hostOf(u)} are now allowed`);
      load();
    }));
  }
}

async function load() {
  st = await send({ type: "getState", url: "" });
  $("enabled").checked = st.enabled;
  $("masterHint").textContent = st.enabled
    ? "Stops sites from opening tabs you didn't ask for"
    : "Paused. Popups are not being blocked anywhere.";
  for (const input of document.querySelectorAll("[data-opt]")) {
    input.checked = !!st.opts[input.dataset.opt];
    input.disabled = !st.enabled;
  }
  for (const key of Object.keys(LISTS)) renderList(key);
  renderActivity();
}

$("enabled").onchange = async (e) => {
  await send({ type: "setEnabled", value: e.target.checked });
  toast(e.target.checked ? "Popup Guard is on" : "Popup Guard is paused");
  load();
};
for (const input of document.querySelectorAll("[data-opt]")) {
  input.onchange = async () => { await send({ type: "setOpt", key: input.dataset.opt, value: input.checked }); toast("Saved"); };
}
$("clear").onclick = async () => {
  if (!confirm("Clear the activity list and counters?")) return;
  await send({ type: "resetStats" });
  load();
};
$("resetAll").onclick = async () => {
  if (!confirm("Reset all settings and lists to their defaults? Activity is kept.")) return;
  await send({ type: "resetAll" });
  toast("Settings reset");
  load();
};
$("version").textContent = `Version ${chrome.runtime.getManifest().version}`;

chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.recent) load(); });
load();
