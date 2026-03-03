let ws;

// Optional elements (exist on index.html)
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const pingBtn = document.getElementById("pingBtn");

// Config Inputs page elements (exist on config_inputs.html)
const gpStatusEl = document.getElementById("gpStatus");
const channelGridEl = document.getElementById("channelGrid");
const buttonGridEl = document.getElementById("buttonGrid");
const debugEl = document.getElementById("debug");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const saveBtn = document.getElementById("saveBtn");

function wsIsOpen() {
  return ws && ws.readyState === WebSocket.OPEN;
}

function wsSendJson(obj) {
  if (!wsIsOpen()) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

// ---------- shared helpers ----------
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

function isConfigInputsPage() {
  // This is reliable because those elements only exist on that page.
  return !!(gpStatusEl && channelGridEl);
}

// ---------- existing websocket page behavior (index.html) ----------
function connectWebSocketIfPresent() {
  // connect if we're on index OR config page
  if (!statusEl && !isConfigInputsPage()) return;

  const protocol = location.protocol === "https:" ? "wss://" : "ws://";
  ws = new WebSocket(protocol + location.host + "/ws");

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
    appendLog(logEl || debugEl, "WebSocket error");
  };

  ws.onmessage = (event) => {
    appendLog(logEl || debugEl, "RX: " + event.data);
  };

  if (pingBtn) {
    pingBtn.addEventListener("click", () => {
      if (!wsIsOpen()) {
        appendLog(logEl || debugEl, "WebSocket not connected");
        return;
      }
      const payload = { cmd: "ping" };
      wsSendJson(payload);
      appendLog(logEl || debugEl, "TX: " + JSON.stringify(payload));
    });
  }
}

// ---------- controlmap.json integration ----------
let controlMap = null;

// UI/runtime state derived from controlMap
let CHANNEL_COUNT = 8;
let SOURCES = [];   // {id, kind, label, range:[min,max]?}
let AXES = [];      // subset of SOURCES where kind==="axis"
let BUTTONS = [];   // subset where kind==="button"

// mapping state is stored in controlMap.inputs.map_to_channels
// but we keep quick lookup maps for UI updates
let sourceToChannel = new Map();  // sourceId -> channelNumber (1..N)
let sourceToXform = new Map();    // sourceId -> xform object (preserved)

// DOM refs for fast updates
const axisUiRefs = {};    // sourceId -> { valueEl, barFillEl, selectEl, rangeMin, rangeMax }
const buttonUiRefs = {};  // sourceId -> { pillEl, textEl, selectEl }

function defaultControlMapFallback() {
  // Minimal fallback so the UI still works if controlmap.json isn't present.
  return {
    version: 1,
    channels: { count: 20 },
    inputs: {
      device: { type: "gamepad", model: "Logitech F310", mode: "xinput" },
      sources: [
        { id: "rt",  kind: "axis",   label: "Right Trigger", range: [0.0, 1.0] },
        { id: "lt",  kind: "axis",   label: "Left Trigger",  range: [0.0, 1.0] },
        { id: "lsx", kind: "axis",   label: "Left Stick X",  range: [-1.0, 1.0] },
        { id: "lsy", kind: "axis",   label: "Left Stick Y",  range: [-1.0, 1.0] },
        { id: "rsx", kind: "axis",   label: "Right Stick X", range: [-1.0, 1.0] },
        { id: "rsy", kind: "axis",   label: "Right Stick Y", range: [-1.0, 1.0] },

        { id: "a",     kind: "button", label: "A" },
        { id: "b",     kind: "button", label: "B" },
        { id: "x",     kind: "button", label: "X" },
        { id: "y",     kind: "button", label: "Y" },
        { id: "lb",    kind: "button", label: "LB" },
        { id: "rb",    kind: "button", label: "RB" },
        { id: "back",  kind: "button", label: "Back" },
        { id: "start", kind: "button", label: "Start" },
        { id: "ls",    kind: "button", label: "Left Stick Click" },
        { id: "rs",    kind: "button", label: "Right Stick Click" },
        { id: "dup",   kind: "button", label: "D-pad Up" },
        { id: "ddn",   kind: "button", label: "D-pad Down" },
        { id: "dlt",   kind: "button", label: "D-pad Left" },
        { id: "drt",   kind: "button", label: "D-pad Right" }
      ],
      map_to_channels: [
        { source: "rt",  ch: 1, xform: { type: "linear", scale: 1.0, offset: 0.0 } },
        { source: "lt",  ch: 2, xform: { type: "linear", scale: 1.0, offset: 0.0 } },
        { source: "lsx", ch: 3, xform: { type: "expo", deadband: 0.04, expo: 0.25, invert: false } },
        { source: "lsy", ch: 4, xform: { type: "expo", deadband: 0.04, expo: 0.25, invert: true  } },
        { source: "rsx", ch: 5, xform: { type: "expo", deadband: 0.04, expo: 0.25, invert: false } },
        { source: "rsy", ch: 6, xform: { type: "expo", deadband: 0.04, expo: 0.25, invert: true  } },

        { source: "a",     ch: 7,  xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "b",     ch: 8,  xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "x",     ch: 9,  xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "y",     ch: 10, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "lb",    ch: 11, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "rb",    ch: 12, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "back",  ch: 13, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "start", ch: 14, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "ls",    ch: 15, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "rs",    ch: 16, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "dup",   ch: 17, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "ddn",   ch: 18, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "dlt",   ch: 19, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "drt",   ch: 20, xform: { type: "button", on: 1.0, off: 0.0 } }
      ]
    }
  };
}

