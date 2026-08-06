let ws;

// ---------- websocket helpers ----------
function wsIsOpen() {
  return ws && ws.readyState === WebSocket.OPEN;
}

function wsSendJson(obj) {
  if (!wsIsOpen()) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

// Binary packet format:
// [0]='U'(0x55), [1]='C'(0x43), [2]=version(1), [3]=N, then N * int16 (little-endian) scaled by 1000
function wsSendChannelsBinary(chFloatArray) {
  if (!wsIsOpen()) return false;

  const N = chFloatArray.length & 0xff;
  const headerBytes = 4;
  const buf = new ArrayBuffer(headerBytes + N * 2);
  const dv = new DataView(buf);

  dv.setUint8(0, 0x55); // 'U'
  dv.setUint8(1, 0x43); // 'C'
  dv.setUint8(2, 0x01); // version
  dv.setUint8(3, N);

  for (let i = 0; i < N; i++) {
    let v = Number(chFloatArray[i] ?? 0);
    if (v > 1) v = 1;
    if (v < -1) v = -1;

    const vi = Math.round(v * 1000); // [-1000..1000]
    dv.setInt16(headerBytes + i * 2, vi, true);
  }

  ws.send(buf);
  return true;
}

// ---------- websocket connection ----------
function shouldUseWebSocketOnThisPage() {
  return !!(pingBtn || sendToggleBtn || isConfigInputsPage() || saveBtn || isMobilePage());
}

function connectWebSocket() {
  if (!shouldUseWebSocketOnThisPage()) return;

  // avoid multiple concurrent sockets
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const protocol = location.protocol === "https:" ? "wss://" : "ws://";
  ws = new WebSocket(protocol + location.host + "/ws");
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    if (statusEl) setStatus(statusEl, "Connected", "#00ff00");
    appendLog(logEl || debugEl, "WebSocket connected");
  };

  ws.onclose = () => {
    if (statusEl) setStatus(statusEl, "Disconnected", "#ff4444");
    appendLog(logEl || debugEl, "WebSocket disconnected");
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = () => {
    appendLog(logEl || debugEl, "WebSocket error (state=" + (ws ? ws.readyState : "null") + ")");
  };

  ws.onmessage = (event) => {
    appendLog(logEl || debugEl, "RX: " + event.data);
  };

  if (pingBtn) {
    pingBtn.onclick = () => {
      if (!wsIsOpen()) {
        appendLog(logEl || debugEl, "WebSocket not connected");
        return;
      }
      const payload = { cmd: "ping" };
      wsSendJson(payload);
      appendLog(logEl || debugEl, "TX: " + JSON.stringify(payload));
    };
  }
}