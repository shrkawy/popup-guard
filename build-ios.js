// Builds the iPhone version (for the free "Userscripts" Safari extension) from inject.js.
// Usage:  node build-ios.js
// Output: ios/popup-guard.user.js
const fs = require("fs");
const path = require("path");

// Sites where protection should be OFF on iPhone (it is on everywhere else).
// Add a site here if something on it that legitimately opens a new window stops working.
const EXCEPTIONS = [];

const version = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8")).version;
const body = fs.readFileSync(path.join(__dirname, "inject.js"), "utf8");

const out = `// ==UserScript==
// @name         Popup Guard
// @description  Stops websites from opening ad / malware tabs when you tap.
// @version      ${version}
// @match        *://*/*
// @run-at       document-start
// @inject-into  page
// ==/UserScript==
{
const __PG_EXCEPTIONS = ${JSON.stringify(EXCEPTIONS)};
${body}
}
`;

fs.mkdirSync(path.join(__dirname, "ios"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "ios", "popup-guard.user.js"), out);
console.log("wrote ios/popup-guard.user.js", EXCEPTIONS.length ? `(off on: ${EXCEPTIONS.join(", ")})` : "(on for all sites)");
