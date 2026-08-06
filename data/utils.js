// DOM element getters
// Optional elements (exist on index.html)
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const pingBtn = document.getElementById("pingBtn");
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
const statusDotEl = document.getElementById("status-dot");

// ---------- shared helpers ----------
function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function isIndexPage() {
  return !!(sendToggleBtn && txChannelGridEl);
}

function isConfigInputsPage() {
  // reliable because these elements only exist on that page
  return !!(gpStatusEl && channelGridEl);
}

function isMobilePage() {
  return !!(joystickLeftEl && joystickRightEl);
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
  if (link.pathname === location.pathname) link.style.background = "#444";
});