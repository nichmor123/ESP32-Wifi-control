let wifiConfig = { ssid: "ESP32Controller", password: "12345678" };

async function loadWifiConfig() {
    const url = "/config/wifi.json?v=" + Date.now();
    try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        wifiConfig = await res.json();
    } catch (e) {
        appendLog(debugEl, `Failed to load /wifi.json (${e.message}). Using defaults.`);
    }

    const hostnameInput = document.getElementById("hostnameInput");
    const ssidInput = document.getElementById("ssidInput");
    const passwordInput = document.getElementById("passwordInput");
    const confirmPasswordInput = document.getElementById("confirmPasswordInput");
    const ipInput = document.getElementById("ipInput");

    if (hostnameInput) hostnameInput.value = wifiConfig.hostname || "esp32controller";
    if (ssidInput) ssidInput.value = wifiConfig.ssid || "";
    if (passwordInput) passwordInput.value = wifiConfig.password || "";
    if (confirmPasswordInput) confirmPasswordInput.value = wifiConfig.password || "";
    if (ipInput) ipInput.value = wifiConfig.staticIP || "192.168.4.1";
}

function initSettingsPage() {
    if (!isSettingsPage()) return;
    loadWifiConfig();

    const saveSettingsBtn = document.getElementById("saveSettingsBtn");
    const hostnameInput = document.getElementById("hostnameInput");
    const ssidInput = document.getElementById("ssidInput");
    const passwordInput = document.getElementById("passwordInput");
    const confirmPasswordInput = document.getElementById("confirmPasswordInput");
    const ipInput = document.getElementById("ipInput");
    const errorBox = document.getElementById("settingsError");

    saveSettingsBtn.addEventListener("click", () => {
        const hostname = hostnameInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        const ssid = ssidInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        const ip = ipInput.value.trim();

        if (errorBox) {
            errorBox.style.display = "none";
            errorBox.innerHTML = "";
        }

        if (hostname.length < 1) {
            if (errorBox) {
                errorBox.innerHTML = "<strong>Error:</strong> Hostname cannot be empty.";
                errorBox.style.display = "block";
            }
            return;
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

        const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipRegex.test(ip)) {
            if (errorBox) {
                errorBox.innerHTML = "<strong>Error:</strong> Invalid IP Address format.";
                errorBox.style.display = "block";
            }
            return;
        }

        wifiConfig.hostname = hostname;
        wifiConfig.ssid = ssid;
        wifiConfig.password = password;
        wifiConfig.staticIP = ip;

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