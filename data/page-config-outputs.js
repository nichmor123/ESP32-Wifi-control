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

async function initOutputConfigPage() {
    if (!isOutputConfigPage()) return;

    await loadOutputMap();
    renderOutputCards();

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

    const saveOutputsBtn = document.getElementById('saveOutputsBtn');
    saveOutputsBtn.addEventListener('click', () => {
        collectOutputData();
        const msg = {
            cmd: "save_output_mapping",
            data: { outputMapText: JSON.stringify(outputMap, null, 2) },
        };

        if (!wsSendJson(msg)) {
            appendLog(debugEl, "Save failed: WebSocket not connected");
            return;
        }
        appendLog(debugEl, "TX: save_output_mapping");
    });
}