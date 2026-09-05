// DOM refs for fast updates
const axisUiRefs = {}; // sourceId -> { valueEl, barFillEl, selectEl, rangeMin, rangeMax }
const buttonUiRefs = {}; // sourceId -> { pillEl, textEl, selectEl }

const mobileChannelGridEl = document.getElementById("mobileChannelGrid");
const mobileButtonGridEl = document.getElementById("mobileButtonGrid");

// Helper to check for channel mapping conflicts
function validateChannelMappings() {
  const conflictEl = document.getElementById("conflictError");
  const channelToSources = new Map();

  for (const src of SOURCES) {
    const ch = sourceToChannel.get(src.id);
    if (typeof ch !== "number") continue;

    if (!channelToSources.has(ch)) {
      channelToSources.set(ch, []);
    }
    channelToSources.get(ch).push(src);
  }

  const conflicts = [];
  for (const [ch, sources] of channelToSources.entries()) {
    // If there is more than 1 source mapped to a channel, we need to check if they are all from the same hardware domain
    if (sources.length > 1) {
      // Group sources by their hardware domain.
      // Gamepad inputs don't start with 'm_'
      // Mobile inputs start with 'm_'
      const hasGamepad = sources.some(s => !s.id.startsWith('m_') && !s.id.startsWith('mix_'));
      const hasMobile = sources.some(s => s.id.startsWith('m_'));
      
      // If a channel has BOTH a physical gamepad input AND a virtual mobile input mapped to it,
      // it is considered valid, because the user will only be using one device at a time.
      // However, if there are multiple mobile inputs, or multiple gamepad inputs mapped to it, it is a conflict.
      
      let gamepadCount = 0;
      let mobileCount = 0;
      let mixCount = 0;
      
      for (const s of sources) {
          if (s.id.startsWith('mix_')) mixCount++;
          else if (s.id.startsWith('m_')) mobileCount++;
          else gamepadCount++;
      }
      
      // It is a conflict if:
      // 1. There are multiple gamepad inputs mapped directly to it
      // 2. There are multiple mobile inputs mapped directly to it
      // 3. There are mixes involved alongside direct inputs
      if (gamepadCount > 1 || mobileCount > 1 || mixCount > 0) {
        conflicts.push({ channel: ch, sources });
      }
    }
  }

  conflicts.sort((a, b) => a.channel - b.channel);

  if (conflicts.length === 0) {
    if (conflictEl) {
      conflictEl.style.display = "none";
      conflictEl.innerHTML = "";
    }
    return true; // No conflicts
  }

  // Display error message explaining why save was blocked
  if (conflictEl) {
    let html = `<strong>Cannot Save:</strong> Multiple inputs are mapped directly to the same channel without a Mix. Combine inputs using a Mix if you want to control the same channel with multiple inputs.<ul style="margin: 8px 0 0 20px; padding: 0;">`;
    for (const c of conflicts) {
      const names = c.sources.map(s => `<b>${s.label ?? s.id}</b>`).join(", ");
      html += `<li style="margin-bottom: 4px;"><b>Channel ${c.channel} (C${c.channel}):</b> ${names}</li>`;
    }
    html += `</ul>`;
    conflictEl.innerHTML = html;
    conflictEl.style.display = "block";
  }

  return false; // Conflicts present
}

