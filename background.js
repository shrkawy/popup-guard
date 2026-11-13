// Popup Guard – background service worker.
//
// Works on every site by default (no per-site lists). The user can pause it, switch it off for a
// site, or fine-tune it on the settings page.
//
// Layers:
//  1. inject.js (page world)  – stops ad scripts from opening tabs at all (see the rule at its top).
//  2. relay.js  (isolated)    – reports real user link clicks ("intent"), approved opens ("allow")
//                               and in-page blocks ("blocked"); passes settings to inject.js.
//  3. here (safety net)       – any new tab that is neither the user's link click, nor approved,
//                               nor on the same site, is closed immediately.
//  4. here (tab-under)        – ad opens the page in a new tab and turns the ORIGINAL tab into an ad:
//                               the original tab is sent back and the duplicate closed.
//  5. learned blocklist       – domains that keep opening popups the user didn't ask for are
//                               learned as the user browses, then their scripts and frames are
//                               blocked everywhere (see learnAdDomain).

// The blocklist ships empty: it is built from each user's own browsing, plus anything they add
// on the settings page. Don't hard-code domains here. Note: some video players show an
// "ad blocker detected" wall when their player CDN is blocked; remove such a domain if that happens.
const DEFAULT_AD_DOMAINS = [];

const DEFAULTS = {
  enabled: true,
  exceptions: [],     // sites where protection is off
  trustedHosts: [],   // extra sites whose popups are always allowed (user-added)
  adDomains: DEFAULT_AD_DOMAINS,
  opts: { closeStray: true, tabUnder: true, overlays: true, blocklist: true, learn: true, badge: true },
};

// Learning: a domain joins the blocklist after it has tried to open unwanted popups this many
// times. One strike could be a fluke; repeat offenders are almost always ad redirectors.
const LEARN_AFTER = 2;
const MAX_AD_DOMAINS = 250; // keeps the list inside the sync-storage per-item quota

async function getConfig() {
  const cfg = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  cfg.opts = { ...DEFAULTS.opts, ...cfg.opts };
  return cfg;
}

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };
const related = (a, b) => !!a && !!b && (a === b || a.endsWith("." + b) || b.endsWith("." + a));
// "Site" = last two labels (good enough to treat www.x.com / cdn.x.com as one site).
const siteOf = (host) => host.split(".").slice(-2).join(".");
const sameSite = (u1, u2) => { const a = hostOf(u1), b = hostOf(u2); return !!a && siteOf(a) === siteOf(b); };
const isException = (url, exceptions) => exceptions.some((s) => related(hostOf(url), s));
const isWebUrl = (url) => /^https?:/.test(url || "");

const BUILTIN_TRUSTED = [
  "accounts.google.com", "appleid.apple.com", "login.microsoftonline.com", "login.live.com",
  "facebook.com", "github.com", "paypal.com", "stripe.com", "twitter.com", "x.com",
  "linkedin.com", "pinterest.com", "reddit.com", "discord.com", "t.me", "telegram.me",
  "wa.me", "whatsapp.com", "vk.com", "tumblr.com",
];
const isTrustedPopup = (url, extra = []) =>
  [...BUILTIN_TRUSTED, ...extra].some((t) => related(hostOf(url), t));

// ---------- setup ----------

// Several events can ask for re-registration at once (a button click AND the storage-change
// listener). Running two at the same time makes the second fail with "Duplicate script ID",
// so registrations are queued and each one only removes what is actually registered.
let registerQueue = Promise.resolve();
function registerScripts() {
  registerQueue = registerQueue.then(doRegisterScripts).catch((e) => console.warn("[Popup Guard] register failed:", e));
  return registerQueue;
}
async function doRegisterScripts() {
  const { enabled, exceptions } = await getConfig();
  const existing = (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id);
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing });
  if (!enabled) return;
  const common = {
    matches: ["http://*/*", "https://*/*"],
    excludeMatches: exceptions.flatMap((s) => [`*://${s}/*`, `*://*.${s}/*`]),
    runAt: "document_start",
    allFrames: true,
    matchOriginAsFallback: true,
  };
  await chrome.scripting.registerContentScripts([
    { id: "guard", js: ["inject.js"], world: "MAIN", ...common },
    { id: "relay", js: ["relay.js"], world: "ISOLATED", ...common },
  ]);
}

