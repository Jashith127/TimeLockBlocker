"use strict";

// ── State ─────────────────────────────────────────────────────────────────────
var sites          = [];
var timerActive    = false;
var blockUntil     = 0;
var pinBuffer      = "";
var pinCallback    = null;
var bannerInterval = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseDomain(raw) {
  return (raw || "").trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function isValidDomain(d) {
  return d.length > 2 && d.indexOf(".") !== -1;
}

function pad(n) { return (n < 10 ? "0" : "") + String(n); }

function fmtCountdown(ms) {
  if (ms <= 0) { return "00:00:00"; }
  var s = Math.ceil(ms / 1000);
  return pad(Math.floor(s / 3600)) + ":" +
         pad(Math.floor((s % 3600) / 60)) + ":" +
         pad(s % 60);
}

function el(id) { return document.getElementById(id); }

var msgTimer = null;
function showMsg(msg, ok) {
  var e = el("sMsg");
  e.textContent = msg;
  e.style.color = (ok === false) ? "#e03040" : "#39ff14";
  clearTimeout(msgTimer);
  msgTimer = setTimeout(function() { e.textContent = ""; }, 3000);
}

function updateCount() {
  el("cntEl").textContent = sites.length + " domain" + (sites.length !== 1 ? "s" : "");
}

// ── Render site list — pure DOM, no innerHTML with user data ─────────────────
function renderList() {
  var list = el("siteList");
  while (list.firstChild) { list.removeChild(list.firstChild); }

  if (sites.length === 0) {
    var empty = document.createElement("div");
    empty.className = "empty-msg";
    empty.textContent = "No sites blocked yet.";
    list.appendChild(empty);
    updateCount();
    return;
  }

  sites.forEach(function(site, i) {
    var row  = document.createElement("div");
    row.className = "site-item";

    var name = document.createElement("span");
    name.className = "site-name";
    name.textContent = site;  // textContent — safe, no XSS

    var delBtn = document.createElement("button");
    delBtn.className = timerActive ? "site-del locked" : "site-del";
    delBtn.textContent = timerActive ? "\uD83D\uDD12 REMOVE" : "REMOVE";

    delBtn.addEventListener("click", (function(idx) {
      return function() {
        if (timerActive) {
          openPinModal(
            "UNLOCK TO REMOVE",
            "Timer is active. Enter your PIN to remove this site.",
            function() { removeSite(idx); }
          );
        } else {
          removeSite(idx);
        }
      };
    }(i)));

    row.appendChild(name);
    row.appendChild(delBtn);
    list.appendChild(row);
  });

  updateCount();
}

function removeSite(idx) {
  sites.splice(idx, 1);
  saveSites();
  renderList();
  showMsg("\u2713 Site removed.");
}

// ── Persist to storage — background.js syncs via storage.onChanged ────────────
function saveSites() {
  browser.storage.local.set({ blockedSites: sites });
}

// ── Add site ──────────────────────────────────────────────────────────────────
function addSite() {
  var raw = el("addInput").value;
  var d   = parseDomain(raw);

  if (!isValidDomain(d)) {
    showMsg("! Invalid domain.", false);
    return;
  }
  if (sites.indexOf(d) !== -1) {
    showMsg("! Already in list.", false);
    return;
  }

  sites.push(d);
  saveSites();
  renderList();
  el("addInput").value = "";
  showMsg("\u2713 Added " + d);
}

el("addBtn").addEventListener("click", addSite);
el("addInput").addEventListener("keydown", function(e) {
  if (e.key === "Enter") { addSite(); }
});

// ── Clear all ─────────────────────────────────────────────────────────────────
el("clrBtn").addEventListener("click", function() {
  if (timerActive) {
    openPinModal(
      "UNLOCK TO CLEAR",
      "Timer is active. Enter your PIN to clear all sites.",
      function() {
        sites = [];
        saveSites();
        renderList();
        showMsg("\u2713 List cleared.");
      }
    );
    return;
  }
  if (!window.confirm("Clear all blocked sites?")) { return; }
  sites = [];
  saveSites();
  renderList();
  showMsg("\u2713 List cleared.");
});

// ── Banner countdown ──────────────────────────────────────────────────────────
function updateBanner() {
  var rem = blockUntil - Date.now();
  if (rem > 0) {
    el("bannerCd").textContent = fmtCountdown(rem);
  } else {
    timerActive = false;
    el("timerBanner").classList.remove("show");
    clearInterval(bannerInterval);
    bannerInterval = null;
    renderList();
  }
}

function startBanner() {
  el("timerBanner").classList.add("show");
  clearInterval(bannerInterval);
  updateBanner();
  bannerInterval = setInterval(updateBanner, 500);
}

// ── PIN MODAL ─────────────────────────────────────────────────────────────────
function openPinModal(title, desc, onSuccess) {
  pinCallback = onSuccess;
  pinBuffer   = "";
  updateBListPinDots();
  el("pinTitle").textContent = title;
  el("pinDesc").textContent  = desc;
  el("pinErr").textContent   = "";
  el("pinModal").classList.add("open");
}

function closePinModal() {
  pinBuffer   = "";
  pinCallback = null;
  el("pinModal").classList.remove("open");
  el("pinErr").textContent = "";
  updateBListPinDots();
}

function updateBListPinDots() {
  for (var i = 0; i < 4; i++) {
    el("bpd" + i).classList.toggle("filled", i < pinBuffer.length);
  }
}

// Digit keys
el("pinModal").querySelectorAll(".pin-key[data-d]").forEach(function(btn) {
  btn.addEventListener("mousedown", function(e) {
    e.preventDefault();
    if (pinBuffer.length >= 4) { return; }
    pinBuffer += btn.getAttribute("data-d");
    updateBListPinDots();
    el("pinErr").textContent = "";
    if (pinBuffer.length === 4) { submitPin(); }
  });
});

el("bpDel").addEventListener("mousedown", function(e) {
  e.preventDefault();
  pinBuffer = pinBuffer.slice(0, -1);
  updateBListPinDots();
});

el("bpClr").addEventListener("mousedown", function(e) {
  e.preventDefault();
  pinBuffer = "";
  updateBListPinDots();
});

el("pinSubmit").addEventListener("mousedown", function(e) {
  e.preventDefault();
  submitPin();
});

el("pinClose").addEventListener("click", closePinModal);
el("pinModal").addEventListener("click", function(e) {
  if (e.target === el("pinModal")) { closePinModal(); }
});

function submitPin() {
  if (pinBuffer.length < 4) {
    el("pinErr").textContent = "Enter all 4 digits.";
    return;
  }
  browser.runtime.sendMessage({ type: "VERIFY_PIN", pin: pinBuffer }).then(function(res) {
    if (res && res.valid) {
      var cb = pinCallback;
      closePinModal();
      if (cb) { cb(); }
    } else {
      el("pinErr").textContent = "\u2715 Incorrect PIN.";
      pinBuffer = "";
      updateBListPinDots();
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
browser.runtime.sendMessage({ type: "GET_STATE" }).then(function(state) {
  sites       = Array.isArray(state.blockedSites) ? state.blockedSites : [];
  timerActive = state.timerActive || false;
  blockUntil  = state.blockUntil  || 0;
  renderList();
  if (timerActive) { startBanner(); }
});

// Keep in sync if storage changes while the page is open
browser.storage.onChanged.addListener(function(changes, area) {
  if (area !== "local") { return; }
  if (changes.blockedSites) {
    sites = changes.blockedSites.newValue || [];
    renderList();
  }
  if (changes.blockUntil) {
    blockUntil  = changes.blockUntil.newValue || 0;
    timerActive = blockUntil > Date.now();
    if (timerActive) {
      startBanner();
    } else {
      el("timerBanner").classList.remove("show");
      clearInterval(bannerInterval);
      bannerInterval = null;
      renderList();
    }
  }
});
