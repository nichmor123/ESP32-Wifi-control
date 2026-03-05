let ws;

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

// ---------- websocket helpers ----------
function wsIsOpen() {
  return ws && ws.readyState === WebSocket.OPEN;
}

function wsSendJson(obj) {
  if (!wsIsOpen()) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

// Binary packet format:
// [0]='U'(0x55), [1]='C'(0x43), [2]=version(1), [3]=N, then N * int16 (little-endian) scaled by 1000
function wsSendChannelsBinary(chFloatArray) {
  if (!wsIsOpen()) return false;

  const N = chFloatArray.length & 0xff;
  const headerBytes = 4;
  const buf = new ArrayBuffer(headerBytes + N * 2);
  const dv = new DataView(buf);

  dv.setUint8(0, 0x55); // 'U'
  dv.setUint8(1, 0x43); // 'C'
  dv.setUint8(2, 0x01); // version
  dv.setUint8(3, N);

  for (let i = 0; i < N; i++) {
    let v = Number(chFloatArray[i] ?? 0);
    if (v > 1) v = 1;
    if (v < -1) v = -1;

    const vi = Math.round(v * 1000); // [-1000..1000]
    dv.setInt16(headerBytes + i * 2, vi, true);
  }

  ws.send(buf);
  return true;
}

// ---------- shared helpers ----------
function sendNeutralOnce() {
  if (!wsIsOpen()) return;
  const ch = new Array(CHANNEL_COUNT).fill(0);
  renderTxChannels(ch);
  wsSendChannelsBinary(ch);
}

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

// ---------- controlmap.json integration ----------
let controlMap = null;

// UI/runtime state derived from controlMap
let CHANNEL_COUNT = 8;
let SOURCES = []; // {id, kind, label, range:[min,max]?}
let AXES = []; // subset of SOURCES where kind==="axis"
let BUTTONS = []; // subset where kind==="button"

// mapping state is stored in controlMap.inputs.map_to_channels
// but we keep quick lookup maps for UI updates
let sourceToChannel = new Map(); // sourceId -> channelNumber (1..N)
let sourceToXform = new Map(); // sourceId -> xform object (preserved)

// DOM refs for fast updates
const axisUiRefs = {}; // sourceId -> { valueEl, barFillEl, selectEl, rangeMin, rangeMax }
const buttonUiRefs = {}; // sourceId -> { pillEl, textEl, selectEl }

function defaultControlMapFallback() {
  return {
    version: 1,
    channels: { count: 20 },
    inputs: {
      device: { type: "gamepad", model: "Logitech F310", mode: "xinput" },
      sources: [
        { id: "rt", kind: "axis", label: "Right Trigger", range: [0.0, 1.0] },
        { id: "lt", kind: "axis", label: "Left Trigger", range: [0.0, 1.0] },
        { id: "lsx", kind: "axis", label: "Left Stick X", range: [-1.0, 1.0] },
        { id: "lsy", kind: "axis", label: "Left Stick Y", range: [-1.0, 1.0] },
        { id: "rsx", kind: "axis", label: "Right Stick X", range: [-1.0, 1.0] },
        { id: "rsy", kind: "axis", label: "Right Stick Y", range: [-1.0, 1.0] },

        { id: "a", kind: "button", label: "A" },
        { id: "b", kind: "button", label: "B" },
        { id: "x", kind: "button", label: "X" },
        { id: "y", kind: "button", label: "Y" },
        { id: "lb", kind: "button", label: "LB" },
        { id: "rb", kind: "button", label: "RB" },
        { id: "back", kind: "button", label: "Back" },
        { id: "start", kind: "button", label: "Start" },
        { id: "ls", kind: "button", label: "Left Stick Click" },
        { id: "rs", kind: "button", label: "Right Stick Click" },
        { id: "dup", kind: "button", label: "D-pad Up" },
        { id: "ddn", kind: "button", label: "D-pad Down" },
        { id: "dlt", kind: "button", label: "D-pad Left" },
        { id: "drt", kind: "button", label: "D-pad Right" },
      ],
      map_to_channels: [
        { source: "rt", ch: 1, xform: { type: "linear", scale: 1.0, offset: 0.0 } },
        { source: "lt", ch: 2, xform: { type: "linear", scale: 1.0, offset: 0.0 } },
        { source: "lsx", ch: 3, xform: { type: "expo", deadband: 0.04, expo: 0.25, invert: false } },
        { source: "lsy", ch: 4, xform: { type: "expo", deadband: 0.04, expo: 0.25, invert: true } },
        { source: "rsx", ch: 5, xform: { type: "expo", deadband: 0.04, expo: 0.25, invert: false } },
        { source: "rsy", ch: 6, xform: { type: "expo", deadband: 0.04, expo: 0.25, invert: true } },

        { source: "a", ch: 7, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "b", ch: 8, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "x", ch: 9, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "y", ch: 10, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "lb", ch: 11, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "rb", ch: 12, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "back", ch: 13, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "start", ch: 14, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "ls", ch: 15, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "rs", ch: 16, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "dup", ch: 17, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "ddn", ch: 18, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "dlt", ch: 19, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "drt", ch: 20, xform: { type: "button", on: 1.0, off: 0.0 } },
      ],
    },
  };
}

async function loadControlMap() {
  const url = "/controlmap.json?v=" + Date.now();
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    appendLog(debugEl || logEl, `Failed to load /controlmap.json (${e.message}). Using fallback.`);
    return defaultControlMapFallback();
  }
}

