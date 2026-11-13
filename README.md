# Popup Guard

A Chrome/Brave extension that stops websites from hijacking your clicks to open ad and malware tabs.

It works on every site out of the box, with no per-site setup. You can pause it, switch it off for one site, or fine-tune it in Settings.

## How it protects you

Popup Guard stacks five layers, so an ad that gets past one is caught by the next:

1. **In-page guard** (`inject.js`): stops ad scripts from opening new windows at all. A popup is allowed only when it comes from your own link click, from the site itself, or from a trusted sign-in, payment or share window.
2. **Click relay** (`relay.js`): tells the background which link clicks were really yours, and passes your settings to the in-page guard.
3. **Safety net:** any new tab that isn't your link click, an approved popup or the same site is closed immediately, and you're brought back.
4. **Ad redirect undo:** catches the "tab-under" trick, where an ad opens a copy of the page in a new tab and turns your original tab into an ad. Your tab is sent back and the copy is closed.
5. **Learned blocklist:** when a domain keeps trying to open popups you didn't ask for, it's added to your blocklist, and its scripts and frames are blocked on every site.

It also removes invisible click traps: transparent links stretched over a page that turn any click into an ad.

## A blocklist that learns from you

The blocklist starts empty. As you browse, every blocked popup counts as a strike against its destination domain, and after two strikes the domain is added. Safeguards:

- The site you're on is never learned, and neither is a trusted site.
- Only scripts and frames are blocked. You can still visit a learned domain directly, and its own pages load normally.
- Learned domains appear in **Settings › Blocked ad domains**, where you can remove them or add your own.
- Marking a site as trusted from the activity list also takes it off the blocklist.
- You can turn learning off in **Settings › Learn ad domains as you browse**.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` (or `brave://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the repository folder.

## iPhone (Safari)

The `ios` folder holds the same in-page protection packaged as a userscript for the free **Userscripts** Safari extension. See [ios/README.md](ios/README.md) for setup. To rebuild it after changing `inject.js`:

```bash
node build-ios.js
```

## Settings

- Pause everywhere, or switch Popup Guard off for the current site
- Allow popups for 30 seconds on the current tab
- Always allow popups to specific sites
- Toggle each protection layer
- Manage the blocklist
- Activity list with a blocked-popup count on the toolbar icon

## Permissions

- `tabs`, `webNavigation`: notice new tabs and close the ones you didn't open
- `scripting`, host access to all sites: add the in-page guard to pages
- `declarativeNetRequest`: block requests to domains on your blocklist
- `storage`: save your settings, blocklist and activity

Protection and activity logs run locally. Settings and domain lists use Chrome Sync when enabled. The developer receives no browsing data. See [PRIVACY.md](PRIVACY.md).

## Chrome Web Store releases

See [PUBLISHING.md](PUBLISHING.md) for the first store upload and automatic updates from GitHub releases. The workflow builds ZIPs now; store publishing requires developer registration, item IDs, and credentials.

Read the [privacy policy](PRIVACY.md) for data handling and storage details.

## License

MIT. See [LICENSE](LICENSE).