async function applyBlocklist() {
  const { enabled, adDomains, opts } = await getConfig();
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  const on = enabled && opts.blocklist && adDomains.length;
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map((r) => r.id),
    // Main-frame navigations are never blocked (rules skip them unless asked), and requests made
    // by a listed domain's own pages are left alone, so visiting such a site directly still works.
    addRules: on ? [{ id: 1, priority: 1, action: { type: "block" },
      condition: { requestDomains: adDomains, excludedInitiatorDomains: adDomains } }] : [],
  });
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1] }); // v1.x leftover
}

async function updateIcon() {
  const { enabled } = await getConfig();
  chrome.action.setTitle({ title: enabled ? "Popup Guard – on" : "Popup Guard – paused" });
  chrome.action.setIcon({
    path: enabled
      ? { 16: "icons/icon16.png", 32: "icons/icon32.png", 48: "icons/icon48.png" }
      : { 16: "icons/off16.png", 32: "icons/off32.png", 48: "icons/off48.png" },
  }).catch(() => {});
}

async function sync() {
  await registerScripts();
  await applyBlocklist();
  await updateIcon();
}

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.sync.get(null);
  const union = (a = [], b = []) => [...new Set([...a, ...b])];
  // Migrate v1.x/2.0 data.
  if (cur.blocked) {
    const { stats } = await chrome.storage.local.get({ stats: null });
    if (!stats) await chrome.storage.local.set({ stats: { total: cur.blocked, day: "", today: 0 } });
  }
  await chrome.storage.sync.remove(["sites", "blocked"]);
  await chrome.storage.sync.set({
    enabled: cur.enabled ?? true,
    exceptions: cur.exceptions || [],
    trustedHosts: cur.trustedHosts || [],
    adDomains: union(cur.adDomains, DEFAULT_AD_DOMAINS),
    opts: { ...DEFAULTS.opts, ...(cur.opts || {}) },
  });
  await sync();
});
chrome.runtime.onStartup.addListener(sync);
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "sync") return;
  if (c.enabled || c.exceptions) registerScripts();
  if (c.enabled || c.adDomains || c.opts) applyBlocklist();
  if (c.enabled) updateIcon();
});

// ---------- activity: counters, badge, recent list ----------

const today = () => new Date().toISOString().slice(0, 10);

async function recordBlock(tabId, entry) {
  const { stats, recent } = await chrome.storage.local.get({ stats: { total: 0, day: "", today: 0 }, recent: [] });
  const d = today();
  stats.total += 1;
  stats.today = stats.day === d ? stats.today + 1 : 1;
  stats.day = d;
  recent.unshift({ ...entry, t: Date.now() });
  await chrome.storage.local.set({ stats, recent: recent.slice(0, 30) });
  if (entry.url) learnAdDomain(entry.url, entry.from);

  if (tabId == null) return;
  const key = `tab_${tabId}`;
  const n = ((await chrome.storage.session.get({ [key]: 0 }))[key] || 0) + 1;
  await chrome.storage.session.set({ [key]: n });
  const { opts } = await getConfig();
  if (opts.badge) {
    chrome.action.setBadgeBackgroundColor({ color: "#e5484d", tabId }).catch(() => {});
    chrome.action.setBadgeTextColor?.({ color: "#ffffff", tabId })?.catch?.(() => {});
    chrome.action.setBadgeText({ text: n > 99 ? "99+" : String(n), tabId }).catch(() => {});
  }
}

// ---------- learned blocklist ----------

// Called for every blocked popup / closed tab. Counts strikes per destination domain and adds
// repeat offenders to the blocklist. Runs one at a time so two blocks can't race on storage.
let learnQueue = Promise.resolve();
function learnAdDomain(url, fromUrl) {
  learnQueue = learnQueue.then(() => learnOne(url, fromUrl)).catch(() => {});
  return learnQueue;
}

async function learnOne(url, fromUrl) {
  if (!isWebUrl(url)) return;
  const host = hostOf(url).replace(/^www\./, "");
  if (!host || !host.includes(".")) return;
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.opts.learn) return;
  // Never learn the site the user is on, a trusted site, or anything from a site they switched off.
  if (sameSite(url, fromUrl) || isTrustedPopup(url, cfg.trustedHosts)) return;
  if (fromUrl && isException(fromUrl, cfg.exceptions)) return;
  if (cfg.adDomains.some((d) => related(host, d))) return;

  const { adStrikes } = await chrome.storage.local.get({ adStrikes: {} });
  const strikes = (adStrikes[host] || 0) + 1;
  if (strikes < LEARN_AFTER) {
    adStrikes[host] = strikes;
    const keys = Object.keys(adStrikes);
    if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete adStrikes[k];
    await chrome.storage.local.set({ adStrikes });
    return;
  }
  delete adStrikes[host];
  await chrome.storage.local.set({ adStrikes });
  const adDomains = [...cfg.adDomains, host].slice(-MAX_AD_DOMAINS); // drop the oldest if full
  await chrome.storage.sync.set({ adDomains }); // storage.onChanged re-applies the blocklist
}

