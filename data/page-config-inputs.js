// DOM refs for fast updates
const axisUiRefs = {}; // sourceId -> { valueEl, barFillEl, selectEl, rangeMin, rangeMax }
const buttonUiRefs = {}; // sourceId -> { pillEl, textEl, selectEl }

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
        data: { controlMapText: JSON.stringify(controlMap, null, 2) },
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
    ref.valueEl.textContent = v.toFixed(3);
    const pct = rangeToPercent(v, ref.rangeMin, ref.rangeMax);
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

function initConfigInputsPage() {
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