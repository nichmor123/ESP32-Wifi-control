let selectedLogTab = 'current';
let systemLogData = null;

function updateSystemLogsUI(data) {
    systemLogData = data;
    const modeBadge = document.getElementById("systemModeBadge");
    const bootCountVal = document.getElementById("bootCountVal");
    const uptimeVal = document.getElementById("uptimeVal");
    const bootLogViewer = document.getElementById("bootLogViewer");

    if (modeBadge) {
        if (data.isSafeMode) {
            modeBadge.textContent = "SAFE MODE ACTIVE";
            modeBadge.style.color = "#ff4444";
        } else {
            modeBadge.textContent = "NORMAL MODE";
            modeBadge.style.color = "#2ecc71";
        }
    }

    if (bootCountVal) bootCountVal.textContent = data.bootCount;
    if (uptimeVal) uptimeVal.textContent = (data.uptimeMs / 1000).toFixed(1) + "s";

    if (bootLogViewer) {
        if (selectedLogTab === 'current') {
            bootLogViewer.textContent = data.currentLog || "No current boot log available.";
        } else {
            bootLogViewer.textContent = data.lastBootLog || "No previous boot log available.";
        }
        bootLogViewer.scrollTop = bootLogViewer.scrollHeight;
    }
}

function initTroubleshootingPage() {
    if (!isTroubleshootingPage()) return;

    const systemInfoEl = document.getElementById("systemInfo");
    const viewCurrentLogBtn = document.getElementById("viewCurrentLogBtn");
    const viewLastLogBtn = document.getElementById("viewLastLogBtn");
    const refreshLogsBtn = document.getElementById("refreshLogsBtn");
    const clearSafeModeBtn = document.getElementById("clearSafeModeBtn");

    // Fetch system logs on load
    setTimeout(() => {
        wsSendJson({ cmd: "get_system_logs" });
    }, 300);

    if (viewCurrentLogBtn && viewLastLogBtn) {
        viewCurrentLogBtn.onclick = () => {
            selectedLogTab = 'current';
            viewCurrentLogBtn.style.background = 'var(--accent-color)';
            viewCurrentLogBtn.style.color = '#000';
            viewLastLogBtn.style.background = '#333';
            viewLastLogBtn.style.color = '#fff';
            if (systemLogData) updateSystemLogsUI(systemLogData);
        };
        viewLastLogBtn.onclick = () => {
            selectedLogTab = 'last';
            viewLastLogBtn.style.background = 'var(--accent-color)';
            viewLastLogBtn.style.color = '#000';
            viewCurrentLogBtn.style.background = '#333';
            viewCurrentLogBtn.style.color = '#fff';
            if (systemLogData) updateSystemLogsUI(systemLogData);
        };
    }

    if (refreshLogsBtn) {
        refreshLogsBtn.onclick = () => {
            wsSendJson({ cmd: "get_system_logs" });
        };
    }

    if (clearSafeModeBtn) {
        clearSafeModeBtn.onclick = () => {
            if (confirm("Reset crash counter to 0 and restart controller?")) {
                wsSendJson({ cmd: "clear_safe_mode" });
            }
        };
    }

    // Ping Button
    if (pingBtn) {
        pingBtn.onclick = () => {
            if (!wsIsOpen()) {
                appendLog(logEl, "WebSocket not connected");
                return;
            }
            const payload = { cmd: "ping" };
            wsSendJson(payload);
            appendLog(logEl, "TX: " + JSON.stringify(payload));
        };
    }

    // Get Heap Button
    const getHeapBtn = document.getElementById("getHeapBtn");
    if (getHeapBtn) {
        getHeapBtn.onclick = () => {
            if (!wsIsOpen()) {
                appendLog(logEl, "WebSocket not connected");
                return;
            }
            const payload = { cmd: "get_heap" };
            wsSendJson(payload);
            appendLog(logEl, "TX: " + JSON.stringify(payload));
        };
    }

    // Restart ESP32 Button
    const restartEspBtn = document.getElementById("restartEspBtn");
    if (restartEspBtn) {
        restartEspBtn.onclick = () => {
            if (!wsIsOpen()) {
                appendLog(logEl, "WebSocket not connected");
                return;
            }
            if (confirm("Are you sure you want to restart the ESP32?")) {
                const payload = { cmd: "restart_esp" };
                wsSendJson(payload);
                appendLog(logEl, "TX: " + JSON.stringify(payload));
            }
        };
    }

        // Override onmessage to handle specific responses
    const originalOnMessage = ws.onmessage;
    ws.onmessage = (event) => {
        originalOnMessage(event); // Call original handler for general logging
        try {
            const msg = JSON.parse(event.data);
            if (msg.cmd === "heap_response") appendLog(systemInfoEl, `Free Heap: ${msg.data.heap} bytes`);
            else if (msg.cmd === "system_logs_response") updateSystemLogsUI(msg.data);
            else if (msg.cmd === "clear_safe_mode_response") {
                appendLog(systemInfoEl, "Safe mode cleared. Controller restarting...");
            }
        } catch (e) { /* Not a JSON message, ignore */ }
    };
}