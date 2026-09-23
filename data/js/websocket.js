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
  return !!(pingBtn || sendToggleBtn || isInputsPage() || isMixesPage() || saveBtn || isMobilePage() || isOutputsPage() || isBatteryPage() || isBackupPage() || isTroubleshootingPage() || isSettingsPage() || isThemePage());
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
    // Check system safe mode status on connect
    wsSendJson({ cmd: "get_system_logs" });
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
    const logTarget = logEl || debugEl;
    let msg;

    try {
        msg = JSON.parse(event.data);
    } catch(e) {
        // Not a JSON message, just log it
        if (logTarget) appendLog(logTarget, "RX: " + event.data);
        return;
    }

    function checkGlobalSafeModeBanner(isSafeMode, bootCount) {
            let banner = document.getElementById('globalSafeModeBanner');
            if (isSafeMode) {
                if (!banner) {
                    banner = document.createElement('div');
                    banner.id = 'globalSafeModeBanner';
                    banner.style.cssText = 'background: #ff4444; color: #fff; text-align: center; padding: 10px; font-weight: bold; position: sticky; top: 0; z-index: 9999; box-shadow: 0 2px 10px rgba(0,0,0,0.5); font-size: 14px;';
                    document.body.prepend(banner);
                }
                banner.innerHTML = `⚠️ SAFE MODE ACTIVE (${bootCount || 3} Consecutive Crash Restarts Detected). Motor Outputs are Bypassed. <a href="/troubleshooting" style="color:#00ffcc; margin-left: 10px; text-decoration: underline;">Open Troubleshooting & Logs</a>`;
            } else if (banner) {
                banner.remove();
            }
        }

        if (msg.data && typeof msg.data.isSafeMode === 'boolean') {
            checkGlobalSafeModeBanner(msg.data.isSafeMode, msg.data.bootCount);
        }

        // Now we have a parsed message `msg`
        if (msg.cmd === 'battery_update') {
        const { voltage, percentage } = msg.data;
        document.querySelectorAll('#battery-indicator').forEach(indicator => {
            if (indicator.style.display === 'none') {
                indicator.style.display = indicator.closest('.mobile-body') ? 'flex' : 'block';
            }
            const textEl = indicator.querySelector('.battery-text');
            const barEl = indicator.querySelector('.battery-bar-fill');
            
            if (textEl.textContent.includes('%')) { // Main page has percentage
                textEl.textContent = `${voltage.toFixed(2)}V (${percentage.toFixed(0)}%)`;
            } else { // Mobile page does not
                textEl.textContent = `${voltage.toFixed(2)}V`;
            }
            if (barEl) barEl.style.width = `${percentage}%`;

            if (barEl) barEl.classList.remove('green', 'yellow', 'red');
            if (percentage > 50) barEl?.classList.add('green');
            else if (percentage > 20) barEl?.classList.add('yellow');
            else barEl?.classList.add('red');
        });
    } else if (msg.cmd === 'board_info_response') {
        if (typeof handleBoardInfoResponse === 'function') {
            handleBoardInfoResponse(msg.data);
        }
        if (logTarget) appendLog(logTarget, "RX: board_info_response");
    } else {
        // Log all other commands
        if (logTarget) {
            appendLog(logTarget, "RX: " + event.data);
        }
    }
  }
}