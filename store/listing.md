# Chrome Web Store listing draft

Name: Popup Guard

Version: 2.3.0

Summary: Block unwanted popup tabs, click traps, and tab-under redirects, with per-site controls.

Suggested category: Privacy & Security

Language: English

Website: https://github.com/shrkawy/popup-guard

Support: https://github.com/shrkawy/popup-guard/issues

Privacy policy: https://github.com/shrkawy/popup-guard/blob/main/PRIVACY.md

## Description

Stop unwanted tabs that appear when websites hijack your clicks.

Popup Guard combines in-page popup checks, a new-tab safety net, tab-under redirect protection, and an optional blocklist that learns from repeated unwanted popup attempts.

- Pause protection everywhere or turn it off for a specific site.
- Temporarily allow popups for 30 seconds.
- Manage trusted destinations and blocked domains.
- Remove invisible links that cover a page to intercept clicks.
- Review recent blocked activity and toolbar counts.
- Turn individual protection layers and domain learning on or off.

Protection is enabled on ordinary websites by default. Some websites may need an exception for legitimate popups.

Processing and activity logs stay in your browser. Some settings, including trusted and blocked domains, use Chrome Sync when enabled. The developer receives no browsing data.

## Single purpose

Prevent unwanted popup tabs and popup-related navigation while letting users control exceptions.

## Permission explanations

- storage: save preferences, exceptions, learned domains, counters, and recent blocked activity.
- tabs: identify new tabs, inspect their destinations, close unwanted popups, and restore the original tab.
- webNavigation: detect popup creation and tab-under navigation.
- scripting: register the page guard and isolated click relay at document start.
- declarativeNetRequest: block scripts and frames from domains in the user's blocklist.
- host access to all sites: protect ordinary HTTP and HTTPS pages without requiring users to grant access separately on every site.

## Privacy declarations to review in the dashboard

Popup Guard processes website URLs and link interactions locally, stores a limited activity log, and uses Chrome Sync for settings and domain lists. It has no remote code, analytics, advertising, or developer data upload. Review PRIVACY.md and Google's definitions before completing the privacy certifications.

## Assets still required

Use icons/icon128.png for the store icon. Capture genuine screenshots of the popup, settings, and protection behavior in Chrome. Add the promotional artwork required by the dashboard. Do not upload this Markdown file inside the extension ZIP.

