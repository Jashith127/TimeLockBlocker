"use strict";

// ── State ─────────────────────────────────────────────────────────────────────
var DEFAULT_PRESETS = [
  { label: "10 mins", ms: 10 * 60 * 1000 },
  { label: "30 mins", ms: 30 * 60 * 1000 },
  { label: "01 hour", ms:  1 * 60 * 60 * 1000 },
  { label: "02 hours",ms:  2 * 60 * 60 * 1000 },
  { label: "03 hours",ms:  3 * 60 * 60 * 1000 }
];

var presets     = DEFAULT_PRESETS.slice();
var selIdx      = -1;
var blockUntil  = 0;
var timerActive = false;
var cdInterval  = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseDuration(raw, unit) {
  raw = (raw || "").trim();
  if (!raw) { return null; }

  // Compound format: 1h 2m 10s
  var m = raw.match(
    /^(?:(\d+(?:\.\d+)?)\s*h(?:(?:ou)?r?s?)?\s*)?(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\s*)?(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?)?$/i
  );
  if (m && (m[1] || m[2] || m[3])) {
    var total = (parseFloat(m[1] || 0) * 3600) +
                (parseFloat(m[2] || 0) * 60)   +
                 parseFloat(m[3] || 0);
    return total > 0 ? Math.round(total * 1000) : null;
  }

  // Plain number — use dropdown unit
  var n = parseFloat(raw);
  if (!isNaN(n) && n > 0) {
    if (unit === "hours")   { return Math.round(n * 3600000); }
    if (unit === "seconds") { return Math.round(n * 1000); }
    return Math.round(n * 60000);
  }
  return null;
}

function msToLabel(ms) {
  var h = Math.floor(ms / 3600000);
  var m = Math.floor((ms % 3600000) / 60000);
  var s = Math.floor((ms % 60000) / 1000);
  var parts = [];
  if (h) { parts.push(h + "h"); }
  if (m) { parts.push(m + "m"); }
  if (s) { parts.push(s + "s"); }
  return parts.join(" ") || "0m";
}

function pad(n) { return (n < 10 ? "0" : "") + String(n); }

function fmtHMS(ms) {
  if (ms <= 0) { return "00:00:00"; }
  var s = Math.ceil(ms / 1000);
  return pad(Math.floor(s / 3600)) + ":" + pad(Math.floor((s % 3600) / 60)) + ":" + pad(s % 60);
}

function el(id) { return document.getElementById(id); }

// ── Preset rendering — uses textContent, no innerHTML ─────────────────────────
function renderPresets() {
  var grid = el("presetsGrid");
  // Remove existing buttons
  while (grid.firstChild) { grid.removeChild(grid.firstChild); }

  presets.forEach(function(p, i) {
    var btn = document.createElement("button");
    btn.className = "preset-btn" + (i === selIdx ? " active" : "");
    btn.textContent = p.label || msToLabel(p.ms);
    btn.addEventListener("click", function() {
      selIdx = (selIdx === i) ? -1 : i;
      renderPresets();
    });
    grid.appendChild(btn);
  });
}

// ── Status bar countdown ──────────────────────────────────────────────────────
function tick() {
  var rem = blockUntil - Date.now();
  if (rem > 0) {
    el("sDot").classList.add("live");
    el("sTxt").textContent = "BLOCKING ACTIVE";
    el("sCd").textContent  = fmtHMS(rem);
  } else {
    el("sDot").classList.remove("live");
    el("sTxt").textContent = "INACTIVE \u2014 no timer running";
    el("sCd").textContent  = "";
    clearInterval(cdInterval);
    cdInterval = null;
  }
}

function startCD() {
  if (cdInterval) { clearInterval(cdInterval); }
  cdInterval = setInterval(tick, 500);
  tick();
}

// ── Confirm message ───────────────────────────────────────────────────────────
var confirmTimer = null;
function showConfirm(msg, isErr) {
  var cel = el("confirmMsg");
  cel.textContent = msg;
  cel.className = "confirm show" + (isErr ? " err" : "");
  clearTimeout(confirmTimer);
  confirmTimer = setTimeout(function() { cel.className = "confirm"; }, 3000);
}

// ── Custom time +/− ───────────────────────────────────────────────────────────
function step(dir) {
  var inp  = el("cInput");
  var unit = el("unitSel").value;
  var v    = parseFloat(inp.value) || 0;
  var s    = (unit === "hours") ? 0.5 : (unit === "seconds") ? 30 : 5;
  v = Math.max(0, v + dir * s);
  inp.value = (v % 1 === 0) ? String(v) : v.toFixed(1);
}

el("minusBtn").addEventListener("click", function() { step(-1); });
el("plusBtn").addEventListener("click",  function() { step(1);  });

