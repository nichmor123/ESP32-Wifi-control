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

// ---------- existing websocket page behavior (index.html) ----------
function connectWebSocketIfPresent() {
  if (!statusEl) return; // not on that page

  const protocol = location.protocol === "https:" ? "wss://" : "ws://";
  ws = new WebSocket(protocol + location.host + "/ws");

  ws.onopen = () => {
    setStatus(statusEl, "Connected", "#00ff00");
    appendLog(logEl, "WebSocket connected");
  };

  ws.onclose = () => {
    setStatus(statusEl, "Disconnected", "#ff4444");
    appendLog(logEl, "WebSocket disconnected");
    setTimeout(connectWebSocketIfPresent, 2000);
  };

  ws.onerror = () => {
    appendLog(logEl, "WebSocket error");
  };

  ws.onmessage = (event) => {
    appendLog(logEl, "RX: " + event.data);
  };

  if (pingBtn) {
    pingBtn.addEventListener("click", () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        appendLog(logEl, "WebSocket not connected");
        return;
      }
      const payload = JSON.stringify({ cmd: "ping" });
      ws.send(payload);
      appendLog(logEl, "TX: " + payload);
    });
  }
}

// ---------- Logitech F310 (XInput / standard mapping) ----------
// axes[0]=LS X, axes[1]=LS Y, axes[2]=RS X, axes[3]=RS Y
// buttons[6]=LT analog (0..1), buttons[7]=RT analog (0..1)

// Analog controls you can map to RC channels.
const SOURCES = [
  { id: "rt",  name: "Right Trigger (RT)", type: "01" },  // 0..1
  { id: "lt",  name: "Left Trigger (LT)",  type: "01" },  // 0..1
  { id: "lsx", name: "Left Stick X",       type: "11" },  // -1..1
  { id: "lsy", name: "Left Stick Y",       type: "11" },  // -1..1
  { id: "rsx", name: "Right Stick X",      type: "11" },  // -1..1
  { id: "rsy", name: "Right Stick Y",      type: "11" },  // -1..1
];

// Digital buttons to display + map.
const BUTTONS = [
  { id: "a",     name: "A" },
  { id: "b",     name: "B" },
  { id: "x",     name: "X" },
  { id: "y",     name: "Y" },
  { id: "lb",    name: "LB" },
  { id: "rb",    name: "RB" },
  { id: "back",  name: "Back" },
  { id: "start", name: "Start" },
  { id: "ls",    name: "L Stick Click" },
  { id: "rs",    name: "R Stick Click" },
  { id: "dup",   name: "D-pad Up" },
  { id: "ddn",   name: "D-pad Down" },
  { id: "dlt",   name: "D-pad Left" },
  { id: "drt",   name: "D-pad Right" },
];

// How many RC channels exist on your ESP32 side (UI for now).
const CHANNEL_COUNT = 20;

// Mapping state (UI only for now)
let analogMapping = [
  { sourceId: "rt",  channel: 1 },
  { sourceId: "lt",  channel: 2 },
  { sourceId: "lsx", channel: 3 },
  { sourceId: "lsy", channel: 4 },
  { sourceId: "rsx", channel: 5 },
  { sourceId: "rsy", channel: 6 },
];

let buttonMapping = [
  { buttonId: "a",     channel: 7  },
  { buttonId: "b",     channel: 8  },
  { buttonId: "x",     channel: 9  },
  { buttonId: "y",     channel: 10 },
  { buttonId: "lb",    channel: 11 },
  { buttonId: "rb",    channel: 12 },
  { buttonId: "back",  channel: 13 },
  { buttonId: "start", channel: 14 },
  { buttonId: "ls",    channel: 15 },
  { buttonId: "rs",    channel: 16 },
  { buttonId: "dup",   channel: 17 },
  { buttonId: "ddn",   channel: 18 },
  { buttonId: "dlt",   channel: 19 },
  { buttonId: "drt",   channel: 20 },
];

// DOM refs for fast updates
const uiRefs = {};       // sourceId -> { valueEl, barFillEl, selectEl, sourceType }
const buttonRefs = {};   // buttonId -> { pillEl, textEl, selectEl }

