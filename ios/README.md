# Popup Guard for iPhone (Safari)

`popup-guard.user.js` is the same in-page protection as the Brave/Chrome extension, packaged for the
free **Userscripts** Safari extension. It works on every website. No per-site setup is needed.

## Setup (one time)

1. Install **Userscripts** from the App Store (free, open source).
2. Open the Userscripts app and choose a scripts folder, e.g. `iCloud Drive › Userscripts`.
3. Get `popup-guard.user.js` into that folder:
   - upload it to iCloud Drive › Userscripts from a web browser (or with iCloud for Windows), or
   - email it to yourself, open the attachment on the iPhone › Share › **Save to Files** › that folder.
4. Settings › Apps › Safari › Extensions › **Userscripts** › turn it on and set "All Websites" to **Allow**.
5. Also turn on Settings › Apps › Safari › **Block Pop-ups**.

## Turning it off for a site

If something on a site that should open a new window stops working, add the site to `EXCEPTIONS`
in `build-ios.js`, run `node build-ios.js`, and copy the new file over the old one on the iPhone.

## What the iPhone version can't do

Safari extensions like this can't close tabs, so the "close any tab that slipped through" and
"tab-under" safety nets of the desktop extension aren't available. Only the in-page protection is.