function deriveRuntimeFromControlMap() {
  CHANNEL_COUNT = controlMap?.channels?.count ?? 8;

  SOURCES = Array.isArray(controlMap?.inputs?.sources) ? controlMap.inputs.sources : [];
  AXES = SOURCES.filter((s) => s && s.kind === "axis");
  BUTTONS = SOURCES.filter((s) => s && s.kind === "button");

  sourceToChannel = new Map();
  sourceToXform = new Map();

  const m = Array.isArray(controlMap?.inputs?.map_to_channels) ? controlMap.inputs.map_to_channels : [];
  for (const entry of m) {
    if (!entry || typeof entry.source !== "string") continue;
    if (typeof entry.ch === "number") sourceToChannel.set(entry.source, entry.ch);
    if (entry.xform && typeof entry.xform === "object") sourceToXform.set(entry.source, entry.xform);
  }
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

function getRangeForSource(src) {
  if (Array.isArray(src.range) && src.range.length === 2) {
    const a = Number(src.range[0]);
    const b = Number(src.range[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
  }
  if (src.kind === "axis") return [-1, 1];
  return [0, 1];
}

function axisValueToPercent(v, min, max) {
  if (max === min) return 0;
  const t = (v - min) / (max - min);
  return clamp(t, 0, 1) * 100;
}

function getSourceKind(sourceId) {
  const src = SOURCES.find((s) => s.id === sourceId);
  return src ? src.kind : null;
}

function defaultXformForKind(kind) {
  if (kind === "button") return { type: "button", on: 1.0, off: 0.0 };
  return { type: "linear", scale: 1.0, offset: 0.0 };
}

// Apply xform from controlmap.json (minimal set: linear/expo/button)
function applyXform(raw, kind, xform) {
  const xf = xform || defaultXformForKind(kind);

  if (xf.type === "button") {
    const pressed = !!raw;
    return pressed ? (xf.on ?? 1.0) : (xf.off ?? 0.0);
  }

  let v = Number(raw) || 0;

  if (xf.invert) v = -v;

  if (typeof xf.deadband === "number" && xf.deadband > 0) {
    const db = xf.deadband;
    if (Math.abs(v) < db) v = 0;
    else {
      const sign = v >= 0 ? 1 : -1;
      v = (sign * (Math.abs(v) - db)) / (1.0 - db);
    }
  }

  if (typeof xf.expo === "number") {
    const e = clamp(xf.expo, 0, 1);
    v = (1.0 - e) * v + e * v * v * v;
  }

  if (typeof xf.scale === "number") v *= xf.scale;
  if (typeof xf.offset === "number") v += xf.offset;

  v = clamp(v, -1, 1);
  return v;
}

function computeChannelsFromState(state) {
  const out = new Array(CHANNEL_COUNT).fill(0);

  const mappings = Array.isArray(controlMap?.inputs?.map_to_channels) ? controlMap.inputs.map_to_channels : [];

  for (const m of mappings) {
    if (!m || typeof m.source !== "string" || typeof m.ch !== "number") continue;
    const chIdx = m.ch - 1;
    if (chIdx < 0 || chIdx >= CHANNEL_COUNT) continue;

    const kind = getSourceKind(m.source);
    if (!kind) continue;

    let raw;
    if (kind === "axis") raw = state.analog[m.source] ?? 0;
    else raw = state.digital[m.source] ?? false;

    const v = applyXform(raw, kind, m.xform);
    out[chIdx] = v;
  }

  return out;
}

// ---------- gamepad (F310 XInput) readout ----------
function readGamepadStateF310(gp) {
  const axes = gp.axes || [];
  const b = gp.buttons || [];

  const analog = {
    rt: clamp01(b[7]?.value ?? 0),
    lt: clamp01(b[6]?.value ?? 0),
    lsx: clamp(axes[0] ?? 0, -1, 1),
    lsy: clamp(axes[1] ?? 0, -1, 1),
    rsx: clamp(axes[2] ?? 0, -1, 1),
    rsy: clamp(axes[3] ?? 0, -1, 1),
  };

  const digital = {
    a: b[0]?.pressed ?? false,
    b: b[1]?.pressed ?? false,
    x: b[2]?.pressed ?? false,
    y: b[3]?.pressed ?? false,
    lb: b[4]?.pressed ?? false,
    rb: b[5]?.pressed ?? false,
    back: b[8]?.pressed ?? false,
    start: b[9]?.pressed ?? false,
    ls: b[10]?.pressed ?? false,
    rs: b[11]?.pressed ?? false,
    dup: b[12]?.pressed ?? false,
    ddn: b[13]?.pressed ?? false,
    dlt: b[14]?.pressed ?? false,
    drt: b[15]?.pressed ?? false,
  };

  return { analog, digital };
}

function getFirstGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) if (gp) return gp;
  return null;
}

// ---------- index page TX cards ----------
const txUiRefs = {}; // chIndex -> { valueEl, barFillEl }

function buildTxChannelCards() {
  if (!txChannelGridEl) return;

  txChannelGridEl.innerHTML = "";
  for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
    const card = document.createElement("div");
    card.className = "chanCard";
    card.innerHTML = `
      <div class="chanHeader">
        <div class="chanName">C${ch}</div>
        <div class="chanValue" id="tx_val_${ch}">0.000</div>
      </div>
      <div class="barOuter">
        <div class="barCenter"></div>
        <div class="barFill" id="tx_bar_${ch}" style="width: 50%;"></div>
      </div>
      <div style="opacity:0.75; font-size:13px; margin-top: 6px;">TX</div>
    `;
    txChannelGridEl.appendChild(card);

    txUiRefs[ch] = {
      valueEl: card.querySelector(`#tx_val_${ch}`),
      barFillEl: card.querySelector(`#tx_bar_${ch}`),
    };
  }
}