function buildUIFromControlMap() {
  if (!channelGridEl) return;

  // Clear all grids
  [channelGridEl, buttonGridEl, mobileChannelGridEl, mobileButtonGridEl].forEach(el => {
    if (el) el.innerHTML = "";
  });

  const gamepadAxes = AXES.filter(s => !s.id.startsWith('m_') && !s.id.startsWith('mix_'));
  const gamepadButtons = BUTTONS.filter(s => !s.id.startsWith('m_'));
  const mobileAxes = AXES.filter(s => s.id.startsWith('m_') && !s.id.startsWith('mix_'));
  const mobileButtons = BUTTONS.filter(s => s.id.startsWith('m_'));

  // AXES cards
  const buildAxisCard = (src, parentEl) => {
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

    parentEl.appendChild(card);

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
      validateChannelMappings();
    });

    axisUiRefs[src.id] = {
      valueEl,
      barFillEl,
      selectEl,
      rangeMin: rmin,
      rangeMax: rmax,
    };
  };

  // BUTTON cards
  const buildButtonCard = (src, parentEl) => {
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

      parentEl.appendChild(card);

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
        validateChannelMappings();
      });

      buttonUiRefs[src.id] = { pillEl, textEl, selectEl };
  };

  // Populate Gamepad Tab
  gamepadAxes.forEach(src => buildAxisCard(src, channelGridEl));
  gamepadButtons.forEach(src => buildButtonCard(src, buttonGridEl));
  // Populate Mobile Tab
  mobileAxes.forEach(src => buildAxisCard(src, mobileChannelGridEl));
  mobileButtons.forEach(src => buildButtonCard(src, mobileButtonGridEl));

  if (saveBtn) {
    saveBtn.onclick = () => {
      collectMixesData();

      if (!validateChannelMappings()) {
        appendLog(debugEl, "Save blocked: Multiple inputs are assigned to the same channel.");
        return;
      }

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

// ---------- Mixes UI ----------

function buildRawSourceOptions(selectedSourceId) {
  const rawSources = (controlMap?.inputs?.sources || []);
  return rawSources.map(src => {
    const sel = src.id === selectedSourceId ? 'selected' : '';
    return `<option value="${src.id}" ${sel}>${src.label || src.id}</option>`;
  }).join('');
}

function buildMixesUI() {
  const mixesGrid = document.getElementById('mixesGrid');
  if (!mixesGrid) return;

  mixesGrid.innerHTML = '';
  const mixes = controlMap?.inputs?.mixes || [];

  mixes.forEach(mix => {
    const card = document.createElement('div');
    card.className = 'mix-card';
    card.dataset.id = mix.id;

    const selectedChannel = sourceToChannel.get(mix.id) ?? null;
    const xf = sourceToXform.get(mix.id) || {};
    const isInverted = xf.invert || false;
    const deadband = xf.deadband || 0.0;
    const expo = xf.expo || 0.0;

    const positiveInputsHtml = (mix.positive || []).map(srcId => `
      <div class="mix-input-row">
        <select class="mix-source-select" data-group="positive">${buildRawSourceOptions(srcId)}</select>
        <button class="remove-input-btn">&minus;</button>
      </div>
    `).join('');

    const negativeInputsHtml = (mix.negative || []).map(srcId => `
      <div class="mix-input-row">
        <select class="mix-source-select" data-group="negative">${buildRawSourceOptions(srcId)}</select>
        <button class="remove-input-btn">&minus;</button>
      </div>
    `).join('');

    card.innerHTML = `
      <div class="mix-card-header">
        <input type="text" class="mix-label-input" value="${mix.label || mix.id}" placeholder="Mix Name">
        <button class="remove-btn">&times;</button>
      </div>
      <div class="mix-card-body">
        <div class="mix-group">
          <div class="mix-group-title">Positive Inputs (+)</div>
          ${positiveInputsHtml}
          <button class="add-input-btn" data-group="positive">+ Add</button>
        </div>
        <span style="font-size: 24px; font-weight: bold;">&minus;</span>
        <div class="mix-group">
          <div class="mix-group-title">Negative Inputs (-)</div>
          ${negativeInputsHtml}
          <button class="add-input-btn" data-group="negative">+ Add</button>
        </div>
      </div>
      <div class="mix-card-footer">
        <label>Map to Channel:</label>
        <select class="mix-channel-select">${buildChannelOptions(selectedChannel, true)}</select>
        <div class="invert-control">
            <input type="checkbox" id="invert_${mix.id}" class="mix-invert-cb" ${isInverted ? 'checked' : ''}>
            <label for="invert_${mix.id}">Invert</label>
        </div>
        <div class="xform-control">
            <label for="deadband_${mix.id}">Deadband:</label>
            <input type="number" id="deadband_${mix.id}" class="mix-deadband-input" value="${deadband.toFixed(2)}" min="0" max="1" step="0.01">
            <label for="expo_${mix.id}">Expo:</label>
            <input type="number" id="expo_${mix.id}" class="mix-expo-input" value="${expo.toFixed(2)}" min="0" max="1" step="0.01">
        </div>
      </div>
    `;
    mixesGrid.appendChild(card);

    // Event Listeners
    card.querySelector('.remove-btn').addEventListener('click', () => {
      collectMixesData();
      controlMap.inputs.mixes = controlMap.inputs.mixes.filter(m => m.id !== mix.id);
      // Also remove any channel mappings for this mix
      controlMap.inputs.map_to_channels = controlMap.inputs.map_to_channels.filter(m => m.source !== mix.id);
      rerenderAll();
    });

    card.querySelectorAll('.add-input-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.dataset.group;
        if (!mix[group]) mix[group] = [];
        mix[group].push((controlMap?.inputs?.sources[0]?.id) || ''); // Add first raw source as default
        buildMixesUI(); // Just re-render mixes
      });
    });

    card.querySelectorAll('.mix-input-row .remove-input-btn').forEach((btn, index) => {
      const group = btn.closest('.mix-group').querySelector('.add-input-btn').dataset.group;
      btn.addEventListener('click', () => {
        mix[group].splice(index, 1);
        buildMixesUI();
      });
    });

    const getOrCreateXform = (mixId) => {
        let xf = sourceToXform.get(mixId);
        if (!xf) {
            // If no xform exists, create a default one
            xf = defaultXformForKind('axis');
            sourceToXform.set(mixId, xf);
        }
        return xf;
    };

        // Channel mapping for the mix
    card.querySelector('.mix-channel-select').addEventListener('change', (e) => {
        const raw = e.target.value;
        if (raw === "") {
            sourceToChannel.delete(mix.id);
        } else {
            sourceToChannel.set(mix.id, parseInt(raw, 10));
        }
        validateChannelMappings();
    });

    // Invert checkbox for the mix
    card.querySelector('.mix-invert-cb').addEventListener('change', (e) => {
        const xf = getOrCreateXform(mix.id);
        xf.invert = e.target.checked;
    });

    // Deadband and Expo inputs
    card.querySelector('.mix-deadband-input').addEventListener('input', (e) => {
        const xf = getOrCreateXform(mix.id);
        xf.deadband = parseFloat(e.target.value) || 0;
    });
    card.querySelector('.mix-expo-input').addEventListener('input', (e) => {
        const xf = getOrCreateXform(mix.id);
        xf.expo = parseFloat(e.target.value) || 0;
    });
  });
}