// Standard mapping button indices:
// 0:A 1:B 2:X 3:Y 4:LB 5:RB 6:LT 7:RT 8:Back 9:Start 10:LS 11:RS 12:Up 13:Down 14:Left 15:Right
function readGamepadState(gp) {
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

function valueToPercent(sourceType, v) {
  if (sourceType === "11") return (clamp(v, -1, 1) + 1) * 50; // -1..1 => 0..100
  return clamp01(v) * 100; // 0..1 => 0..100
}

function formatValue(v) {
  return v.toFixed(3);
}

function getAnalogMappedChannel(sourceId) {
  const m = analogMapping.find(x => x.sourceId === sourceId);
  return m ? m.channel : null;
}

function setAnalogMappedChannel(sourceId, channelOrNull) {
  const idx = analogMapping.findIndex(x => x.sourceId === sourceId);
  if (channelOrNull == null) {
    if (idx >= 0) analogMapping.splice(idx, 1);
    return;
  }
  if (idx >= 0) analogMapping[idx].channel = channelOrNull;
  else analogMapping.push({ sourceId, channel: channelOrNull });
}

function getButtonMappedChannel(buttonId) {
  const m = buttonMapping.find(x => x.buttonId === buttonId);
  return m ? m.channel : null;
}

function setButtonMappedChannel(buttonId, channelOrNull) {
  const idx = buttonMapping.findIndex(x => x.buttonId === buttonId);
  if (channelOrNull == null) {
    if (idx >= 0) buttonMapping.splice(idx, 1);
    return;
  }
  if (idx >= 0) buttonMapping[idx].channel = channelOrNull;
  else buttonMapping.push({ buttonId, channel: channelOrNull });
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

function buildUIIfPresent() {
  if (!channelGridEl) return; // not on config_inputs.html

  channelGridEl.innerHTML = "";
  if (buttonGridEl) buttonGridEl.innerHTML = "";

  // Analog cards
  for (const src of SOURCES) {
    const selected = getAnalogMappedChannel(src.id) ?? 1;

    const card = document.createElement("div");
    card.className = "chanCard";
    card.innerHTML = `
      <div class="chanHeader">
        <div class="chanName">${src.name}</div>
        <div class="chanValue" id="val_${src.id}">0.000</div>
      </div>

      <div class="barOuter">
        <div class="barCenter"></div>
        <div class="barFill" id="bar_${src.id}" style="width: 0%;"></div>
      </div>

      <div class="chanControls">
        <label for="sel_${src.id}">Map to:</label>
        <select id="sel_${src.id}">
          ${buildChannelOptions(selected, false)}
        </select>
      </div>
    `;

    channelGridEl.appendChild(card);

    const valueEl = card.querySelector(`#val_${src.id}`);
    const barFillEl = card.querySelector(`#bar_${src.id}`);
    const selectEl = card.querySelector(`#sel_${src.id}`);

    selectEl.addEventListener("change", () => {
      const chNum = parseInt(selectEl.value, 10);
      setAnalogMappedChannel(src.id, Number.isFinite(chNum) ? chNum : null);
      appendLog(debugEl, `Analog mapping: ${src.id} -> C${chNum}`);
    });

    uiRefs[src.id] = { valueEl, barFillEl, selectEl, sourceType: src.type };
  }

  // Button cards (with ON/OFF pill + dropdown)
  if (buttonGridEl) {
    for (const btn of BUTTONS) {
      const selected = getButtonMappedChannel(btn.id); // may be null => None

      const card = document.createElement("div");
      card.className = "chanCard";
      card.innerHTML = `
        <div class="chanHeader">
          <div class="chanName">${btn.name}</div>
          <div class="pill" id="pill_${btn.id}">
            <span class="pillDot"></span>
            <span class="pillText" id="pilltxt_${btn.id}">OFF</span>
          </div>
        </div>

        <div class="chanControls">
          <label for="bsel_${btn.id}">Map to:</label>
          <select id="bsel_${btn.id}">
            ${buildChannelOptions(selected, true)}
          </select>
        </div>

        <div style="opacity:0.75; font-size:13px; margin-top: 6px;">Digital</div>
      `;

      buttonGridEl.appendChild(card);

      const pillEl = card.querySelector(`#pill_${btn.id}`);
      const textEl = card.querySelector(`#pilltxt_${btn.id}`);
      const selectEl = card.querySelector(`#bsel_${btn.id}`);

      selectEl.addEventListener("change", () => {
        const raw = selectEl.value;
        if (raw === "") {
          setButtonMappedChannel(btn.id, null);
          appendLog(debugEl, `Button mapping: ${btn.id} -> None`);
          return;
        }
        const chNum = parseInt(raw, 10);
        setButtonMappedChannel(btn.id, Number.isFinite(chNum) ? chNum : null);
        appendLog(debugEl, `Button mapping: ${btn.id} -> C${chNum}`);
      });

      buttonRefs[btn.id] = { pillEl, textEl, selectEl };
    }
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const payload = {
        cmd: "save_input_mapping",
        data: {
          analogMapping: analogMapping.slice().sort((a, b) => a.channel - b.channel),
          buttonMapping: buttonMapping.slice().sort((a, b) => a.channel - b.channel),
        }
      };
      appendLog(debugEl, "Save pressed (TODO). Would send:");
      appendLog(debugEl, JSON.stringify(payload));
    });
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

  const state = readGamepadState(gp);

  // Update analog UI
  for (const src of SOURCES) {
    const ref = uiRefs[src.id];
    if (!ref) continue;

    const v = state.analog[src.id] ?? 0;
    ref.valueEl.textContent = formatValue(v);

    const pct = valueToPercent(ref.sourceType, v);
    ref.barFillEl.style.width = `${pct.toFixed(1)}%`;
  }

  // Update button UI
  for (const btn of BUTTONS) {
    const ref = buttonRefs[btn.id];
    if (!ref) continue;

    const pressed = !!state.digital[btn.id];
    ref.textEl.textContent = pressed ? "ON" : "OFF";

    if (pressed) ref.pillEl.classList.add("pillOn");
    else ref.pillEl.classList.remove("pillOn");
  }

  gpRaf = requestAnimationFrame(renderGamepadFrame);
}

function startGamepadViewerIfPresent() {
  if (!gpStatusEl) return; // not on config_inputs.html

  buildUIIfPresent();

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
    const gp = e.gamepad;
    appendLog(debugEl, `gamepadconnected: index=${gp.index} id=${gp.id}`);
  });

  window.addEventListener("gamepaddisconnected", (e) => {
    const gp = e.gamepad;
    appendLog(debugEl, `gamepaddisconnected: index=${gp.index} id=${gp.id}`);
  });
}

// ---------- init ----------
connectWebSocketIfPresent();
startGamepadViewerIfPresent();