function renderTxChannels(chArray) {
  for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
    const ref = txUiRefs[ch];
    if (!ref) continue;

    const v = Number(chArray[ch - 1] ?? 0);
    ref.valueEl.textContent = v.toFixed(3);

    const pct = rangeToPercent(v, -1, 1);
    ref.barFillEl.style.width = `${pct.toFixed(1)}%`;
  }
}

// ---------- send loop (index.html) ----------
let sendingEnabled = false;
let sendTimer = 0;

const SEND_HZ = 25;
const SEND_PERIOD_MS = Math.round(1000 / SEND_HZ);

let lastSentCh = null;

function channelsChanged(a, b) {
  if (!a || !b || a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 0.002) return true;
  }
  return false;
}

function updateSendButtonUi() {
  if (!sendToggleBtn) return;
  sendToggleBtn.textContent = sendingEnabled ? "Stop Sending" : "Start Sending";
}

function stopSending(reason) {
  if (!sendingEnabled) return;

  sendingEnabled = false;

  if (sendTimer) {
    clearInterval(sendTimer);
    sendTimer = 0;
  }

  updateSendButtonUi();
  appendLog(logEl || debugEl, reason ? `STOP: ${reason}` : "STOP");
}

function startSending() {
  if (sendingEnabled) return;

  if (!wsIsOpen()) {
    appendLog(logEl || debugEl, "Can't start: WebSocket not connected");
    return;
  }

  if (sendTimer) {
    clearInterval(sendTimer);
    sendTimer = 0;
  }

  sendingEnabled = true;
  lastSentCh = null; // force first send
  updateSendButtonUi();
  appendLog(logEl || debugEl, `START sending inputs @ ${SEND_HZ} Hz (binary)`);

  sendTimer = setInterval(() => {
    if (!sendingEnabled) return;

    if (!wsIsOpen()) {
      stopSending("ws disconnected");
      return;
    }

    const gp = getFirstGamepad();
    if (!gp) {
      stopSending("no controller");
      return;
    }

    const state = readGamepadStateF310(gp);
    const ch = computeChannelsFromState(state).map(round3);

    renderTxChannels(ch);

    if (!channelsChanged(ch, lastSentCh)) return;
    lastSentCh = ch;

    if (!wsSendChannelsBinary(ch)) {
      stopSending("ws send failed");
      return;
    }
  }, SEND_PERIOD_MS);
}

