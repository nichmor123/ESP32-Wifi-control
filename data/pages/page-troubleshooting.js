function initTroubleshootingPage() {
    if (!isTroubleshootingPage()) return;

    const systemInfoEl = document.getElementById("systemInfo");

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
        } catch (e) { /* Not a JSON message, ignore */ }
    };
}