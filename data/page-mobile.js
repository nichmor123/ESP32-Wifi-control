// State for mobile controls
const mobileState = {
    left: { x: 0, y: 0 },
    right: { x: 0, y: 0 },
    buttonA: 0,
    buttonB: 0,
};

let mobileSendTimer = 0;
const MOBILE_SEND_HZ = 25;
const MOBILE_SEND_PERIOD_MS = 1000 / MOBILE_SEND_HZ;
const CHANNEL_COUNT = 20; // Self-contained channel count for mobile page

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

        // Construct channel array from mobile state
        const ch = new Array(CHANNEL_COUNT).fill(0);
        ch[0] = mobileState.left.x;  // Left Stick X -> Channel 1
        ch[1] = mobileState.left.y;  // Left Stick Y -> Channel 2
        ch[2] = mobileState.right.x; // Right Stick X -> Channel 3
        ch[3] = mobileState.right.y; // Right Stick Y -> Channel 4
        ch[4] = mobileState.buttonA; // Button A -> Channel 5
        ch[5] = mobileState.buttonB; // Button B -> Channel 6

        // Always send to keep watchdog happy
        wsSendChannelsBinary(ch.map(round3));

    }, MOBILE_SEND_PERIOD_MS);
}

function stopMobileSending() {
    if (!mobileSendTimer) return;

    clearInterval(mobileSendTimer);
    mobileSendTimer = 0;

    // Reset state and send neutral packet if connection is open
    if (wsIsOpen()) {
        mobileState.left = { x: 0, y: 0 };
        mobileState.right = { x: 0, y: 0 };
        mobileState.buttonA = 0;
        mobileState.buttonB = 0;
        wsSendChannelsBinary(new Array(CHANNEL_COUNT).fill(0));
    }
}

function initMobilePage() {
    if (!isMobilePage()) return;
    console.log("initMobilePage: Initializing mobile page.");

    const joystickOptions = {
        color: '#00ffcc',
        size: 150,
        mode: 'dynamic', // Change to dynamic mode
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
            mobileState.left.x = clamp(data.vector.x, -1, 1);
            mobileState.left.y = clamp(-data.vector.y, -1, 1);
        }
    }).on('end', () => {
        mobileState.left.x = 0;
        mobileState.left.y = 0;
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
            mobileState.right.x = clamp(data.vector.x, -1, 1);
            mobileState.right.y = clamp(-data.vector.y, -1, 1);
        }
    }).on('end', () => {
        mobileState.right.x = 0;
        mobileState.right.y = 0;
    });
    console.log("initMobilePage: Right joystick created.");

    // Buttons
    const buttonAEl = document.getElementById("button-a");
    const buttonBEl = document.getElementById("button-b");
    const handleButton = (btn, stateKey, pressed) => {
        mobileState[stateKey] = pressed ? 1.0 : 0.0;
        btn.classList.toggle('active', pressed);
    };

    buttonAEl.addEventListener('touchstart', (e) => { e.preventDefault(); handleButton(buttonAEl, 'buttonA', true); });
    buttonAEl.addEventListener('touchend', (e) => { e.preventDefault(); handleButton(buttonAEl, 'buttonA', false); });
    buttonBEl.addEventListener('touchstart', (e) => { e.preventDefault(); handleButton(buttonBEl, 'buttonB', true); });
    buttonBEl.addEventListener('touchend', (e) => { e.preventDefault(); handleButton(buttonBEl, 'buttonB', false); });
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