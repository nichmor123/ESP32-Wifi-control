let outputMap = null;

async function loadOutputMap() {
    const url = "/outputMap.json?v=" + Date.now();
    try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        outputMap = await res.json();
    } catch (e) {
        appendLog(debugEl, `Failed to load /outputMap.json (${e.message}). Using default.`);
        outputMap = { version: 1, outputs: [] };
    }
    return outputMap;
}

function renderOutputCards() {
    if (!outputGridEl) return;
    outputGridEl.innerHTML = "";
    outputMap.outputs.forEach(renderOutputCard);
}

function renderOutputCard(output) {
    const card = document.createElement("div");
    card.className = "chanCard output-card";
    card.dataset.id = output.id;

    const isServo = output.type === 'servo';

    card.innerHTML = `
        <div class="card-header">
            <span class="card-title">${output.type.toUpperCase()}</span>
            <button class="remove-btn" data-id="${output.id}">&times;</button>
        </div>
        <div class="form-grid">
            <label>Type:</label>
            <select class="type-select">
                <option value="esc" ${!isServo ? 'selected' : ''}>ESC (Brushed)</option>
                <option value="servo" ${isServo ? 'selected' : ''}>Servo</option>
            </select>

            <label>Source Channel:</label>
            <select class="channel-select">${buildChannelOptions(output.sourceChannel, false)}</select>

            <label>PWM Pin:</label>
            <input type="number" class="pin-input" value="${output.pins?.pwm || ''}" placeholder="GPIO #">

            <label>Input Range:</label>
            <div class="range-inputs">
                <input type="number" class="input-range-min" value="${output.inputRange[0]}" step="0.1">
                <span>to</span>
                <input type="number" class="input-range-max" value="${output.inputRange[1]}" step="0.1">
            </div>

            <label>Output Range:</label>
            <div class="range-inputs">
                <input type="number" class="output-range-min" value="${output.outputRange[0]}">
                <span>to</span>
                <input type="number" class="output-range-max" value="${output.outputRange[1]}">
            </div>
        </div>
    `;

    outputGridEl.appendChild(card);

    // Add event listeners
    card.querySelector('.remove-btn').addEventListener('click', () => {
        outputMap.outputs = outputMap.outputs.filter(o => o.id !== output.id);
        renderOutputCards();
    });

    card.querySelector('.type-select').addEventListener('change', (e) => {
        const newType = e.target.value;
        output.type = newType;
        // When changing type, reset ranges to sensible defaults
        if (newType === 'servo') {
            output.inputRange = [0, 1];
            output.outputRange = [0, 180];
        } else { // esc
            output.inputRange = [-1, 1];
            output.outputRange = [-100, 100];
        }
        renderOutputCards(); // Re-render to show/hide fields and update defaults
    });
}

function collectOutputData() {
    const newOutputs = [];
    document.querySelectorAll('.output-card').forEach(card => {
        const id = card.dataset.id;
        const type = card.querySelector('.type-select').value;
        const sourceChannel = parseInt(card.querySelector('.channel-select').value, 10);
        const pwmPin = parseInt(card.querySelector('.pin-input').value, 10);
        const inMin = parseFloat(card.querySelector('.input-range-min').value);
        const inMax = parseFloat(card.querySelector('.input-range-max').value);
        const outMin = parseFloat(card.querySelector('.output-range-min').value);
        const outMax = parseFloat(card.querySelector('.output-range-max').value);

        newOutputs.push({
            id,
            type,
            sourceChannel,
            inputRange: [inMin, inMax],
            outputRange: [outMin, outMax],
            pins: { pwm: pwmPin }
        });
    });
    outputMap.outputs = newOutputs;
}

