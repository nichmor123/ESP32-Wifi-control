// gamepad live view & test loop for mixes
let gpRunning = false;
let gpRaf = 0;

function renderMixesFrame() {
  if (!gpRunning) return;

  const gp = getFirstGamepad();
  if (gp) {
    setStatus(gpStatusEl, `Controller: ${gp.id}`, "#00ff00");
  } else {
    setStatus(gpStatusEl, "No controller detected (Mixes computed from default inputs)", "#ffaa00");
  }

  // Read current raw input values from connected gamepad or default 0 state
  const state = gp ? readGamepadStateF310(gp) : { analog: {}, digital: {} };

  // Calculate calculated mix values using controlMap logic
  const mixes = controlMap?.inputs?.mixes || [];
  mixes.forEach(mix => {
    let positiveSum = 0;
    (mix.positive || []).forEach(srcId => {
      if (srcId in state.analog) positiveSum += state.analog[srcId];
      else if (srcId in state.digital) positiveSum += state.digital[srcId] ? 1.0 : 0.0;
    });

    let negativeSum = 0;
    (mix.negative || []).forEach(srcId => {
      if (srcId in state.analog) negativeSum += state.analog[srcId];
      else if (srcId in state.digital) negativeSum += state.digital[srcId] ? 1.0 : 0.0;
    });

    let rawVal = positiveSum - negativeSum;
    // clamp raw mix value to [-1, 1]
    rawVal = Math.max(-1, Math.min(1, rawVal));

    // Update mix card visual output if elements exist
    const card = document.querySelector(`.mix-card[data-id="${mix.id}"]`);
    if (card) {
      let valDisplay = card.querySelector('.mix-val-display');
      let barFill = card.querySelector('.mix-bar-fill');
      if (!valDisplay) {
        const header = card.querySelector('.mix-card-header');
        if (header) {
          const previewDiv = document.createElement('div');
          previewDiv.className = 'mix-preview';
          previewDiv.style.cssText = 'display:flex; align-items:center; gap:8px; margin-left: auto; margin-right: 8px;';
          previewDiv.innerHTML = `
            <span class="mix-val-display" style="font-family: monospace; font-size: 13px; min-width: 45px;">0.000</span>
            <div class="barOuter" style="width: 80px; height: 12px;">
              <div class="barCenter"></div>
              <div class="barFill mix-bar-fill" style="width: 0%;"></div>
            </div>
          `;
          header.insertBefore(previewDiv, card.querySelector('.remove-btn'));
          valDisplay = previewDiv.querySelector('.mix-val-display');
          barFill = previewDiv.querySelector('.mix-bar-fill');
        }
      }

      if (valDisplay) valDisplay.textContent = rawVal.toFixed(3);
      if (barFill) {
        const pct = rangeToPercent(rawVal, -1, 1);
        barFill.style.width = `${pct.toFixed(1)}%`;
      }
    }
  });

  gpRaf = requestAnimationFrame(renderMixesFrame);
}// ---------- Mixes UI ----------

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
      rerenderMixesAll();
    });

        card.querySelectorAll('.add-input-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            collectMixesData();
            const group = btn.dataset.group;
            const targetMix = (controlMap?.inputs?.mixes || []).find(m => m.id === mix.id);
            if (targetMix) {
              if (!targetMix[group]) targetMix[group] = [];
              targetMix[group].push((controlMap?.inputs?.sources[0]?.id) || '');
            }
            buildMixesUI();
          });
        });

        card.querySelectorAll('.mix-group').forEach(groupEl => {
          const addBtn = groupEl.querySelector('.add-input-btn');
          const group = addBtn ? addBtn.dataset.group : null;
          if (!group) return;
          groupEl.querySelectorAll('.remove-input-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => {
              collectMixesData();
              const targetMix = (controlMap?.inputs?.mixes || []).find(m => m.id === mix.id);
              if (targetMix && targetMix[group]) {
                targetMix[group].splice(index, 1);
              }
              buildMixesUI();
            });
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

function rerenderMixesAll() {
    deriveRuntimeFromControlMap();
    buildMixesUI();
}

function initMixesPage() {
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
      rerenderMixesAll();
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

      profileSelect.onchange = () => {
          profilesConfig.active_input = profilesConfig.inputs[profileSelect.value];
          appendLog(debugEl, `Selected profile: ${profileSelect.value}. Click 'Load' to view it, or 'Save Mixes' to overwrite it.`);
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
                  rerenderMixesAll();
                  appendLog(debugEl, `Loaded profile: ${newActiveName}. Click 'Save Mixes' to apply changes to ESP32.`);
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
          appendLog(debugEl, `Created new profile: ${safeName}. Click 'Save Mixes' to finalize.`);
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
              
              profilesConfig.active_input = profilesConfig.inputs["Default"];
              
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
      const exportMap = JSON.parse(JSON.stringify(controlMap));
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
              rerenderMixesAll();
              appendLog(debugEl, "Profile loaded successfully! Click Save Mixes to ESP32 to apply.");
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

    if (saveBtn) {
    saveBtn.onclick = () => {
      collectMixesData();
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
      
      const pMsg = {
          cmd: "save_profiles_config",
          data: {
              profilesConfigText: JSON.stringify(profilesConfig, null, 2),
              setActiveInput: activeFile,
              restart: false
          }
      };
      wsSendJson(pMsg);

      appendLog(debugEl, `TX: saved mixes to ${activeFile}`);
    };
  }

    if (startBtn) {
    startBtn.onclick = () => {
      if (gpRunning) return;
      gpRunning = true;
      appendLog(debugEl, "Starting mix testing loop...");
      renderMixesFrame();
    };
  }

  if (stopBtn) {
    stopBtn.onclick = () => {
      gpRunning = false;
      if (gpRaf) cancelAnimationFrame(gpRaf);
      appendLog(debugEl, "Stopped.");
    };
  }
}