async function loadControlMap() {
  // cache-bust so you don't chase ghosts during development
  const url = "/controlmap.json?v=" + Date.now();

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json;
  } catch (e) {
    appendLog(debugEl, `Failed to load /controlmap.json (${e.message}). Using fallback.`);
    return defaultControlMapFallback();
  }
}

function deriveRuntimeFromControlMap() {
  CHANNEL_COUNT = controlMap?.channels?.count ?? 8;

  SOURCES = Array.isArray(controlMap?.inputs?.sources) ? controlMap.inputs.sources : [];
  AXES = SOURCES.filter(s => s && s.kind === "axis");
  BUTTONS = SOURCES.filter(s => s && s.kind === "button");

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
    const sel = (selectedChannel == null) ? "selected" : "";
    opts.push(`<option value="" ${sel}>None</option>`);
  }
  for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
    const sel = (ch === selectedChannel) ? "selected" : "";
    opts.push(`<option value="${ch}" ${sel}>C${ch}</option>`);
  }
  return opts.join("");
}

function getRangeForSource(src) {
  // If range isn't specified, assume -1..1 for axis, 0..1 for button
  if (Array.isArray(src.range) && src.range.length === 2) {
    const a = Number(src.range[0]);
    const b = Number(src.range[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
  }
  if (src.kind === "axis") return [-1, 1];
  return [0, 1];
}

function axisValueToPercent(v, min, max) {
  // Map [min,max] to [0,100] (clamp).
  if (max === min) return 0;
  const t = (v - min) / (max - min);
  return clamp(t, 0, 1) * 100;
}

// ---------- Gamepad (F310 XInput) readout ----------
function readGamepadStateF310(gp) {
  // Standard mapping: axes[0..3], buttons[0..15]
  const axes = gp.axes || [];
  const b = gp.buttons || [];

  const analog = {
    // Triggers: standard mapping exposes as buttons[6],[7] values 0..1
    rt: clamp01(b[7]?.value ?? 0),
    lt: clamp01(b[6]?.value ?? 0),
    lsx: clamp(axes[0] ?? 0, -1, 1),
    lsy: clamp(axes[1] ?? 0, -1, 1),
    rsx: clamp(axes[2] ?? 0, -1, 1),
    rsy: clamp(axes[3] ?? 0, -1, 1),
  };

  const digital = {
    a: (b[0]?.pressed ?? false),
    b: (b[1]?.pressed ?? false),
    x: (b[2]?.pressed ?? false),
    y: (b[3]?.pressed ?? false),
    lb: (b[4]?.pressed ?? false),
    rb: (b[5]?.pressed ?? false),
    back: (b[8]?.pressed ?? false),
    start: (b[9]?.pressed ?? false),
    ls: (b[10]?.pressed ?? false),
    rs: (b[11]?.pressed ?? false),
    dup: (b[12]?.pressed ?? false),
    ddn: (b[13]?.pressed ?? false),
    dlt: (b[14]?.pressed ?? false),
    drt: (b[15]?.pressed ?? false),
  };

  return { analog, digital };
}

function buildUIFromControlMap() {
  if (!channelGridEl) return;

  channelGridEl.innerHTML = "";
  if (buttonGridEl) buttonGridEl.innerHTML = "";

  // Build AXIS cards
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

  // Build BUTTON cards
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
    // Rebuild inputs.map_to_channels from the current UI state,
    // preserving each source's existing xform if any.
    const list = [];

    for (const src of SOURCES) {
      const ch = sourceToChannel.get(src.id);
      if (typeof ch !== "number") continue;

      const xform = sourceToXform.get(src.id); // may be undefined
      const entry = { source: src.id, ch };
      if (xform) entry.xform = xform;
      list.push(entry);
    }

    list.sort((a, b) => (a.ch - b.ch) || a.source.localeCompare(b.source));
    controlMap.inputs.map_to_channels = list;

    // Recommended: send the control map as TEXT so the ESP doesn't have to
    // parse a huge nested object inside the websocket wrapper.
    const msg = {
      cmd: "save_input_mapping",
      data: { controlMapText: JSON.stringify(controlMap) }
    };

    if (!wsSendJson(msg)) {
      appendLog(debugEl, "Save failed: WebSocket not connected");
      return;
    }

    appendLog(debugEl, "TX: save_input_mapping (controlMapText)");
  };
}
}