async function initOutputsPage() {
    if (!isOutputsPage()) return;

    await loadOutputMap();
    renderOutputCards();

    // Populate profile dropdown
    const profileSelect = document.getElementById("profileSelect");
    if (profileSelect) {
        profileSelect.innerHTML = "";
        for (const name in profilesConfig.outputs) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (profilesConfig.outputs[name] === profilesConfig.active_output) {
                opt.selected = true;
            }
            profileSelect.appendChild(opt);
        }

                profileSelect.onchange = () => {
            profilesConfig.active_output = profilesConfig.outputs[profileSelect.value];
            appendLog(debugEl, `Selected profile: ${profileSelect.value}. Click 'Load' to view it, or 'Save Outputs' to overwrite it.`);
        };
    }

    // Load Profile Button
    const loadOutputProfileBtn = document.getElementById("loadOutputProfileBtn");
    if (loadOutputProfileBtn) {
        loadOutputProfileBtn.onclick = async () => {
            if (!profileSelect) return;
            const newActiveName = profileSelect.value;
            const newActiveFile = profilesConfig.outputs[newActiveName];
            
            try {
                const res = await fetch(newActiveFile + "?v=" + Date.now(), { cache: "no-store" });
                if (res.ok) {
                    outputMap = await res.json();
                    renderOutputCards();
                    appendLog(debugEl, `Loaded profile: ${newActiveName}. Click 'Save Outputs' to apply changes to ESP32.`);
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
            const name = prompt("Enter a name for the new Output Profile:");
            if (!name || name.trim() === "") return;
            const safeName = name.replace(/[^a-zA-Z0-9 _-]/g, '');
            const filename = `/outputMap_${Date.now()}.json`;
            
            profilesConfig.outputs[safeName] = filename;
            profilesConfig.active_output = filename;
            
            // Re-populate and select
            profileSelect.innerHTML = "";
            for (const n in profilesConfig.outputs) {
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = n;
                if (profilesConfig.outputs[n] === profilesConfig.active_output) opt.selected = true;
                profileSelect.appendChild(opt);
            }
            appendLog(debugEl, `Created new profile: ${safeName}. Click 'Save Outputs' to finalize.`);
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
                const fileToDelete = profilesConfig.outputs[activeName];
                delete profilesConfig.outputs[activeName];
                
                // Fallback to Default
                profilesConfig.active_output = profilesConfig.outputs["Default"];
                
                // Tell ESP32 to update profiles registry, delete the file, and restart
                const pMsg = {
                    cmd: "save_profiles_config",
                    data: {
                        profilesConfigText: JSON.stringify(profilesConfig, null, 2),
                        setActiveOutput: profilesConfig.active_output,
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

    const addOutputBtn = document.getElementById('addOutputBtn');
    addOutputBtn.addEventListener('click', () => {
        const newOutput = {
            id: `output_${Date.now()}`,
            type: 'esc',
            sourceChannel: 1,
            inputRange: [-1, 1],
            outputRange: [-100, 100],
            pins: { pwm: '' }
        };
        outputMap.outputs.push(newOutput);
        renderOutputCard(newOutput);
    });

    // Profile Download
    const downloadProfileBtn = document.getElementById('downloadOutputProfileBtn');
    if (downloadProfileBtn) {
        downloadProfileBtn.addEventListener('click', () => {
            collectOutputData();
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(outputMap, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "output_profile.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        });
    }

    // Profile Upload
    const uploadProfileBtn = document.getElementById('uploadOutputProfileBtn');
    if (uploadProfileBtn) {
        uploadProfileBtn.addEventListener('click', () => {
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
                        if (parsed.outputs) {
                            outputMap = parsed;
                            renderOutputCards();
                            appendLog(debugEl, "Output Profile loaded! Click Save Outputs to ESP32 to apply.");
                        } else {
                            throw new Error("Invalid format");
                        }
                    } catch (err) {
                        alert("Error parsing JSON file. Is this a valid output profile?");
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });
    }

        const saveOutputsBtn = document.getElementById('saveOutputsBtn');
    saveOutputsBtn.addEventListener('click', () => {
        collectOutputData();

        const profileSelect = document.getElementById("profileSelect");
        const activeFile = profileSelect ? profilesConfig.outputs[profileSelect.value] : "/outputMap.json";

        const msg = {
            cmd: "save_output_mapping",
            data: { 
                outputMapText: JSON.stringify(outputMap, null, 2),
                profileName: activeFile
            },
        };

        if (!wsSendJson(msg)) {
            appendLog(debugEl, "Save failed: WebSocket not connected");
            return;
        }

        // Update profiles config and tell backend to map this as active and restart
        const pMsg = {
            cmd: "save_profiles_config",
            data: {
                profilesConfigText: JSON.stringify(profilesConfig, null, 2),
                setActiveOutput: activeFile,
                restart: true
            }
        };
        wsSendJson(pMsg);

        appendLog(debugEl, `TX: saved mapping to ${activeFile}`);
    });
}