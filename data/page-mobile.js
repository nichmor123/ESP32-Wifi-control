// State for mobile controls
const mobileState = {
    analog: { m_lsx: 0, m_lsy: 0, m_rsx: 0, m_rsy: 0 },
    digital: { m_btn_a: false, m_btn_b: false },
};

let mobileSendTimer = 0;
const MOBILE_SEND_HZ = 25;
const MOBILE_SEND_PERIOD_MS = 1000 / MOBILE_SEND_HZ;
// CHANNEL_COUNT is now loaded from controlMap.js

function startMobileSending() {
    if (mobileSendTimer) return; // Already running

    if (!wsIsOpen()) {
        // Silently fail, websocket.js will handle reconnects and status updates
        return;
    }

    mobileSendTimer = setInterval(() => {
        if (!wsIsOpen()) {
            stopMobileSending();
            return;
        }

        // Use the generic compute function with the mobile state
        const ch = computeChannelsFromState(mobileState);
        wsSendChannelsBinary(ch.map(round3));

    }, MOBILE_SEND_PERIOD_MS);
}

function stopMobileSending() {
    if (!mobileSendTimer) return;

    clearInterval(mobileSendTimer);
    mobileSendTimer = 0;

    // Reset state and send neutral packet if connection is open
    if (wsIsOpen()) {
        mobileState.analog = { m_lsx: 0, m_lsy: 0, m_rsx: 0, m_rsy: 0 };
        mobileState.digital = { m_btn_a: false, m_btn_b: false };
        // computeChannelsFromState will produce an array of the correct length
        const neutralCh = computeChannelsFromState(mobileState);
        wsSendChannelsBinary(neutralCh);
    }
}

function initMobilePage() {
    if (!isMobilePage()) return;
    console.log("initMobilePage: Initializing mobile page.");

    const joystickOptions = {
        color: '#00ffcc',
        size: 150,
        mode: 'dynamic',
    };

    const joystickLeftEl = document.getElementById("joystick-left-container");
    const joystickRightEl = document.getElementById("joystick-right-container");

    if (!joystickLeftEl || !joystickRightEl) {
        console.error("initMobilePage: ERROR: Joystick container elements not found!");
        setStatus(statusEl, "ERROR: UI elements missing", "#ff0000");
        return;
    }
    console.log("initMobilePage: Left container dims:", joystickLeftEl.offsetWidth, joystickLeftEl.offsetHeight);
    console.log("initMobilePage: Right container dims:", joystickRightEl.offsetWidth, joystickRightEl.offsetHeight);

    if (typeof nipplejs === 'undefined') {
        console.error("initMobilePage: ERROR: nipplejs library not loaded!");
        setStatus(statusEl, "ERROR: nipplejs library missing", "#ff0000");
        return;
    }

    // Left Joystick
    const managerLeft = nipplejs.create({
        ...joystickOptions,
        zone: joystickLeftEl, // <--- This was missing!
    });

    managerLeft.on('move', (evt, data) => {
        if (data.vector) {
            // Invert Y-axis for typical joystick control
            mobileState.analog.m_lsx = clamp(data.vector.x, -1, 1);
            mobileState.analog.m_lsy = clamp(-data.vector.y, -1, 1);
        }
    }).on('end', () => {
        mobileState.analog.m_lsx = 0;
        mobileState.analog.m_lsy = 0;
    });
    console.log("initMobilePage: Left joystick created.");

    // Right Joystick
    const managerRight = nipplejs.create({
        ...joystickOptions,
        zone: joystickRightEl,
    });

    managerRight.on('move', (evt, data) => {
        if (data.vector) {
            // Invert Y-axis for typical joystick control
            mobileState.analog.m_rsx = clamp(data.vector.x, -1, 1);
            mobileState.analog.m_rsy = clamp(-data.vector.y, -1, 1);
        }
    }).on('end', () => {
        mobileState.analog.m_rsx = 0;
        mobileState.analog.m_rsy = 0;
    });
    console.log("initMobilePage: Right joystick created.");

    // Buttons
    const buttonAEl = document.getElementById("button-a");
    const buttonBEl = document.getElementById("button-b");
    const handleButton = (btn, stateKey, pressed) => {
        mobileState.digital[stateKey] = pressed;
        btn.classList.toggle('active', pressed);
    };

    buttonAEl.addEventListener('touchstart', (e) => { e.preventDefault(); handleButton(buttonAEl, 'm_btn_a', true); });
    buttonAEl.addEventListener('touchend', (e) => { e.preventDefault(); handleButton(buttonAEl, 'm_btn_a', false); });
    buttonBEl.addEventListener('touchstart', (e) => { e.preventDefault(); handleButton(buttonBEl, 'm_btn_b', true); });
    buttonBEl.addEventListener('touchend', (e) => { e.preventDefault(); handleButton(buttonBEl, 'm_btn_b', false); });
    console.log("initMobilePage: Buttons event listeners attached.");

    // Automatically start sending when the page loads and WS connects
    const checkWsAndStart = () => {
        console.log("initMobilePage: checkWsAndStart called. wsIsOpen:", wsIsOpen());
        if (wsIsOpen()) {
            startMobileSending();
        } else {
            // Wait for websocket.js to establish connection
            setTimeout(checkWsAndStart, 100);
        }
    };
    checkWsAndStart();

    // Stop sending if the page is hidden (e.g., user switches tabs)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopMobileSending();
        } else if (isMobilePage()) { // only restart if we are still on the mobile page
            checkWsAndStart();
        }
    });
}