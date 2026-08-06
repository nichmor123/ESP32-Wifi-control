let batteryConfig = null;

const E24_VALUES = [
    1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1
];

function getNextStandardResistor(value) {
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const normalizedValue = value / magnitude;
    let bestFit = E24_VALUES[E24_VALUES.length - 1] * magnitude;
    for (const r of E24_VALUES) {
        if (r >= normalizedValue) {
            bestFit = r * magnitude;
            break;
        }
    }
    return bestFit;
}

function updateResistorDisplay() {
    const chemSelect = document.getElementById('chem-select');
    const cellCountInput = document.getElementById('cell-count-input');
    const resistorInfoEl = document.getElementById('resistor-info');
    const overrideCheckbox = document.getElementById('override-resistors-cb');
    const manualSection = document.getElementById('manual-resistors-section');
    const r1Input = document.getElementById('r1-input');
    const r2Input = document.getElementById('r2-input');
    const overrideWarningEl = document.getElementById('override-warning');

    const cells = parseInt(cellCountInput.value, 10);
    const vMaxPerCell = chemSelect.value === 'lipo' ? 4.2 : 3.65;
    const vBattMax = cells * vMaxPerCell;

    let r1, r2;

    if (overrideCheckbox.checked) {
        // Manual override mode
        manualSection.style.display = 'block';
        resistorInfoEl.style.display = 'none'; // Hide the recommendation
        r1 = parseFloat(r1Input.value);
        r2 = parseFloat(r2Input.value);

        if (r1 > 0 && r2 > 0) {
            const actualVout = vBattMax * (r2 / (r1 + r2));
            const totalCurrent = vBattMax / (r1 + r2); // in Amps
            const powerR1 = Math.pow(totalCurrent, 2) * r1; // in Watts
            const powerR2 = Math.pow(totalCurrent, 2) * r2; // in Watts
            const maxPower = Math.max(powerR1, powerR2);

            const warnings = [];

            if (actualVout > 3.3) {
                warnings.push(`<strong>DANGER:</strong> With these values, the max voltage at the ADC pin will be ~${actualVout.toFixed(2)}V, which <strong>EXCEEDS</strong> the 3.3V limit. This will likely damage your ESP32.`);
            } else if (actualVout > 3.1) { // Warning threshold
                warnings.push(`<strong>Warning:</strong> With these values, the max voltage at the ADC pin will be ~${actualVout.toFixed(2)}V, which is very close to the 3.3V limit. This is risky.`);
            }

            if (maxPower > 0.125) { // Warning if > 1/8W
                warnings.push(`<strong>Power Warning:</strong> These resistors will dissipate up to ${maxPower.toFixed(3)}W. Ensure they are rated for at least 1/4W to prevent overheating.`);
            }

            if (warnings.length > 0) {
                overrideWarningEl.innerHTML = warnings.join('<br><br>');
                overrideWarningEl.style.display = 'block';
            } else {
                overrideWarningEl.style.display = 'none';
            }
        } else {
            overrideWarningEl.style.display = 'none';
        }
    } else {
        // Automatic calculation mode
        manualSection.style.display = 'none';
        resistorInfoEl.style.display = 'block';
        overrideWarningEl.style.display = 'none';

        const vOutMax = 3.0; // Target voltage for ADC, with a 0.3V safety margin from 3.3V
        const r2_calc = 10000; // Fix R2 at a common value of 10kΩ
        const r1_calculated = r2_calc * (vBattMax / vOutMax - 1);
        const r1_standard = getNextStandardResistor(r1_calculated);
        const actualVout = vBattMax * (r2_calc / (r1_standard + r2_calc));

        resistorInfoEl.innerHTML = `
            <p>For a <strong>${cells}S ${chemSelect.value.toUpperCase()}</strong> battery (max ${vBattMax.toFixed(1)}V), we recommend the following voltage divider:</p>
            <ul>
                <li><strong>Resistor 1 (R1):</strong> ${r1_standard / 1000}kΩ</li>
                <li><strong>Resistor 2 (R2):</strong> ${r2_calc / 1000}kΩ</li>
            </ul>
            <p><strong>Wiring:</strong></p>
            <pre> (BAT+) --- [ R1: ${r1_standard / 1000}kΩ ] --- (ADC PIN) --- [ R2: ${r2_calc / 1000}kΩ ] --- (GND)</pre>
            <p>This will scale your max battery voltage down to ~${actualVout.toFixed(2)}V, which is safe for the ESP32's ADC pin.</p>
        `;
        r1 = r1_standard;
        r2 = r2_calc;
    }

    return { r1, r2 };
}

async function loadBatteryConfig() {
    try {
        const res = await fetch('/battery.json?v=' + Date.now());
        if (!res.ok) throw new Error('Not found');
        batteryConfig = await res.json();

        document.getElementById('enable-cb').checked = batteryConfig.enabled || false;
        document.getElementById('chem-select').value = batteryConfig.chemistry || 'lipo';
        document.getElementById('cell-count-input').value = batteryConfig.cells || 3;
        document.getElementById('pin-input').value = batteryConfig.pin || '';
        // Note: We don't enable override by default, user must choose to do so.
        // The R1/R2 values will be populated on first UI update if they exist.
    } catch (e) {
        batteryConfig = { version: 1, enabled: false };
        appendLog(debugEl, 'No existing battery config found.');
    }
}

function initBatteryPage() {
    if (!isBatteryPage()) return;

    const overrideCheckbox = document.getElementById('override-resistors-cb');
    const r1Input = document.getElementById('r1-input');
    const r2Input = document.getElementById('r2-input');
    const enableCheckbox = document.getElementById('enable-cb');
    const chemSelect = document.getElementById('chem-select');
    const cellCountInput = document.getElementById('cell-count-input');
    const riskCheckbox = document.getElementById('risk-ack-cb');
    const saveButton = document.getElementById('saveBatteryBtn');

    const updateUI = () => {
        updateResistorDisplay();
        saveButton.disabled = !riskCheckbox.checked;
    };

    chemSelect.addEventListener('change', updateUI);
    cellCountInput.addEventListener('input', updateUI);
    overrideCheckbox.addEventListener('change', updateUI);
    r1Input.addEventListener('input', updateUI);
    r2Input.addEventListener('input', updateUI);
    riskCheckbox.addEventListener('change', updateUI);
    enableCheckbox.addEventListener('change', updateUI);

    saveButton.addEventListener('click', () => {
        const pin = parseInt(document.getElementById('pin-input').value, 10);
        if (!pin || pin < 0) {
            alert('Please enter a valid GPIO pin number.');
            return;
        }

        const { r1, r2 } = updateResistorDisplay();

        const newConfig = {
            version: 1,
            enabled: enableCheckbox.checked,
            pin: pin,
            chemistry: chemSelect.value,
            cells: parseInt(cellCountInput.value, 10),
            r1: r1,
            r2: r2,
            vRef: 3.3, // Standard ESP32 Vref
            adcResolution: 4095 // 12-bit ADC
        };

        const msg = {
            cmd: "save_battery_config",
            data: { batteryConfigText: JSON.stringify(newConfig, null, 2) },
        };

        if (!wsSendJson(msg)) {
            appendLog(debugEl, "Save failed: WebSocket not connected");
            return;
        }
        appendLog(debugEl, "TX: save_battery_config");
        alert('Battery configuration saved! The ESP32 will now restart to apply changes.');
    });

    loadBatteryConfig().then(() => {
        updateUI();
    });
}