// Popup Guard – isolated-world helper (extension only; page scripts can't see or fake this).
//
// - reports real user link clicks ("intent") and approved opens ("allow") to the background,
//   which closes any new tab that matches neither;
// - reports popups blocked inside the page ("blocked") for the counter / activity list;
// - hands the user's settings to inject.js, and the "allow popups for 30 s" button.
(() => {
  // Stay out of captcha / bot-check frames entirely (same list as inject.js).
  const SKIP_HOSTS = ["challenges.cloudflare.com", "hcaptcha.com", "recaptcha.net", "google.com", "gstatic.com"];
  let selfHost = location.hostname;
  if (!selfHost) { try { selfHost = new URL(self.origin).hostname; } catch {} }
  if (SKIP_HOSTS.some((h) => selfHost === h || selfHost.endsWith("." + h))) return;

  const send = (msg) => { try { chrome.runtime.sendMessage(msg); } catch {} };
  const toPage = (type, data) => {
    try { document.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(data) })); } catch {}
  };
  const sameSite = (url) => {
    try {
      const h = new URL(url, location.href).hostname;
      return h === location.hostname || h.endsWith("." + location.hostname) || location.hostname.endsWith("." + h);
    } catch { return false; }
  };

  // Settings for inject.js.
  function pushConfig() {
    chrome.storage.sync.get({ trustedHosts: [], opts: {}, exceptions: [], enabled: true }, (c) => {
      toPage("popup-guard-config", {
        trustedHosts: c.trustedHosts,
        overlays: c.opts.overlays !== false,
        exceptions: c.exceptions,   // inject.js switches off if this tab's site is listed
        enabled: c.enabled,
      });
    });
  }
  pushConfig();
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === "sync" && (c.trustedHosts || c.opts || c.exceptions || c.enabled)) pushConfig();
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "allowForSeconds") toPage("popup-guard-allow-for", { seconds: msg.seconds });
  });

  // Same overlay test as inject.js: a transparent off-site link covering the page is not a real link.
  function isClickTrap(a) {
    if (sameSite(a.href)) return false;
    const s = getComputedStyle(a);
    if (+s.opacity < 0.1 || s.visibility === "hidden") return true;
    const r = a.getBoundingClientRect();
    const covers = r.width * r.height > innerWidth * innerHeight * 0.5;
    return covers && (s.position === "fixed" || s.position === "absolute") && !a.textContent.trim();
  }

  function onUserAction(e) {
    if (!e.isTrusted) return;
    const a = e.composedPath().find((n) => n instanceof HTMLAnchorElement && n.href);
    if (a && !isClickTrap(a)) send({ type: "intent", url: a.href });
  }
  for (const type of ["pointerdown", "click", "auxclick", "contextmenu"]) {
    window.addEventListener(type, onUserAction, { capture: true, passive: true });
  }
  window.addEventListener("keydown", (e) => {
    if (e.isTrusted && e.key === "Enter" && e.target instanceof HTMLAnchorElement) send({ type: "intent", url: e.target.href });
  }, true);
  window.addEventListener("submit", (e) => {
    if (e.isTrusted && e.target.target === "_blank") send({ type: "intent", url: e.target.action });
  }, true);

  document.addEventListener("popup-guard-allow", () => send({ type: "allow" }), true);
  document.addEventListener("popup-guard-blocked", (e) => {
    let d = {};
    try { d = JSON.parse(e.detail); } catch {}
    send({ type: "blocked", url: String(d.url || ""), kind: String(d.kind || "blocked") });
  }, true);
})();