function initIndexPageControls() {
  if (!isIndexPage()) return;

  buildTxChannelCards();
  updateSendButtonUi();

  sendToggleBtn.onclick = () => {
    if (sendingEnabled) stopSending("button");
    else startSending();
  };

  // Spacebar = STOP ONLY (never re-enables)
  window.addEventListener(
    "keydown",
    (e) => {
      const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "";
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      if (typing) return;

      if (e.code === "Space") {
        stopSending("spacebar");
        sendNeutralOnce();
        e.preventDefault();
      }
    },
    { passive: false }
  );
}

async function initIndexPage() {
  controlMap = await loadControlMap();
  deriveRuntimeFromControlMap();

  appendLog(logEl || debugEl, `Loaded controlmap.json (channels.count=${CHANNEL_COUNT})`);
  initIndexPageControls();
}

// ---------- config inputs page ----------
function buildUIFromControlMap() {
  if (!channelGridEl) return;

  channelGridEl.innerHTML = "";
  if (buttonGridEl) buttonGridEl.innerHTML = "";

  // AXES cards
  for (const src of AXES) {
    const selected = sourceToChannel.get(src.id) ?? null;
    const [rmin, rmax] = getRangeForSource(src);

    const card = document.createElement("div");
    card.className = "chanCard";
    card.innerHTML = `
      <div class="chanHeader">
        <div class="chanName">${src.label ?? src.id}</div>
        <div class="chanValue" id="aval_${src.id}">0.000</div>
      </div>
      <div class="barOuter">
        <div class="barCenter"></div>
        <div class="barFill" id="abar_${src.id}" style="width: 0%;"></div>
      </div>
      <div class="chanControls">
        <label for="asel_${src.id}">Map to:</label>
        <select id="asel_${src.id}">
          ${buildChannelOptions(selected, true)}
        </select>
      </div>
    `;

    channelGridEl.appendChild(card);

    const valueEl = card.querySelector(`#aval_${src.id}`);
    const barFillEl = card.querySelector(`#abar_${src.id}`);
    const selectEl = card.querySelector(`#asel_${src.id}`);

    selectEl.addEventListener("change", () => {
      const raw = selectEl.value;
      if (raw === "") {
        sourceToChannel.delete(src.id);
        appendLog(debugEl, `Mapping: ${src.id} -> None`);
      } else {
        const chNum = parseInt(raw, 10);
        if (Number.isFinite(chNum)) {
          sourceToChannel.set(src.id, chNum);
          appendLog(debugEl, `Mapping: ${src.id} -> C${chNum}`);
        }
      }
    });

    axisUiRefs[src.id] = {
      valueEl,
      barFillEl,
      selectEl,
      rangeMin: rmin,
      rangeMax: rmax,
    };
  }

  // BUTTON cards
  if (buttonGridEl) {
    for (const src of BUTTONS) {
      const selected = sourceToChannel.get(src.id) ?? null;

      const card = document.createElement("div");
      card.className = "chanCard";
      card.innerHTML = `
        <div class="chanHeader">
          <div class="chanName">${src.label ?? src.id}</div>
          <div class="pill" id="bpill_${src.id}">
            <span class="pillDot"></span>
            <span class="pillText" id="bpilltxt_${src.id}">OFF</span>
          </div>
        </div>
        <div class="chanControls">
          <label for="bsel_${src.id}">Map to:</label>
          <select id="bsel_${src.id}">
            ${buildChannelOptions(selected, true)}
          </select>
        </div>
        <div style="opacity:0.75; font-size:13px; margin-top: 6px;">Digital</div>
      `;

      buttonGridEl.appendChild(card);

      const pillEl = card.querySelector(`#bpill_${src.id}`);
      const textEl = card.querySelector(`#bpilltxt_${src.id}`);
      const selectEl = card.querySelector(`#bsel_${src.id}`);

      selectEl.addEventListener("change", () => {
        const raw = selectEl.value;
        if (raw === "") {
          sourceToChannel.delete(src.id);
          appendLog(debugEl, `Mapping: ${src.id} -> None`);
        } else {
          const chNum = parseInt(raw, 10);
          if (Number.isFinite(chNum)) {
            sourceToChannel.set(src.id, chNum);
            appendLog(debugEl, `Mapping: ${src.id} -> C${chNum}`);
          }
        }
      });

      buttonUiRefs[src.id] = { pillEl, textEl, selectEl };
    }
  }

  if (saveBtn) {
    saveBtn.onclick = () => {
      const list = [];

      for (const src of SOURCES) {
        const ch = sourceToChannel.get(src.id);
        if (typeof ch !== "number") continue;

        const xform = sourceToXform.get(src.id);
        const entry = { source: src.id, ch };
        if (xform) entry.xform = xform;
        list.push(entry);
      }

      list.sort((a, b) => a.ch - b.ch || a.source.localeCompare(b.source));
      controlMap.inputs.map_to_channels = list;

      const msg = {
        cmd: "save_input_mapping",
        data: { controlMapText: JSON.stringify(controlMap) },
      };

      if (!wsSendJson(msg)) {
        appendLog(debugEl, "Save failed: WebSocket not connected");
        return;
      }

      appendLog(debugEl, "TX: save_input_mapping (controlMapText)");
    };
  }
}