// ── SET TIMER ─────────────────────────────────────────────────────────────────
el("setBtn").addEventListener("click", function() {
  var ms = (selIdx >= 0)
    ? presets[selIdx].ms
    : parseDuration(el("cInput").value, el("unitSel").value);

  if (!ms || ms <= 0) {
    showConfirm("! Select a preset or enter a valid duration.", true);
    return;
  }

  browser.runtime.sendMessage({ type: "SET_TIMER", duration: ms }).then(function() {
    blockUntil  = Date.now() + ms;
    timerActive = true;
    tick();
    startCD();
    showConfirm("\u2713 Timer set \u2014 blocking active.");
    selIdx = -1;
    renderPresets();
    el("cInput").value = "";
  });
});

// ── Block List ────────────────────────────────────────────────────────────────
el("blocklistBtn").addEventListener("click", function() {
  browser.tabs.create({ url: browser.runtime.getURL("blocklist.html") });
  window.close();
});

// ── Advanced toggle ───────────────────────────────────────────────────────────
el("advTog").addEventListener("click", function() {
  el("advTog").classList.toggle("open");
  el("advPanel").classList.toggle("open");
});

// ── PRESET MANAGER MODAL ──────────────────────────────────────────────────────
el("settingsBtn").addEventListener("click", function() {
  renderPresetEditor();
  el("presetModal").classList.add("open");
});
el("presetModalX").addEventListener("click", function() { el("presetModal").classList.remove("open"); });
el("presetModal").addEventListener("click", function(e) {
  if (e.target === el("presetModal")) { el("presetModal").classList.remove("open"); }
});

// Preset editor — uses textContent / DOM, no innerHTML with user data
function renderPresetEditor() {
  var list = el("presetList");
  while (list.firstChild) { list.removeChild(list.firstChild); }

  presets.forEach(function(p, i) {
    var row = document.createElement("div");
    row.className = "p-item";

    var inp = document.createElement("input");
    inp.type = "text";
    inp.value = p.label || msToLabel(p.ms);
    inp.placeholder = "e.g. 45m | 1h 30m | 2h";

    var delBtn = document.createElement("button");
    delBtn.className = "p-del";
    delBtn.textContent = "\u2715";
    delBtn.addEventListener("click", (function(idx) {
      return function() {
        presets.splice(idx, 1);
        if (selIdx >= presets.length) { selIdx = -1; }
        renderPresetEditor();
        renderPresets();
      };
    }(i)));

    row.appendChild(inp);
    row.appendChild(delBtn);
    list.appendChild(row);
  });
}

el("addPreset").addEventListener("click", function() {
  presets.push({ label: "15 mins", ms: 15 * 60 * 1000 });
  renderPresetEditor();
  renderPresets();
});

el("savePresets").addEventListener("click", function() {
  var inputs  = el("presetList").querySelectorAll(".p-item input");
  var updated = [];
  var ok      = true;

  inputs.forEach(function(inp) {
    var ms = parseDuration(inp.value.trim(), "minutes");
    if (!ms) {
      inp.style.borderColor = "#e03040";
      ok = false;
    } else {
      inp.style.borderColor = "";
      updated.push({ label: inp.value.trim(), ms: ms });
    }
  });

  if (!ok) { return; }

  presets = updated;
  if (selIdx >= presets.length) { selIdx = -1; }

  browser.runtime.sendMessage({ type: "SAVE_PRESETS", presets: presets }).then(function() {
    renderPresets();
    el("presetModal").classList.remove("open");
  });
});

// ── CHANGE PIN MODAL ──────────────────────────────────────────────────────────
var pinBuf   = "";
var pinStep  = "new";    // "new" | "confirm"
var pinFirst = "";

function openPinModal() {
  pinBuf = ""; pinStep = "new"; pinFirst = "";
  updatePinDots();
  el("pinModalTitle").textContent = "CHANGE PIN";
  el("pinErr").textContent = "";

  if (timerActive) {
    el("pinModalDesc").textContent  = "You cannot change your PIN while a timer is active.";
    el("pinSubmit").style.display   = "none";
    // hide the keypad keys too
    el("pinModal").querySelectorAll(".pin-key").forEach(function(k) { k.style.display = "none"; });
  } else {
    el("pinModalDesc").textContent  = "Enter a new 4-digit PIN.";
    el("pinSubmit").style.display   = "";
    el("pinModal").querySelectorAll(".pin-key").forEach(function(k) { k.style.display = ""; });
  }
  el("pinModal").classList.add("open");
}

function closePinModal() {
  pinBuf = "";
  el("pinModal").classList.remove("open");
  updatePinDots();
}

function updatePinDots() {
  for (var i = 0; i < 4; i++) {
    el("pd" + i).classList.toggle("filled", i < pinBuf.length);
  }
}

el("changePinBtn").addEventListener("click", openPinModal);
el("pinModalX").addEventListener("click", closePinModal);
el("pinModal").addEventListener("click", function(e) {
  if (e.target === el("pinModal")) { closePinModal(); }
});

el("pinModal").querySelectorAll(".pin-key[data-p]").forEach(function(btn) {
  btn.addEventListener("mousedown", function(e) {
    e.preventDefault();
    if (pinBuf.length >= 4) { return; }
    pinBuf += btn.getAttribute("data-p");
    updatePinDots();
    el("pinErr").textContent = "";
  });
});

