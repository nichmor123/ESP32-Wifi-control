# ESP32 Universal WiFi Gamepad Controller

This project turns an ESP32 into a high-performance, standalone WiFi controller that can be operated in real-time from a web browser using a standard USB gamepad. It's designed to be a flexible and robust foundation for robotics, RC vehicles, and other remote control applications.

## Overview

The ESP32 creates its own WiFi Access Point, allowing you to connect directly to it with a computer or phone without needing an external router. Once connected, you can navigate to a web page served by the ESP32. This web interface reads inputs from a gamepad connected to your computer and streams the control data to the ESP32 over a low-latency WebSocket connection.

The system is highly configurable, with a dedicated web page for mapping gamepad buttons and axes to specific output channels. This configuration is saved directly on the ESP32's filesystem.

## Features

- **Standalone Access Point:** No external WiFi network required.
- **Dual Control Modes:** Use a physical USB gamepad from a computer or on-screen virtual joysticks on a mobile device.
- **Asynchronous Web Server:** High-performance, non-blocking server capable of handling multiple connections.
- **Real-Time Control:** Low-latency control data is sent at 100Hz using an efficient binary WebSocket protocol.
- **Browser-Based Gamepad Support:** Uses the standard web Gamepad API to read controller inputs.
- **Dynamic Input Mapping:** A web-based UI allows you to map any gamepad button or axis to any of the 20 available control channels.
- **Persistent Configuration:** Input mappings are saved to a `controlMap.json` file on the ESP32's `LittleFS` filesystem.
- **Built-in Failsafe:** The ESP32 code includes a timeout to detect connection loss and can trigger a failsafe state (e.g., stop motors).
- **Modular Codebase:** Both the C++ firmware and the frontend JavaScript are broken into logical, maintainable modules.

## How It Works

The project consists of two main parts: the ESP32 firmware and the client-side web application.

### ESP32 Firmware (`src/`)

The C++ code running on the ESP32 is responsible for:
1.  **WiFi AP:** Creates a WiFi network with the SSID `ESP32Controller`.
2.  **Web Server:** An `ESPAsyncWebServer` instance serves the static web files (`.html`, `.css`, `.js`) from the `LittleFS` filesystem.
3.  **WebSocket Server:** An `AsyncWebSocket` server listens for incoming client connections on the `/ws` endpoint. It's built to handle specific JSON commands (like saving a configuration) and to receive the main binary control packets.
4.  **Control Loop:** The main `loop()` runs a 100Hz control tick. In each tick, it safely reads the latest channel data received over the WebSocket and checks for a stale connection. This is where you would add your logic to drive motors, servos, or other hardware based on the channel values.

### Web Application (`data/`)

The HTML, CSS, and JavaScript files run in the client's web browser.

1.  **Connection:** The JavaScript connects to the ESP32's WebSocket server.
2.  **Gamepad API:** It polls a connected gamepad for its state (axis positions, button presses).
3.  **Data Processing:**
    - On the **Main Page** (`index.html`), it continuously reads the gamepad, applies transformations (deadband, expo) defined in `controlMap.json`, and sends the final channel values as a compact binary array to the ESP32. To preserve the ESP32's watchdog timer, it keeps sending data as long as any control is active (not zero), even if the value isn't changing.
    - On the **Input Mapping Page** (`config_inputs.html`), it provides a UI to visually assign gamepad inputs to channels. When saved, it sends the new configuration to the ESP32, which overwrites the `controlMap.json` file.
    - On the **Mobile Page** (`mobile.html`), it presents a full-screen interface with two virtual joysticks and two buttons, sending their state directly to the first six channels. This page is self-contained and does not require an internet connection to load.

## File Structure