// gamepad live view (config page)
let gpRunning = false;
let gpRaf = 0;

function renderGamepadFrame() {
  if (!gpRunning) return;

  const gp = getFirstGamepad();
  if (!gp) {
    setStatus(gpStatusEl, "No controller detected", "#ff4444");
    gpRaf = requestAnimationFrame(renderGamepadFrame);
    return;
  }

  setStatus(gpStatusEl, `Controller: ${gp.id}`, "#00ff00");

  const state = readGamepadStateF310(gp);

  for (const src of AXES) {
    const ref = axisUiRefs[src.id];
    if (!ref) continue;

    const v = src.id in state.analog ? state.analog[src.id] : 0;
    ref.valueEl.textContent = Number(v).toFixed(3);
    const pct = axisValueToPercent(v, ref.rangeMin, ref.rangeMax);
    ref.barFillEl.style.width = `${pct.toFixed(1)}%`;
  }

  for (const src of BUTTONS) {
    const ref = buttonUiRefs[src.id];
    if (!ref) continue;

    const pressed = !!state.digital[src.id];
    ref.textEl.textContent = pressed ? "ON" : "OFF";
    if (pressed) ref.pillEl.classList.add("pillOn");
    else ref.pillEl.classList.remove("pillOn");
  }

  gpRaf = requestAnimationFrame(renderGamepadFrame);
}

