// DOM refs for fast updates
const axisUiRefs = {}; // sourceId -> { valueEl, barFillEl, selectEl, rangeMin, rangeMax }
const buttonUiRefs = {}; // sourceId -> { pillEl, textEl, selectEl }

const mobileChannelGridEl = document.getElementById("mobileChannelGrid");
const mobileButtonGridEl = document.getElementById("mobileButtonGrid");
const keyboardButtonGridEl = document.getElementById("keyboardButtonGrid");

let gpRunning = false;
let gpRaf = 0;

function rerenderAll() {
  deriveRuntimeFromControlMap();
  buildUIFromControlMap();
}

function updateAxisUi(id, v) {
  const ref = axisUiRefs[id];
  if (!ref) return;
  const num = Number(v) || 0;
  ref.valueEl.textContent = num.toFixed(3);
  const pct = rangeToPercent(num, ref.rangeMin ?? -1, ref.rangeMax ?? 1);
  ref.barFillEl.style.width = `${pct.toFixed(1)}%`;
}

function updateButtonUi(id, pressed) {
  const ref = buttonUiRefs[id];
  if (!ref) return;
  if (pressed) {
    ref.pillEl.classList.add("pillOn");
    ref.textEl.textContent = "ON";
  } else {
    ref.pillEl.classList.remove("pillOn");
    ref.textEl.textContent = "OFF";
  }
}

function renderGamepadFrame() {
  if (!gpRunning) return;

  const gp = getFirstGamepad();
  if (gp) {
    setStatus(gpStatusEl, `Controller: ${gp.id}`, "#00ff00");
  } else {
    setStatus(gpStatusEl, "Keyboard & Controller Listener Active", "#00ff00");
  }

  const state = gp ? readGamepadStateF310(gp) : { analog: {}, digital: {} };
  const kbState = readKeyboardState();

  for (const id in state.analog) {
    updateAxisUi(id, state.analog[id]);
  }

  for (const id in state.digital) {
    updateButtonUi(id, state.digital[id]);
  }

  for (const id in kbState) {
    updateButtonUi(id, kbState[id]);
  }

  gpRaf = requestAnimationFrame(renderGamepadFrame);
}

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
      // Gamepad inputs don't start with 'm_' or 'k_'
      // Mobile inputs start with 'm_'
      // Keyboard inputs start with 'k_'
      
      let gamepadCount = 0;
      let mobileCount = 0;
      let keyboardCount = 0;
      let mixCount = 0;
      
      for (const s of sources) {
          if (s.id.startsWith('mix_')) mixCount++;
          else if (s.id.startsWith('m_')) mobileCount++;
          else if (s.id.startsWith('k_')) keyboardCount++;
          else gamepadCount++;
      }
      
      // It is a conflict if:
      // 1. There are multiple gamepad inputs mapped directly to it
      // 2. There are multiple mobile inputs mapped directly to it
      // 3. There are multiple keyboard inputs mapped directly to it
      // 4. There are mixes involved alongside direct inputs
      if (gamepadCount > 1 || mobileCount > 1 || keyboardCount > 1 || mixCount > 0) {
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
  [channelGridEl, buttonGridEl, keyboardButtonGridEl, mobileChannelGridEl, mobileButtonGridEl].forEach(el => {
    if (el) el.innerHTML = "";
  });

  const gamepadAxes = AXES.filter(s => !s.id.startsWith('m_') && !s.id.startsWith('k_') && !s.id.startsWith('mix_'));
  const gamepadButtons = BUTTONS.filter(s => !s.id.startsWith('m_') && !s.id.startsWith('k_'));
  const keyboardButtons = BUTTONS.filter(s => s.id.startsWith('k_'));
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
  // Populate Keyboard Tab
  keyboardButtons.forEach(src => buildButtonCard(src, keyboardButtonGridEl));
  // Populate Mobile Tab
  mobileAxes.forEach(src => buildAxisCard(src, mobileChannelGridEl));
  mobileButtons.forEach(src => buildButtonCard(src, mobileButtonGridEl));
}

// ---------- Mixes UI ----------

function initInputsPage() {
  buildUIFromControlMap();

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

            profileSelect.onchange = () => {
          // Simply update the variable tracking what we're looking at
          profilesConfig.active_input = profilesConfig.inputs[profileSelect.value];
          appendLog(debugEl, `Selected profile: ${profileSelect.value}. Click 'Load' to view it, or 'Save Mapping' to overwrite it.`);
      };
  }

  // Load Profile Button
  const loadProfileBtn = document.getElementById("loadProfileBtn");
  if (loadProfileBtn) {
      loadProfileBtn.onclick = async () => {
          if (!profileSelect) return;
          const newActiveName = profileSelect.value;
          const newActiveFile = profilesConfig.inputs[newActiveName];
          
          try {
              const res = await fetch(newActiveFile + "?v=" + Date.now(), { cache: "no-store" });
              if (res.ok) {
                  controlMap = await res.json();
                  rerenderAll();
                  appendLog(debugEl, `Loaded profile: ${newActiveName}. Click 'Save Mapping' to apply changes to ESP32.`);
              }
          } catch (e) {
              appendLog(debugEl, `Failed to load profile: ${newActiveName}`);
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
          const filename = `/config/controlMap_${Date.now()}.json`;
          
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
      if (!validateChannelMappings()) {
        appendLog(debugEl, "Save blocked: Multiple inputs are assigned to the same channel.");
        return;
      }

      updateControlMapToChannels();

      const profileSelect = document.getElementById("profileSelect");
      const activeFile = profileSelect ? profilesConfig.inputs[profileSelect.value] : "/config/controlMap.json";

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