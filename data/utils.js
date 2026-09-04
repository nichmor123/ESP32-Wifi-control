// DOM element getters
// Optional elements (exist on index.html)
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const sendToggleBtn = document.getElementById("sendToggleBtn");
const txChannelGridEl = document.getElementById("txChannelGrid");

// Config Inputs page elements (exist on config_inputs.html)
const gpStatusEl = document.getElementById("gpStatus");
const channelGridEl = document.getElementById("channelGrid");
const buttonGridEl = document.getElementById("buttonGrid");
const debugEl = document.getElementById("debug");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const saveBtn = document.getElementById("saveBtn");

// Mobile page elements
const joystickLeftEl = document.getElementById("joystick-left-container");
const joystickRightEl = document.getElementById("joystick-right-container");

// Output Config page elements
const outputGridEl = document.getElementById("outputGrid");
const addOutputBtn = document.getElementById("addOutputBtn");

// Battery Config page elements
const chemSelect = document.getElementById("chem-select");
const saveBatteryBtn = document.getElementById("saveBatteryBtn");

// Troubleshooting page elements
const pingBtn = document.getElementById("pingBtn"); // Moved here
const systemInfoEl = document.getElementById("systemInfo");
const statusDotEl = document.getElementById("status-dot");

// ---------- shared helpers ----------
function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function isIndexPage() {
  return document.body.id === 'page-index';
}

function isSettingsPage() {
  return document.body.id === 'page-settings';
}

function isConfigInputsPage() {
  return document.body.id === 'page-config-inputs';
}

function isMobilePage() {
  return document.body.id === 'page-mobile';
}

function isOutputConfigPage() {
  return document.body.id === 'page-config-outputs';
}

function isBatteryPage() {
    return document.body.id === 'page-battery';
}

function isTroubleshootingPage() {
  return document.body.id === 'page-troubleshooting';
}

function buildChannelOptions(selectedChannel, includeNone) {
  const opts = [];
  if (includeNone) {
    const sel = selectedChannel == null ? "selected" : "";
    opts.push(`<option value="" ${sel}>None</option>`);
  }
  for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
    const sel = ch === selectedChannel ? "selected" : "";
    opts.push(`<option value="${ch}" ${sel}>C${ch}</option>`);
  }
  return opts.join("");
}

function appendLog(targetEl, msg) {
  if (!targetEl) return;
  const line = document.createElement("div");
  line.textContent = msg;
  targetEl.appendChild(line);
  targetEl.scrollTop = targetEl.scrollHeight;
}

function setStatus(el, text, color) {
  if (!el) return;
  el.textContent = text;
  if (color) el.style.color = color;

  // Also update the mobile status dot if it exists
  if (statusDotEl) {
    statusDotEl.style.background = color || '#ff4444';
  }
}

function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function clamp01(v) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function rangeToPercent(v, min, max) {
  if (max === min) return 0;
  const t = (v - min) / (max - min);
  return clamp(t, 0, 1) * 100;
}

// ---------- navigation highlight ----------
document.querySelectorAll(".nav a").forEach((link) => {
  if (link.pathname === location.pathname) link.classList.add("active");
});