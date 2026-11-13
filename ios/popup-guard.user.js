// ==UserScript==
// @name         Popup Guard
// @description  Stops websites from opening ad / malware tabs when you tap.
// @version      2.3.0
// @match        *://*/*
// @run-at       document-start
// @inject-into  page
// ==/UserScript==
{
const __PG_EXCEPTIONS = [];
// Popup Guard – in-page protection (page/MAIN world, runs before the site's own scripts).
// Shared by the Chrome/Brave extension and the iPhone (Safari "Userscripts" app) version.
//
// THE RULE (same on every site – no per-site lists):
// Browsers only let a page open a new tab during a real user click/tap. Popunder ads all exploit
// this the same way: they wait for your click anywhere on the page and, during it, open a tab you
// never asked for (window.open from an ad script, a hidden/synthetic link click, or an invisible
// overlay link). So a new tab is allowed only when:
//   1. you clicked a real, visible link (handled natively by the browser – we never touch it), or
//   2. the site's OWN script files open it while you're not clicking a normal link, or
//   3. it's a well-known sign-in / payment / share window (Google, Apple, PayPal, …), or
//   4. it stays on the same site and no ad-network script asked for it.
// Everything else is blocked, and the ad script gets a fake window back so it doesn't retry.
(() => {
  if (window.__popupGuard) return;
  const related = (a, b) => !!a && !!b && (a === b || a.endsWith("." + b) || b.endsWith("." + a));

  // Never touch captcha / bot-check frames, or sites get stuck on "verifying you are human".
  // Blank and srcdoc frames have no hostname of their own; they belong to whoever created them
  // (e.g. Cloudflare's check frame creates blank inner frames), so use the frame's origin.
  const SKIP_HOSTS = ["challenges.cloudflare.com", "hcaptcha.com", "recaptcha.net", "google.com", "gstatic.com"];
  let selfHost = location.hostname;
  if (!selfHost) { try { selfHost = new URL(self.origin).hostname; } catch {} }
  if (SKIP_HOSTS.some((h) => related(selfHost, h))) return;

  // Cloudflare's "verify you are human" page (and other error pages) come back with an error
  // status (403 / 503 …). Nothing there needs protecting, and changing anything breaks the check.
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.responseStatus >= 400) return;
  } catch {}

  // Top-level site of this tab (also works inside cross-origin iframes such as video players).
  let topHost = location.hostname;
  try { topHost = window.top.location.hostname || topHost; } catch {
    try {
      const anc = location.ancestorOrigins;
      if (anc && anc.length) topHost = new URL(anc[anc.length - 1]).hostname;
      else if (document.referrer) topHost = new URL(document.referrer).hostname;
    } catch {}
  }
  // iPhone build only: sites where the user turned protection off.
  if (typeof __PG_EXCEPTIONS !== "undefined" && __PG_EXCEPTIONS.some((s) => related(topHost, s))) return;

  Object.defineProperty(window, "__popupGuard", { value: true });
  const LOG = (...a) => console.debug("[Popup Guard]", ...a);

  // Windows that legitimately pop up from third-party code: sign-in, payment, sharing.
  const TRUSTED_POPUP_HOSTS = [
    "accounts.google.com", "appleid.apple.com", "login.microsoftonline.com", "login.live.com",
    "facebook.com", "github.com", "paypal.com", "stripe.com", "twitter.com", "x.com",
    "linkedin.com", "pinterest.com", "reddit.com", "discord.com", "t.me", "telegram.me",
    "wa.me", "whatsapp.com", "vk.com", "tumblr.com",
  ];

  // User settings (sent by the extension's relay.js; the iPhone build uses these defaults).
  let extraTrusted = [];
  let overlaysOn = true;
  let allowAllUntil = 0; // "Allow popups for 30 s" button
  document.addEventListener("popup-guard-config", (e) => {
    try {
      const c = JSON.parse(e.detail);
      extraTrusted = Array.isArray(c.trustedHosts) ? c.trustedHosts.map(String) : [];
      overlaysOn = c.overlays !== false;
      // Turned off for this tab's site (or paused everywhere): switch off in every frame of the tab,
      // including video players and widgets that live on other domains.
      const offHere = Array.isArray(c.exceptions) && c.exceptions.some((s) => related(topHost, String(s)));
      if (c.enabled === false || offHere) uninstall("protection is off for " + topHost);
    } catch {}
  });
  document.addEventListener("popup-guard-allow-for", (e) => {
    try { allowAllUntil = Date.now() + Math.min(300, +JSON.parse(e.detail).seconds || 30) * 1000; } catch {}
  });

  const allowedHosts = [location.hostname, topHost];
  const hostOf = (url) => { try { return new URL(url, location.href).hostname; } catch { return ""; } };
  const isSameSite = (url) => { const h = hostOf(url); return allowedHosts.some((a) => related(h, a)); };
  const isTrustedPopup = (url) => {
    const h = hostOf(url);
    return TRUSTED_POPUP_HOSTS.some((t) => related(h, t)) || extraTrusted.some((t) => related(h, t));
  };

  // Report a block (for the extension's counter and activity list).
  function blocked(kind, url) {
    LOG("blocked " + kind, url || "(blank)");
    try { document.dispatchEvent(new CustomEvent("popup-guard-blocked", { detail: JSON.stringify({ kind, url: url || "" }) })); } catch {}
  }

  // Public library CDNs (jQuery etc.) sit on the call stack of the site's own click handlers;
  // they say nothing about who is asking, so they are ignored.
  const NEUTRAL_HOSTS = [
    "code.jquery.com", "cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com", "ajax.googleapis.com",
    "stackpath.bootstrapcdn.com", "maxcdn.bootstrapcdn.com", "cdn.tailwindcss.com",
  ];
  // This script's own URL (when loaded as a file) must not count as a caller.
  const SELF = (document.currentScript && document.currentScript.src) || "";
  // Who is calling? Look at the script URLs on the call stack.
  function callers() {
    const stack = new Error().stack || "";
    return [...stack.matchAll(/https?:\/\/[^\s)]+/g)]
      .map((m) => m[0].replace(/(:\d+)+$/, ""))
      .filter((u) => u !== SELF && !NEUTRAL_HOSTS.some((n) => related(hostOf(u), n)));
  }
  const thirdPartyOnStack = () => callers().some((u) => !isSameSite(u));
  // Site's own script FILES only (inline <script> snippets are where ad tags usually live).
  const firstPartyFile = () => {
    const c = callers();
    return c.length > 0 && c.every(isSameSite) && c.some((u) => /\.js(\?|$)/.test(u));
  };

  // What did the user just click? Popunders piggy-back on clicks on normal links
  // (e.g. you click an episode, the ad opens a tab at the same moment).
  let lastClick = { t: 0, navLink: null };
  const isNavLink = (a) => a && a.href && !/^(javascript:|#)/.test(a.getAttribute("href") || "#") &&
    (!a.target || a.target === "_self" || a.target === "_top");
  for (const type of ["pointerdown", "mousedown", "touchstart", "click"]) {
    window.addEventListener(type, (e) => {
      if (!e.isTrusted) return;
      const a = e.composedPath().find((n) => n instanceof HTMLAnchorElement);
      lastClick = { t: Date.now(), navLink: isNavLink(a) ? a : null };
    }, { capture: true, passive: true });
  }
  const clickingNavLink = () => lastClick.navLink && Date.now() - lastClick.t < 1500;

  function announceAllowed() {
    try { document.dispatchEvent(new CustomEvent("popup-guard-allow")); } catch {}
  }

  function shouldAllowOpen(url) {
    const blank = !url || url === "about:blank";
    if (Date.now() < allowAllUntil) return true;               // user pressed "allow popups for 30 s"
    if (!blank && isTrustedPopup(url)) return true;           // rule 3
    if (thirdPartyOnStack()) return false;                     // an ad script is asking
    if (clickingNavLink()) return !blank && url === lastClick.navLink.href; // piggy-back on a link click
    if (!blank && isSameSite(url)) return true;                // rule 4
    return firstPartyFile();                                   // rule 2 (e.g. a site's download button)
  }

  // A harmless stand-in for the window object that ad scripts expect back.
  function fakeWindow() {
    const noop = () => {};
    return new Proxy({}, {
      get(_, prop) {
        if (prop === "closed") return false;
        if (prop === "location") return { href: "", assign: noop, replace: noop };
        if (prop === "document") return { write: noop, close: noop, open: noop };
        return noop;
      },
      set() { return true; },
    });
  }

  // Everything we patch is recorded so it can be undone (Cloudflare check, see bottom).
  const restores = [];
  function patch(obj, prop, makeDescriptor) {
    const orig = Object.getOwnPropertyDescriptor(obj, prop);
    if (!orig) return;
    try {
      Object.defineProperty(obj, prop, { ...makeDescriptor(orig), configurable: true });
      restores.push(() => Object.defineProperty(obj, prop, orig));
    } catch {}
  }

  // 1. window.open
  function patchWindow(win) {
    if (!win || win.__pgPatched) return;
    try {
      const realOpen = win.open;
      patch(win, "open", () => ({
        writable: false,
        value: function (url, ...rest) {
          const u = url ? String(url) : "";
          if (shouldAllowOpen(u && new URL(u, location.href).href)) {
            LOG("allowed window.open", u || "(blank)");
            announceAllowed();
            return realOpen.call(this, url, ...rest);
          }
          blocked("popup", u);
          return fakeWindow();
        },
      }));
      Object.defineProperty(win, "__pgPatched", { value: true });
    } catch {}
  }
  patchWindow(window);

  // 2. Ad scripts create a hidden blank iframe to steal a clean window.open from it. Patch those too.
  for (const proto of [HTMLIFrameElement.prototype, HTMLFrameElement.prototype]) {
    for (const prop of ["contentWindow", "contentDocument"]) {
      patch(proto, prop, (d) => ({
        ...d,
        get() {
          const v = d.get.call(this);
          try {
            const w = prop === "contentWindow" ? v : v && v.defaultView;
            if (w && (w.location.href === "about:blank" || w.location.hostname === location.hostname)) patchWindow(w);
          } catch {}
          return v;
        },
      }));
    }
  }

  // 3. Script-triggered clicks on links that open a new tab (hidden <a target=_blank> trick).
  function shouldBlockScriptedLink(a) {
    if (!a.href || a.hasAttribute("download") || /^blob:/.test(a.href)) return false; // file downloads
    const newTab = a.target === "_blank" || !a.isConnected;
    if (!newTab) return false;
    return !shouldAllowOpen(a.href);
  }
  patch(HTMLElement.prototype, "click", (d) => ({
    ...d,
    value: function () {
      if (this instanceof HTMLAnchorElement && shouldBlockScriptedLink(this)) return blocked("hidden link", this.href);
      return d.value.call(this);
    },
  }));
  patch(EventTarget.prototype, "dispatchEvent", (d) => ({
    ...d,
    value: function (ev) {
      if (ev && ev.type === "click" && this instanceof HTMLAnchorElement && shouldBlockScriptedLink(this)) {
        blocked("hidden link", this.href);
        return false;
      }
      return d.value.call(this, ev);
    },
  }));

  // 4. Script-submitted forms into a new tab.
  patch(HTMLFormElement.prototype, "submit", (d) => ({
    ...d,
    value: function () {
      if (this.target === "_blank" && !shouldAllowOpen(new URL(this.action, location.href).href)) {
        return blocked("form", this.action);
      }
      return d.value.call(this);
    },
  }));

  // 5. Invisible click-catcher overlays: a transparent off-site link covering the page.
  function isClickTrap(a) {
    if (!overlaysOn || !a || !a.href || isSameSite(a.href)) return false;
    const s = getComputedStyle(a);
    if (+s.opacity < 0.1 || s.visibility === "hidden") return true;
    const r = a.getBoundingClientRect();
    const covers = r.width * r.height > innerWidth * innerHeight * 0.5;
    return covers && (s.position === "fixed" || s.position === "absolute") && !a.textContent.trim();
  }
  function onClick(e) {
    if (!e.isTrusted) return;
    const a = e.composedPath().find((n) => n instanceof HTMLAnchorElement);
    if (isClickTrap(a)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      blocked("invisible overlay", a.href);
      a.remove();
    }
  }
  window.addEventListener("click", onClick, true);
  window.addEventListener("auxclick", onClick, true);

  // 6. Switching off: undo every change so the page behaves as if the guard was never there.
  let active = true;
  function uninstall(reason) {
    if (!active) return;
    active = false;
    restores.splice(0).forEach((r) => { try { r(); } catch {} });
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("auxclick", onClick, true);
    LOG("switched off:", reason);
  }
  // Fallback for a Cloudflare check page served with a normal status.
  document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("challenge-form") || document.querySelector("script[src*='/cdn-cgi/challenge-platform/h/']") ||
        /^just a moment/i.test(document.title)) {
      uninstall("Cloudflare check page");
    }
  });
})();

}