function collectMixesData() {
    const newMixes = [];
    document.querySelectorAll('.mix-card').forEach(card => {
        const id = card.dataset.id;
        const label = card.querySelector('.mix-label-input').value;
        const positive = Array.from(card.querySelectorAll('.mix-source-select[data-group="positive"]')).map(sel => sel.value);
        const negative = Array.from(card.querySelectorAll('.mix-source-select[data-group="negative"]')).map(sel => sel.value);
        newMixes.push({ id, label, positive, negative });
    });
    controlMap.inputs.mixes = newMixes;
}

function rerenderAll() {
    deriveRuntimeFromControlMap();
    buildUIFromControlMap();
    buildMixesUI();
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

  // Only update gamepad sources
  for (const src of AXES.filter(s => !s.id.startsWith('m_'))) {
    const ref = axisUiRefs[src.id];
    if (!ref) continue;

    const v = src.id in state.analog ? state.analog[src.id] : 0;
    ref.valueEl.textContent = v.toFixed(3);
    const pct = rangeToPercent(v, ref.rangeMin, ref.rangeMax);
    ref.barFillEl.style.width = `${pct.toFixed(1)}%`;
  }

  for (const src of BUTTONS.filter(s => !s.id.startsWith('m_'))) {
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
  buildMixesUI();

  const addMixBtn = document.getElementById('addMixBtn');
  if (addMixBtn) {
    addMixBtn.onclick = () => {
      collectMixesData();
      if (!controlMap.inputs.mixes) controlMap.inputs.mixes = [];
      const newMix = {
        id: `mix_${Date.now()}`,
        label: `Mix ${controlMap.inputs.mixes.length + 1}`,
        positive: [],
        negative: []
      };
      controlMap.inputs.mixes.push(newMix);
      rerenderAll();
    };
  }

  // Populate profile dropdown
  const profileSelect = document.getElementById("profileSelect");
  if (profileSelect) {
      profileSelect.innerHTML = "";
      for (const name in profilesConfig.inputs) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          if (profilesConfig.inputs[name] === profilesConfig.active_input) {
              opt.selected = true;
          }
          profileSelect.appendChild(opt);
      }

      profileSelect.onchange = async () => {
          const newActiveName = profileSelect.value;
          const newActiveFile = profilesConfig.inputs[newActiveName];
          profilesConfig.active_input = newActiveFile;
          
          // Try to load the newly selected file
          try {
              const res = await fetch(newActiveFile + "?v=" + Date.now(), { cache: "no-store" });
              if (res.ok) {
                  controlMap = await res.json();
                  rerenderAll();
                  appendLog(debugEl, `Switched to profile: ${newActiveName}`);
              }
          } catch (e) {
              appendLog(debugEl, `Failed to switch to profile: ${newActiveName}`);
          }
      };
  }

  // Create New Profile
  const newProfileBtn = document.getElementById('newProfileBtn');
  if (newProfileBtn) {
      newProfileBtn.onclick = () => {
          const name = prompt("Enter a name for the new Input Profile:");
          if (!name || name.trim() === "") return;
          const safeName = name.replace(/[^a-zA-Z0-9 _-]/g, '');
          const filename = `/controlMap_${Date.now()}.json`;
          
          profilesConfig.inputs[safeName] = filename;
          profilesConfig.active_input = filename;
          
          // Re-populate and select
          profileSelect.innerHTML = "";
          for (const n in profilesConfig.inputs) {
              const opt = document.createElement('option');
              opt.value = n;
              opt.textContent = n;
              if (profilesConfig.inputs[n] === profilesConfig.active_input) opt.selected = true;
              profileSelect.appendChild(opt);
          }
          appendLog(debugEl, `Created new profile: ${safeName}. Click 'Save Mapping' to finalize.`);
      };
  }
  // Delete Profile
  const deleteProfileBtn = document.getElementById('deleteProfileBtn');
  if (deleteProfileBtn) {
      deleteProfileBtn.onclick = () => {
          const profileSelect = document.getElementById("profileSelect");
          if (!profileSelect) return;
          const activeName = profileSelect.value;
          
          if (activeName === "Default") {
              alert("Cannot delete the Default profile.");
              return;
          }
          
          if (confirm(`Are you sure you want to delete the profile "${activeName}"?`)) {
              const fileToDelete = profilesConfig.inputs[activeName];
              delete profilesConfig.inputs[activeName];
              
              // Fallback to Default
              profilesConfig.active_input = profilesConfig.inputs["Default"];
              
              // Tell ESP32 to update profiles registry, delete the file, and restart
              const pMsg = {
                  cmd: "save_profiles_config",
                  data: {
                      profilesConfigText: JSON.stringify(profilesConfig, null, 2),
                      setActiveInput: profilesConfig.active_input,
                      deleteFile: fileToDelete,
                      restart: true
                  }
              };
              if (wsSendJson(pMsg)) {
                  appendLog(debugEl, `Deleted profile ${activeName}. Restarting...`);
              }
          }
      };
  }

  const downloadProfileBtn = document.getElementById('downloadProfileBtn');
  if (downloadProfileBtn) {
    downloadProfileBtn.onclick = () => {
      collectMixesData();
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
      
      const exportMap = JSON.parse(JSON.stringify(controlMap));
      exportMap.inputs.map_to_channels = list;

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportMap, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "input_profile.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    };
  }

  // Profile Upload
  const uploadProfileBtn = document.getElementById('uploadProfileBtn');
  if (uploadProfileBtn) {
    uploadProfileBtn.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = readerEvent => {
          try {
            const content = readerEvent.target.result;
            const parsed = JSON.parse(content);
            if (parsed.inputs && parsed.inputs.sources) {
              controlMap = parsed;
              rerenderAll();
              appendLog(debugEl, "Profile loaded successfully! Click Save Mapping to ESP32 to apply.");
            } else {
              throw new Error("Invalid format");
            }
          } catch (err) {
            alert("Error parsing JSON file. Is this a valid input profile?");
          }
        };
        reader.readAsText(file);
      };
      input.click();
    };
  }

  // Tab switching logic
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanes = document.querySelectorAll('.tab-pane');
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      const tabId = button.getAttribute('data-tab');
      tabPanes.forEach(pane => pane.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
    });
  });

    // Override save button to include mixes
  if (saveBtn) {
    saveBtn.onclick = () => {
      collectMixesData();

      if (!validateChannelMappings()) {
        appendLog(debugEl, "Save blocked: Multiple inputs are assigned to the same channel.");
        return;
      }

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

      const profileSelect = document.getElementById("profileSelect");
      const activeFile = profileSelect ? profilesConfig.inputs[profileSelect.value] : "/controlMap.json";

      const msg = {
        cmd: "save_input_mapping",
        data: { 
            controlMapText: JSON.stringify(controlMap, null, 2),
            profileName: activeFile
        },
      };

      if (!wsSendJson(msg)) {
        appendLog(debugEl, "Save failed: WebSocket not connected");
        return;
      }
      
      // Also update profiles config so we know which file is currently active
      const pMsg = {
          cmd: "save_profiles_config",
          data: {
              profilesConfigText: JSON.stringify(profilesConfig, null, 2),
              setActiveInput: activeFile,
              restart: false
          }
      };
      wsSendJson(pMsg);

      appendLog(debugEl, `TX: saved mapping to ${activeFile}`);
    };
  }

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