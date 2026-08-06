// ---------- index page TX cards ----------
const txUiRefs = {}; // chIndex -> { valueEl, barFillEl }

function buildTxChannelCards() {
  if (!txChannelGridEl) return;

  txChannelGridEl.innerHTML = "";
  for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
    const card = document.createElement("div");
    card.className = "chanCard";
    card.innerHTML = `
      <div class="chanHeader">
        <div class="chanName">C${ch}</div>
        <div class="chanValue" id="tx_val_${ch}">0.000</div>
      </div>
      <div class="barOuter">
        <div class="barCenter"></div>
        <div class="barFill" id="tx_bar_${ch}" style="width: 50%;"></div>
      </div>
      <div style="opacity:0.75; font-size:13px; margin-top: 6px;">TX</div>
    `;
    txChannelGridEl.appendChild(card);

    txUiRefs[ch] = {
      valueEl: card.querySelector(`#tx_val_${ch}`),
      barFillEl: card.querySelector(`#tx_bar_${ch}`),
    };
  }
}

function renderTxChannels(chArray) {
  for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
    const ref = txUiRefs[ch];
    if (!ref) continue;

    const v = Number(chArray[ch - 1] ?? 0);
    ref.valueEl.textContent = v.toFixed(3);

    const pct = rangeToPercent(v, -1, 1);
    ref.barFillEl.style.width = `${pct.toFixed(1)}%`;
  }
}

function sendNeutralOnce() {
  if (!wsIsOpen()) return;
  const ch = new Array(CHANNEL_COUNT).fill(0);
  renderTxChannels(ch);
  wsSendChannelsBinary(ch);
}

let lastSentCh = null;

function channelsChanged(a, b) {
  if (!a || !b || a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 0.002) return true;
  }
  return false;
}

function updateSendButtonUi() {
  if (!sendToggleBtn) return;
  sendToggleBtn.textContent = sendingEnabled ? "Stop Sending" : "Start Sending";
}

// ---------- send loop (index.html) ----------
let sendingEnabled = false;
let sendTimer = 0;

const SEND_HZ = 25;
const SEND_PERIOD_MS = Math.round(1000 / SEND_HZ);

function stopSending(reason) {
  if (!sendingEnabled) return;

  sendingEnabled = false;

  if (sendTimer) {
    clearInterval(sendTimer);
    sendTimer = 0;
  }

  updateSendButtonUi();
  appendLog(logEl || debugEl, reason ? `STOP: ${reason}` : "STOP");
}

function startSending() {
  if (sendingEnabled) return;

  if (!wsIsOpen()) {
    appendLog(logEl || debugEl, "Can't start: WebSocket not connected");
    return;
  }

  if (sendTimer) {
    clearInterval(sendTimer);
    sendTimer = 0;
  }

  sendingEnabled = true;
  lastSentCh = null; // force first send
  updateSendButtonUi();
  appendLog(logEl || debugEl, `START sending inputs @ ${SEND_HZ} Hz (binary)`);

  sendTimer = setInterval(() => {
    if (!sendingEnabled) return;

    if (!wsIsOpen()) {
      stopSending("ws disconnected");
      return;
    }

    const gp = getFirstGamepad();
    if (!gp) {
      stopSending("no controller");
      return;
    }

    const state = readGamepadStateF310(gp);
    const ch = computeChannelsFromState(state).map(round3);

    renderTxChannels(ch);

    const hasChanged = channelsChanged(ch, lastSentCh);
    const isNonZero = ch.some((val) => val !== 0);
    if (!hasChanged && !isNonZero) {
      return;
    }
    lastSentCh = ch;

    if (!wsSendChannelsBinary(ch)) {
      stopSending("ws send failed");
    }
  }, SEND_PERIOD_MS);
}

function initIndexPage() {
  buildTxChannelCards();
  updateSendButtonUi();

  sendToggleBtn.onclick = () => {
    if (sendingEnabled) stopSending("button");
    else startSending();
  };

  window.addEventListener("keydown", (e) => {
    const tag = e.target?.tagName.toLowerCase() ?? "";
    if (["input", "textarea", "select"].includes(tag)) return;
    if (e.code === "Space") {
      stopSending("spacebar");
      sendNeutralOnce();
      e.preventDefault();
    }
  });
}