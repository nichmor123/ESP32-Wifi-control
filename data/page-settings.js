let wifiConfig = { ssid: "ESP32Controller", password: "12345678" };

async function loadWifiConfig() {
    const url = "/wifi.json?v=" + Date.now();
    try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        wifiConfig = await res.json();
    } catch (e) {
        appendLog(debugEl, `Failed to load /wifi.json (${e.message}). Using defaults.`);
    }

    const ssidInput = document.getElementById("ssidInput");
    const passwordInput = document.getElementById("passwordInput");
    const confirmPasswordInput = document.getElementById("confirmPasswordInput");

    if (ssidInput) ssidInput.value = wifiConfig.ssid || "";
    if (passwordInput) passwordInput.value = wifiConfig.password || "";
    if (confirmPasswordInput) confirmPasswordInput.value = wifiConfig.password || "";
}

function initSettingsPage() {
    if (!isSettingsPage()) return;
    loadWifiConfig();

    const saveSettingsBtn = document.getElementById("saveSettingsBtn");
    const ssidInput = document.getElementById("ssidInput");
    const passwordInput = document.getElementById("passwordInput");
    const confirmPasswordInput = document.getElementById("confirmPasswordInput");
    const errorBox = document.getElementById("settingsError");

    saveSettingsBtn.addEventListener("click", () => {
        const ssid = ssidInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (errorBox) {
            errorBox.style.display = "none";
            errorBox.innerHTML = "";
        }

        if (ssid.length < 1 || ssid.length > 32) {
            if (errorBox) {
                errorBox.innerHTML = "<strong>Error:</strong> SSID must be between 1 and 32 characters.";
                errorBox.style.display = "block";
            }
            return;
        }

        if (password.length > 0 && password.length < 8) {
            if (errorBox) {
                errorBox.innerHTML = "<strong>Error:</strong> Password must be at least 8 characters long, or leave blank for open network.";
                errorBox.style.display = "block";
            }
            return;
        }
        
        if (password !== confirmPassword) {
            if (errorBox) {
                errorBox.innerHTML = "<strong>Error:</strong> Passwords do not match.";
                errorBox.style.display = "block";
            }
            return;
        }

        wifiConfig.ssid = ssid;
        wifiConfig.password = password;

        const msg = {
            cmd: "save_wifi_config",
            data: { wifiConfigText: JSON.stringify(wifiConfig, null, 2) },
        };

        if (!wsSendJson(msg)) {
            appendLog(debugEl, "Save failed: WebSocket not connected");
            return;
        }

        appendLog(debugEl, "TX: save_wifi_config");
        appendLog(debugEl, "Restarting ESP to apply new Wi-Fi settings...");
    });
}