// ---------- what the user / page told us (per tab, last few seconds) ----------

const intents = new Map();    // tabId -> [{ url, t }]   real link clicks
const allowUntil = new Map(); // tabId -> time            approved window.open / "allow for 30 s"
const lastUrl = new Map();    // tabId -> committed top-level URL
const spawned = new Map();    // openerTabId -> { tabId, url, t, clicked }  (for tab-under)

function userClicked(tabId, targetUrl, withinMs = 3000) {
  const now = Date.now();
  return (intents.get(tabId) || []).some((i) => now - i.t < withinMs &&
    (i.url === targetUrl || hostOf(i.url) === hostOf(targetUrl)));
}
const allowed = (tabId) => (allowUntil.get(tabId) || 0) > Date.now();
function allowFor(tabId, ms) {
  allowUntil.set(tabId, Math.max(allowUntil.get(tabId) || 0, Date.now() + ms));
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab?.id;
  if (msg.type === "intent" && tabId != null) {
    const list = (intents.get(tabId) || []).filter((i) => Date.now() - i.t < 5000);
    list.push({ url: msg.url, t: Date.now() });
    intents.set(tabId, list.slice(-10));
    return;
  }
  if (msg.type === "allow" && tabId != null) { allowFor(tabId, 2000); return; }
  if (msg.type === "blocked" && tabId != null) {
    recordBlock(tabId, { url: msg.url || "", from: sender.tab.url || "", kind: msg.kind || "blocked" });
    return;
  }
  // Always answer the popup, even if something failed, so it never waits forever.
  handleUiMessage(msg).then(reply, (e) => {
    console.warn("[Popup Guard]", msg.type, "failed:", e);
    reply({ ok: false, error: String(e && e.message || e) });
  });
  return true;
});

// ---------- layer 3: close unwanted new tabs ----------

const handled = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function verdict(cfg, sourceTabId, sourceUrl, targetUrl) {
  if (!isWebUrl(sourceUrl)) return "allow";                                 // opened from a browser page
  if (targetUrl && !isWebUrl(targetUrl) && targetUrl !== "about:blank") return "allow"; // chrome://, mailto: …
  if (userClicked(sourceTabId, targetUrl)) return "allow";                   // a real link click
  if (allowed(sourceTabId)) return "allow";                                  // approved / allowed for 30 s
  if (targetUrl && isTrustedPopup(targetUrl, cfg.trustedHosts)) return "allow";
  if (targetUrl && isWebUrl(targetUrl) && sameSite(targetUrl, sourceUrl)) return "allow-same-site";
  return "block";
}

async function onNewTab(newTabId, targetUrl, sourceTabId) {
  if (handled.has(newTabId) || sourceTabId == null) return;
  handled.add(newTabId); // two events can report the same tab
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.opts.closeStray) return;
  let source;
  try { source = await chrome.tabs.get(sourceTabId); } catch { return; }
  const sourceUrl = source.url || source.pendingUrl || "";
  if (isException(sourceUrl, cfg.exceptions)) return;

  let v = verdict(cfg, sourceTabId, sourceUrl, targetUrl);
  if (v === "block") {
    await sleep(120); // messages from the page may still be in flight
    v = verdict(cfg, sourceTabId, sourceUrl, targetUrl);
  }
  if (v !== "block") {
    spawned.set(sourceTabId, { tabId: newTabId, url: targetUrl, t: Date.now(), clicked: userClicked(sourceTabId, targetUrl) });
    return;
  }
  try { await chrome.tabs.remove(newTabId); } catch {}
  chrome.tabs.update(sourceTabId, { active: true }).catch(() => {});
  await recordBlock(sourceTabId, { url: targetUrl || "", from: sourceUrl, kind: "closed tab" });
}

chrome.webNavigation.onCreatedNavigationTarget.addListener((d) => onNewTab(d.tabId, d.url, d.sourceTabId));
chrome.tabs.onCreated.addListener((tab) => {
  const url = tab.pendingUrl || tab.url;
  if (tab.openerTabId != null && isWebUrl(url)) onNewTab(tab.id, url, tab.openerTabId);
});

// ---------- layer 4: tab-under ----------

