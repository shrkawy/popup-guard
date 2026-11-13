// Shared helpers for the popup and the settings page.
const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const fmt = (n) => Number(n || 0).toLocaleString();

function timeAgo(t) {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

// What happened, in plain words.
const KIND_LABEL = {
  "popup": "Popup blocked",
  "closed tab": "Tab closed",
  "hidden link": "Hidden link blocked",
  "form": "Form popup blocked",
  "invisible overlay": "Invisible overlay removed",
  "tab-under": "Redirect undone",
};

// One activity row: target site, what happened, where, when, and an "Allow" action.
function activityItem(it, trusted, onTrust) {
  const li = document.createElement("li");
  const what = document.createElement("div");
  what.className = "what";
  const host = hostOf(it.url);
  const h = document.createElement("div");
  h.className = "host";
  h.textContent = host || "Blank window";
  h.title = it.url || "";
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${KIND_LABEL[it.kind] || it.kind} on ${hostOf(it.from) || "a page"} · ${timeAgo(it.t)}`;
  what.append(h, meta);
  li.append(what);

  if (host && onTrust) {
    const isTrusted = trusted.some((t) => host === t || host.endsWith("." + t));
    const b = document.createElement("button");
    b.className = "text-btn";
    b.textContent = isTrusted ? "Allowed" : "Allow";
    b.disabled = isTrusted;
    b.title = `Always allow popups to ${host}`;
    b.onclick = async () => { await onTrust(it.url); b.textContent = "Allowed"; b.disabled = true; };
    li.append(b);
  }
  return li;
}
