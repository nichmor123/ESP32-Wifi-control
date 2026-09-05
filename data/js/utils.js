let profilesConfig = {
  active_input: "/config/controlMap.json",
  active_output: "/config/outputMap.json",
  inputs: { "Default": "/config/controlMap.json" },
  outputs: { "Default": "/config/outputMap.json" }
};

async function loadProfilesConfig() {
  try {
    const res = await fetch("/config/profiles.json?v=" + Date.now(), { cache: "no-store" });
    if (res.ok) {
        const data = await res.json();
        profilesConfig = { ...profilesConfig, ...data };
    }
  } catch (e) {
      // profiles.json might not exist yet
  }
  // Normalize legacy paths to /config/
    const fixPath = (p) => (p && !p.startsWith("/config/")) ? "/config" + (p.startsWith("/") ? p : "/" + p) : p;
    if (profilesConfig.active_input) profilesConfig.active_input = fixPath(profilesConfig.active_input);
    if (profilesConfig.active_output) profilesConfig.active_output = fixPath(profilesConfig.active_output);

    if (profilesConfig.inputs) {
      for (const k in profilesConfig.inputs) {
        profilesConfig.inputs[k] = fixPath(profilesConfig.inputs[k]);
      }
    } else {
      profilesConfig.inputs = { "Default": "/config/controlMap.json" };
    }

    if (profilesConfig.outputs) {
      for (const k in profilesConfig.outputs) {
        profilesConfig.outputs[k] = fixPath(profilesConfig.outputs[k]);
      }
    } else {
      profilesConfig.outputs = { "Default": "/config/outputMap.json" };
    }
}

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

function isInputsPage() {
  return document.body.id === 'page-inputs' || document.body.id === 'page-config-inputs';
}

function isMixesPage() {
  return document.body.id === 'page-mixes' || document.body.id === 'page-config-mixes';
}

function isMobilePage() {
  return document.body.id === 'page-mobile';
}

function isOutputsPage() {
  return document.body.id === 'page-outputs' || document.body.id === 'page-config-outputs';
}

function isBatteryPage() {
    return document.body.id === 'page-battery';
}

function isBackupPage() {
  return document.body.id === 'page-backup';
}

function isTroubleshootingPage() {
  return document.body.id === 'page-troubleshooting';
}

function isComputerPage() {
  return document.body.id === 'page-computer';
}

function isThemePage() {
  return document.body.id === 'page-theme';
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