chrome.webNavigation.onCommitted.addListener(async (d) => {
  if (d.frameId !== 0) return;
  const prev = lastUrl.get(d.tabId);
  lastUrl.set(d.tabId, d.url);
  const sp = spawned.get(d.tabId);
  if (!sp || Date.now() - sp.t > 4000 || sp.clicked) return;
  if (!prev || sameSite(prev, d.url) || !isWebUrl(d.url)) return;
  if (["typed", "auto_bookmark", "generated", "keyword", "reload"].includes(d.transitionType)) return;
  if (userClicked(d.tabId, d.url, 4000) || allowed(d.tabId)) return;
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.opts.tabUnder || isException(prev, cfg.exceptions)) return;

  spawned.delete(d.tabId);
  chrome.tabs.update(d.tabId, { url: prev }).catch(() => {});
  if (sp.url && sameSite(sp.url, prev)) {
    chrome.tabs.remove(sp.tabId).catch(() => {});
    chrome.tabs.update(d.tabId, { active: true }).catch(() => {});
  }
  await recordBlock(d.tabId, { url: d.url, from: prev, kind: "tab-under" });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const m of [intents, allowUntil, lastUrl, spawned]) m.delete(tabId);
  handled.delete(tabId);
  chrome.storage.session.remove(`tab_${tabId}`);
});

// ---------- popup & settings page ----------

async function handleUiMessage(msg) {
  const cfg = await getConfig();
  switch (msg.type) {
    case "getState": {
      const { stats, recent } = await chrome.storage.local.get({ stats: { total: 0, day: "", today: 0 }, recent: [] });
      const key = `tab_${msg.tabId}`;
      const tabCount = msg.tabId != null ? ((await chrome.storage.session.get({ [key]: 0 }))[key] || 0) : 0;
      return {
        ...cfg,
        builtinTrusted: BUILTIN_TRUSTED,
        defaultAdDomains: DEFAULT_AD_DOMAINS,
        host: hostOf(msg.url || ""),
        web: isWebUrl(msg.url),
        off: isException(msg.url || "", cfg.exceptions),
        allowedUntil: allowUntil.get(msg.tabId) || 0,
        stats: { ...stats, today: stats.day === today() ? stats.today : 0 },
        tabCount,
        recent,
      };
    }
    case "setEnabled":
      await chrome.storage.sync.set({ enabled: !!msg.value });
      await sync();
      return { ok: true };
    case "toggleSite": {
      const host = hostOf(msg.url).replace(/^www\./, "");
      const existing = cfg.exceptions.find((s) => related(hostOf(msg.url), s));
      const exceptions = existing ? cfg.exceptions.filter((s) => s !== existing) : [...cfg.exceptions, host];
      await chrome.storage.sync.set({ exceptions });
      await registerScripts();
      return { ok: true };
    }
    case "setOpt":
      await chrome.storage.sync.set({ opts: { ...cfg.opts, [msg.key]: !!msg.value } });
      if (msg.key === "blocklist") await applyBlocklist();
      if (msg.key === "badge" && !msg.value) {
        for (const t of await chrome.tabs.query({})) chrome.action.setBadgeText({ text: "", tabId: t.id }).catch(() => {});
      }
      return { ok: true };
    case "setList": // exceptions | trustedHosts | adDomains
      if (!["exceptions", "trustedHosts", "adDomains"].includes(msg.key)) return { ok: false };
      await chrome.storage.sync.set({ [msg.key]: [...new Set(msg.value.map((s) => s.trim().toLowerCase()).filter(Boolean))] });
      if (msg.key === "exceptions") await registerScripts();
      if (msg.key === "adDomains") await applyBlocklist();
      return { ok: true };
    case "trustHost": {
      const host = hostOf(msg.url) || msg.url;
      if (host) {
        // Trusting a site also takes it off the blocklist if it was learned there.
        await chrome.storage.sync.set({
          trustedHosts: [...new Set([...cfg.trustedHosts, host])],
          adDomains: cfg.adDomains.filter((d) => !related(host, d)),
        });
      }
      return { ok: true };
    }
    case "allowForSeconds": {
      allowFor(msg.tabId, (msg.seconds || 30) * 1000);
      chrome.tabs.sendMessage(msg.tabId, { type: "allowForSeconds", seconds: msg.seconds || 30 }).catch(() => {});
      return { ok: true, until: allowUntil.get(msg.tabId) };
    }
    case "resetStats":
      await chrome.storage.local.set({ stats: { total: 0, day: "", today: 0 }, recent: [] });
      return { ok: true };
    case "resetAll":
      await chrome.storage.sync.clear();
      await chrome.storage.sync.set(DEFAULTS);
      await chrome.storage.local.remove("adStrikes");
      await sync();
      return { ok: true };
  }
  return {};
}