// ---------- gamepad loop ----------
let gpRunning = false;
let gpRaf = 0;

function getFirstGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (gp) return gp;
  }
  return null;
}

function renderGamepadFrame() {
  if (!gpRunning) return;

  const gp = getFirstGamepad();
  if (!gp) {
    setStatus(gpStatusEl, "No controller detected", "#ff4444");
    gpRaf = requestAnimationFrame(renderGamepadFrame);
    return;
  }

  setStatus(gpStatusEl, `Controller: ${gp.id}`, "#00ff00");

  // For now, we read the F310 standard layout. Later you can make this table-driven too.
  const state = readGamepadStateF310(gp);

  // Update axes UI
  for (const src of AXES) {
    const ref = axisUiRefs[src.id];
    if (!ref) continue;

    let v = 0;
    // These IDs match our expected F310 ids. If you add more sources later,
    // you'll also add readout code (or make it table-driven).
    if (src.id in state.analog) v = state.analog[src.id];

    ref.valueEl.textContent = Number(v).toFixed(3);
    const pct = axisValueToPercent(v, ref.rangeMin, ref.rangeMax);
    ref.barFillEl.style.width = `${pct.toFixed(1)}%`;
  }

  // Update button UI
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
  // Load + build UI from controlmap.json
  controlMap = await loadControlMap();
  deriveRuntimeFromControlMap();

  appendLog(debugEl, `Loaded controlmap.json (channels.count=${CHANNEL_COUNT}, sources=${SOURCES.length})`);

  // Build UI
  buildUIFromControlMap();

  // Buttons
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      if (gpRunning) return;
      gpRunning = true;
      appendLog(debugEl, "Starting gamepad read loop...");
      renderGamepadFrame();
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      gpRunning = false;
      if (gpRaf) cancelAnimationFrame(gpRaf);
      appendLog(debugEl, "Stopped.");
    });
  }

  window.addEventListener("gamepadconnected", (e) => {
    appendLog(debugEl, `gamepadconnected: index=${e.gamepad.index} id=${e.gamepad.id}`);
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    appendLog(debugEl, `gamepaddisconnected: index=${e.gamepad.index} id=${e.gamepad.id}`);
  });
}

// ---------- init ----------
connectWebSocketIfPresent();

if (isConfigInputsPage()) {
  initConfigInputsPage();
}