let ws;

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const pingBtn = document.getElementById("pingBtn");

function log(msg) {
    const line = document.createElement("div");
    line.textContent = msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
}

function connect() {
    const protocol = location.protocol === "https:" ? "wss://" : "ws://";
    ws = new WebSocket(protocol + location.host + "/ws");

    ws.onopen = () => {
        statusEl.textContent = "Connected";
        statusEl.style.color = "#00ff00";
        log("WebSocket connected");
    };

    ws.onclose = () => {
        statusEl.textContent = "Disconnected";
        statusEl.style.color = "#ff4444";
        log("WebSocket disconnected");
        setTimeout(connect, 2000);
    };

    ws.onerror = () => {
        log("WebSocket error");
    };

    ws.onmessage = (event) => {
        log("RX: " + event.data);
    };
}

function sendPing() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        log("WebSocket not connected");
        return;
    }

    const message = { cmd: "ping" };
    ws.send(JSON.stringify(message));
    log("TX: " + JSON.stringify(message));
}

pingBtn.addEventListener("click", sendPing);

connect();