el("pDel").addEventListener("mousedown", function(e) {
  e.preventDefault();
  pinBuf = pinBuf.slice(0, -1);
  updatePinDots();
});

el("pClr").addEventListener("mousedown", function(e) {
  e.preventDefault();
  pinBuf = "";
  updatePinDots();
});

el("pinSubmit").addEventListener("mousedown", function(e) {
  e.preventDefault();
  submitChangePin();
});

function submitChangePin() {
  if (pinBuf.length < 4) {
    el("pinErr").textContent = "Enter all 4 digits.";
    return;
  }
  if (pinStep === "new") {
    pinFirst = pinBuf;
    pinBuf   = "";
    pinStep  = "confirm";
    updatePinDots();
    el("pinModalDesc").textContent = "Confirm your new PIN.";
    el("pinErr").textContent = "";
  } else {
    if (pinBuf !== pinFirst) {
      el("pinErr").textContent = "PINs don\u2019t match. Try again.";
      pinBuf = ""; pinStep = "new"; pinFirst = "";
      updatePinDots();
      el("pinModalDesc").textContent = "Enter a new 4-digit PIN.";
      return;
    }
    browser.runtime.sendMessage({ type: "SET_PIN", newPin: pinBuf }).then(function(res) {
      if (res && res.success === false) {
        el("pinErr").textContent = res.error || "Error setting PIN.";
      } else {
        closePinModal();
        showConfirm("\u2713 PIN updated.");
      }
    });
  }
}

// ── FIRST-INSTALL SETUP ───────────────────────────────────────────────────────
var setupBuf   = "";
var setupStep  = "set";    // "set" | "confirm"
var setupFirst = "";

function showSetup() {
  el("setupOverlay").classList.add("show");
}
function hideSetup() {
  el("setupOverlay").classList.remove("show");
}

function updateSetupDots() {
  for (var i = 0; i < 4; i++) {
    el("sd" + i).classList.toggle("filled", i < setupBuf.length);
  }
}

function updateSetupProgress(step) {
  el("sp0").classList.toggle("on", step >= 0);
  el("sp1").classList.toggle("on", step >= 1);
}

// Digit keys — mousedown for instant response, preventDefault stops popup closing
document.querySelectorAll(".sk[data-sd]").forEach(function(btn) {
  btn.addEventListener("mousedown", function(e) {
    e.preventDefault();
    if (setupBuf.length >= 4) { return; }
    setupBuf += btn.getAttribute("data-sd");
    updateSetupDots();
    el("setupErr").textContent = "";
  });
});

el("sdDel").addEventListener("mousedown", function(e) {
  e.preventDefault();
  setupBuf = setupBuf.slice(0, -1);
  updateSetupDots();
});

el("sdEnter").addEventListener("mousedown", function(e) {
  e.preventDefault();
  handleSetupEnter();
});

// Physical keyboard support during setup
document.addEventListener("keydown", function(e) {
  if (!el("setupOverlay").classList.contains("show")) { return; }
  if (e.key >= "0" && e.key <= "9" && setupBuf.length < 4) {
    setupBuf += e.key;
    updateSetupDots();
    el("setupErr").textContent = "";
  } else if (e.key === "Backspace") {
    setupBuf = setupBuf.slice(0, -1);
    updateSetupDots();
  } else if (e.key === "Enter") {
    handleSetupEnter();
  }
});

function handleSetupEnter() {
  if (setupBuf.length < 4) {
    el("setupErr").textContent = "Enter all 4 digits first.";
    return;
  }
  if (setupStep === "set") {
    setupFirst = setupBuf;
    setupBuf   = "";
    setupStep  = "confirm";
    updateSetupDots();
    updateSetupProgress(1);
    el("setupStepLabel").textContent = "Step 2 of 2 \u2014 Confirm your PIN";
    el("setupErr").textContent = "";
  } else {
    if (setupBuf !== setupFirst) {
      el("setupErr").textContent = "PINs don\u2019t match. Try again.";
      setupBuf = ""; setupStep = "set"; setupFirst = "";
      updateSetupDots();
      updateSetupProgress(0);
      el("setupStepLabel").textContent = "Step 1 of 2 \u2014 Enter a 4-digit PIN";
      return;
    }
    browser.runtime.sendMessage({ type: "SET_PIN", newPin: setupBuf }).then(function() {
      hideSetup();
    });
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
browser.runtime.sendMessage({ type: "GET_STATE" }).then(function(state) {
  blockUntil  = state.blockUntil  || 0;
  timerActive = state.timerActive || false;

  if (Array.isArray(state.customPresets) && state.customPresets.length > 0) {
    presets = state.customPresets;
  }

  renderPresets();
  tick();
  if (blockUntil > Date.now()) { startCD(); }

  if (!state.hasPin) { showSetup(); }
});