async function initConfigInputsPage() {
  controlMap = await loadControlMap();
  deriveRuntimeFromControlMap();

  appendLog(debugEl, `Loaded controlmap.json (channels.count=${CHANNEL_COUNT}, sources=${SOURCES.length})`);

  buildUIFromControlMap();

  if (startBtn) {
    startBtn.onclick = () => {
      if (gpRunning) return;
      gpRunning = true;
      appendLog(debugEl, "Starting gamepad read loop...");
      renderGamepadFrame();
    };
  }

  if (stopBtn) {
    stopBtn.onclick = () => {
      gpRunning = false;
      if (gpRaf) cancelAnimationFrame(gpRaf);
      appendLog(debugEl, "Stopped.");
    };
  }

  window.addEventListener("gamepadconnected", (e) => {
    appendLog(debugEl, `gamepadconnected: index=${e.gamepad.index} id=${e.gamepad.id}`);
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    appendLog(debugEl, `gamepaddisconnected: index=${e.gamepad.index} id=${e.gamepad.id}`);
  });
}

// ---------- navigation highlight ----------
document.querySelectorAll(".nav a").forEach((link) => {
  if (link.pathname === location.pathname) link.style.background = "#444";
});

// ---------- websocket connection ----------
function shouldUseWebSocketOnThisPage() {
  return !!(pingBtn || sendToggleBtn || isConfigInputsPage() || saveBtn);
}

function connectWebSocketIfPresent() {
  if (!shouldUseWebSocketOnThisPage()) return;

  // avoid multiple concurrent sockets
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const protocol = location.protocol === "https:" ? "wss://" : "ws://";
  ws = new WebSocket(protocol + location.host + "/ws"); // FIXED: host (not "hot")
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    if (statusEl) setStatus(statusEl, "Connected", "#00ff00");
    appendLog(logEl || debugEl, "WebSocket connected");
  };

  ws.onclose = () => {
    if (statusEl) setStatus(statusEl, "Disconnected", "#ff4444");
    appendLog(logEl || debugEl, "WebSocket disconnected");
    setTimeout(connectWebSocketIfPresent, 2000);
  };

  ws.onerror = () => {
    appendLog(logEl || debugEl, "WebSocket error (state=" + (ws ? ws.readyState : "null") + ")");
  };

  ws.onmessage = (event) => {
    appendLog(logEl || debugEl, "RX: " + event.data);
  };

  if (pingBtn) {
    pingBtn.onclick = () => {
      if (!wsIsOpen()) {
        appendLog(logEl || debugEl, "WebSocket not connected");
        return;
      }
      const payload = { cmd: "ping" };
      wsSendJson(payload);
      appendLog(logEl || debugEl, "TX: " + JSON.stringify(payload));
    };
  }
}

// ---------- init ----------
connectWebSocketIfPresent();

if (isConfigInputsPage()) {
  initConfigInputsPage();
}

if (isIndexPage()) {
  initIndexPage();
}