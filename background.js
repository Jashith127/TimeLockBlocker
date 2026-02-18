"use strict";

// ── In-memory state — never accessed async inside the webRequest listener ─────
let blockedSites  = [];
let blockUntil    = 0;
let customPresets = [];
let userPin       = null;  // null means PIN not yet created

// ── Pure helpers ──────────────────────────────────────────────────────────────

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch (_e) {
    return null;
  }
}

function isDomainBlocked(url) {
  var host = getHostname(url);
  if (!host) { return false; }
  return blockedSites.some(function(site) {
    var s = site.replace(/^www\./, "").toLowerCase().trim();
    return host === s || host.endsWith("." + s);
  });
}

function isTimerActive() {
  return Date.now() < blockUntil;
}

// ── Load persisted state into memory on startup ───────────────────────────────

function loadState() {
  browser.storage.local
    .get(["blockedSites", "blockUntil", "customPresets", "userPin"])
    .then(function(data) {
      blockedSites  = Array.isArray(data.blockedSites)  ? data.blockedSites  : [];
      blockUntil    = typeof data.blockUntil === "number" ? data.blockUntil  : 0;
      customPresets = Array.isArray(data.customPresets) ? data.customPresets : [];
      userPin       = typeof data.userPin === "string"   ? data.userPin      : null;
    });
}

// ── Keep in-memory state in sync when storage changes ────────────────────────

browser.storage.onChanged.addListener(function(changes, area) {
  if (area !== "local") { return; }
  if (changes.blockedSites)  { blockedSites  = changes.blockedSites.newValue  || []; }
  if (changes.blockUntil)    { blockUntil    = changes.blockUntil.newValue    || 0;  }
  if (changes.customPresets) { customPresets = changes.customPresets.newValue || []; }
  if (changes.userPin !== undefined) {
    userPin = changes.userPin.newValue || null;
  }
});

// ── Blocking listener — must be fully synchronous ─────────────────────────────

browser.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (Date.now() < blockUntil && isDomainBlocked(details.url)) {
      // block.html is a web_accessible_resource — the browser API is not
      // available there. All data must be passed via clean URL parameters.
      // We pass only the blockUntil timestamp and the hostname (both safe).
      var host = getHostname(details.url) || "";
      var redirectUrl =
        browser.runtime.getURL("block.html") +
        "?u=" + String(blockUntil) +
        "&h=" + encodeURIComponent(host);
      return { redirectUrl: redirectUrl };
    }
    return {};
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["blocking"]
);

// ── Reload open tabs whose domains are now blocked ────────────────────────────

function reloadBlockedTabs() {
  browser.tabs.query({}).then(function(tabs) {
    tabs.forEach(function(tab) {
      if (tab.url && isDomainBlocked(tab.url)) {
        browser.tabs.reload(tab.id);
      }
    });
  });
}

// ── Message handler ───────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener(function(msg) {

  if (msg.type === "SET_TIMER") {
    var now   = Date.now();
    var until = now + msg.duration;
    blockUntil = until;
    browser.storage.local
      .set({ blockUntil: until, blockStart: now })
      .then(reloadBlockedTabs);
    return Promise.resolve({ success: true });
  }

  if (msg.type === "GET_STATE") {
    return Promise.resolve({
      blockUntil:    blockUntil,
      blockedSites:  blockedSites,
      customPresets: customPresets,
      hasPin:        userPin !== null,
      timerActive:   isTimerActive(),
      now:           Date.now()
    });
  }

  if (msg.type === "SAVE_PRESETS") {
    if (!Array.isArray(msg.presets)) {
      return Promise.resolve({ success: false });
    }
    customPresets = msg.presets;
    browser.storage.local.set({ customPresets: msg.presets });
    return Promise.resolve({ success: true });
  }

  if (msg.type === "SET_PIN") {
    // Block PIN changes while a timer is active
    if (isTimerActive()) {
      return Promise.resolve({
        success: false,
        error: "Cannot change PIN while a timer is active."
      });
    }
    if (typeof msg.newPin !== "string" || !/^\d{4}$/.test(msg.newPin)) {
      return Promise.resolve({ success: false, error: "Invalid PIN format." });
    }
    userPin = msg.newPin;
    browser.storage.local.set({ userPin: msg.newPin });
    return Promise.resolve({ success: true });
  }

  if (msg.type === "VERIFY_PIN") {
    return Promise.resolve({ valid: msg.pin === userPin });
  }

  // blocklist.js writes directly to storage; background syncs via onChanged.
  // No SAVE_BLOCKLIST message handler needed.
});

loadState();