```
Wifi_Control/
├── data/                 # Web assets to be uploaded to LittleFS
│   ├── app.js            # Main JS entry point
│   ├── controlMap.js     # Handles loading/parsing controlMap.json
│   ├── gamepad.js        # Gamepad reading and processing logic
│   ├── page-config-inputs.js # Logic for the input config page
│   ├── page-index.js     # Logic for the main control page
│   ├── utils.js          # Shared helper functions
│   ├── websocket.js      # WebSocket connection management
│   ├── config_inputs.html# Input mapping page
│   ├── index.html        # Main control page
│   ├── controlMap.json   # Default input mapping configuration
│   └── style.css         # Stylesheet
├── include/              # Project header files (if any)
├── lib/                  # Project-specific libraries (if any)
├── src/                  # ESP32 firmware source code
│   ├── main.cpp          # Main setup() and loop()
│   └── networkAndWebserver/ # C++ classes for web and WebSocket servers
│       ├── ProjectWsCommands.cpp/h
│       ├── StaticFileServer.cpp/h
│       ├── WifiAPConfig.h
│       └── WsCommandServer.cpp/h
├── test/                 # Unit tests
└── platformio.ini        # PlatformIO project configuration
```

## Setup and Usage

### Prerequisites

- **Hardware:** An ESP32 development board (tested with ESP32-S3-DevKitM-1).
- **Software:** Visual Studio Code with the PlatformIO IDE extension.
- **Controller:** A standard gamepad (e.g., Logitech F310 in XInput mode, Xbox controller).

### Build and Upload

1.  **Clone the repository** and open it in VS Code.
2.  **Connect your ESP32** to your computer via USB.
3.  **Upload Firmware:** Use the PlatformIO "Upload" task (or press `Ctrl+Alt+U`). This compiles and flashes the C++ code to the ESP32.
4.  **Upload Filesystem:** Use the PlatformIO "Upload Filesystem Image" task. This bundles the contents of the `data/` directory into a LittleFS image and flashes it to the ESP32.

> **Note:** You must upload the filesystem image at least once. If you only change the C++ code, you only need to upload the firmware. If you change any HTML, CSS, or JS files, you must re-upload the filesystem image.

### Operation

1.  **Connect Gamepad:** Plug your gamepad into the computer you will be using to control the ESP32.
2.  **Connect to WiFi:** On your computer or phone, find and connect to the WiFi network named **`ESP32Controller`**. The password is **`12345678`**.
3.  **Open Web Interface:** Open a web browser (Chrome or Firefox recommended) and navigate to `http://192.168.4.1`.
4.  **Start Controlling:**
    - The main page will load and show "Connected" status.
    - Press any button on your gamepad to activate it.
    - Click the **"Start Sending"** button. The channel value bars will now update in real-time as you move the gamepad controls.
    - The `Spacebar` on your keyboard acts as an emergency stop, immediately halting data transmission.

## Customization

### WiFi AP Settings

The WiFi SSID and password can be changed in `src/main.cpp` within the `setup()` function:

```cpp
WiFiManagerSimple::APConfig ap;
ap.ssid = "MyNewController";
ap.password = "a-new-password";
wifi.beginAP(ap);
```

### Gamepad and Input Mapping

The file `data/controlMap.json` defines all available gamepad inputs (`sources`) and their default channel mappings (`map_to_channels`). You can edit this file to change the defaults or support a different controller. The `readGamepadStateF310` function in `data/gamepad.js` is tailored for a standard XInput layout and may need to be adjusted for other controller types.

### Output Logic

The firmware is designed for you to add your own hardware control logic. The placeholder for this is in `src/main.cpp` inside the `loop()` function:

```cpp
if (!stale) {
    // NORMAL CONTROL:
    const float c1 = bus.ch[0]; // Value of Channel 1 (-1.0 to 1.0)
    const float c2 = bus.ch[1]; // Value of Channel 2 (-1.0 to 1.0)
    // ...and so on for all channels.

    // Add your code here to control motors, servos, etc.
    // For example:
    // myServo.write(map(c1, -1, 1, 0, 180));
} else {
    // FAILSAFE:
    // This block runs if no data is received for 300ms.
    // Add code here to safely stop all motion.
    // myServo.write(90);
}
```

### Dependencies

This project relies on the following PlatformIO libraries, which are managed automatically via `platformio.ini`:

- `ESP32Async/AsyncTCP`
- `ESP32Async/ESPAsyncWebServer`
- `bblanchon/ArduinoJson@^7`

---

Happy building!
