# ESP32 Universal WiFi Gamepad Controller

This project turns an ESP32 into a high-performance, standalone WiFi controller that can be operated in real-time from a web browser using a standard USB gamepad. It's designed to be a flexible and robust foundation for robotics, RC vehicles, and other remote control applications.

## Getting Started

1.  **Clone the repository** and open it in VS Code with the PlatformIO extension.
2.  **Connect your ESP32** to your computer via USB.
3.  **Upload Firmware:** Use the PlatformIO "Upload" task (`Ctrl+Alt+U`).
4.  **Upload Filesystem:** Use the PlatformIO "Upload Filesystem Image" task.
5.  **Connect to WiFi:** Connect to the `ESP32Controller` WiFi network (password: `12345678`).
6.  **Open a browser** and go to `http://192.168.4.1`.

## Overview

The ESP32 creates its own WiFi Access Point, allowing you to connect directly to it with a computer or phone without needing an external router. Once connected, you can navigate to a web page served by the ESP32. This web interface reads inputs from a gamepad connected to your computer and streams the control data to the ESP32 over a low-latency WebSocket connection.

The system is highly configurable, with a dedicated web page for mapping gamepad buttons and axes to specific output channels. This configuration is saved directly on the ESP32's filesystem.

## Features

- **Standalone Access Point:** No external WiFi network required.
- **Dual Control Modes:** Use a physical USB gamepad from a computer or on-screen virtual joysticks on a mobile device.
- **Asynchronous Web Server:** High-performance, non-blocking server capable of handling multiple connections.
- **Configurable Input System:**
    - Map any gamepad or mobile input to one of 20 control channels.
    - Apply transformations like **deadband** and **expo** to fine-tune axis response.
    - Create complex **mixes** that combine multiple inputs into a single virtual control.
- **Configurable Output System:**
    - Map control channels to physical hardware outputs (ESCs, Servos).
    - Define input-to-output scaling (e.g., map a channel's `-1` to `1` range to a servo's `0` to `180` degree range).
- **Battery Monitoring:** Configure and monitor battery voltage with a dedicated setup page and status indicators on control pages.
- **Troubleshooting Page:** Dedicated page with diagnostic tools (ping, heap, remote restart).
- **Real-Time Control:** Low-latency control data is sent using an efficient binary WebSocket protocol.
- **Browser-Based Gamepad Support:** Uses the standard web Gamepad API to read controller inputs.
- **Persistent Configuration:** All input, output, and battery settings are saved to JSON files (`controlMap.json`, `outputMap.json`, `battery.json`) on the ESP32's `LittleFS` filesystem.
- **Built-in Failsafe:** The ESP32 code includes a timeout to detect connection loss and can trigger a failsafe state (e.g., stop motors).
- **Modular Codebase:** Both the C++ firmware and the frontend JavaScript are broken into logical, maintainable modules.

## How It Works

The project consists of two main parts: the ESP32 firmware and the client-side web application.

### ESP32 Firmware (`src/`)

The C++ code running on the ESP32 is responsible for:
1.  **WiFi AP:** Creates a WiFi network with the SSID `ESP32Controller`.
2.  **Web Server:** An `ESPAsyncWebServer` instance serves the static web files (`.html`, `.css`, `.js`) from the `LittleFS` filesystem.
3.  **WebSocket Server:** An `AsyncWebSocket` server listens for incoming client connections on the `/ws` endpoint. It's built to handle specific JSON commands (like saving a configuration) and to receive the main binary control packets.
4.  **Control Loop:** The main `loop()` runs a 100Hz control tick. It reads the latest channel data, checks for a stale connection (failsafe), and tells the `OutputManager` to drive the hardware.
5.  **Sensor Loop:** A 10Hz loop reads the `BatteryMonitor` and broadcasts the status to all connected web clients.

### Web Application (`data/`)

The HTML, CSS, and JavaScript files run in the client's web browser.

1.  **Connection:** The JavaScript connects to the ESP32's WebSocket server.
2.  **Control Pages (`/` and `/mobile`):** These pages read either a physical gamepad or virtual joysticks, apply all configured mixes and transformations from `controlMap.json`, and stream the final channel values to the ESP32.
3.  **Configuration Pages (`/config/inputs`, `/config/outputs`, `/battery`):** These provide UIs to modify the system's behavior. When you save, the new configuration is sent to the ESP32, which overwrites the corresponding JSON file on its filesystem and restarts to apply the changes.

## Configuration

The project is configured using JSON files stored on the ESP32's LittleFS filesystem. These files can be edited through the web interface.

-   **`controlMap.json`:** Defines the input sources (gamepad buttons, axes, mobile controls) and how they are mapped to the 20 control channels. It also allows for creating "mixes" which are virtual inputs that combine multiple other inputs.
-   **`outputMap.json`:** Defines the physical outputs (servos, ESCs), which GPIO pins they are connected to, and how they should respond to the control channel values.
-   **`battery.json`:** Configures the battery monitoring, including the battery chemistry, cell count, and voltage divider resistors.

## File Structure

```text
Wifi_Control/
├── .gitignore
├── .pio/
├── .vscode/
│   ├── extensions.json
│   ├── c_cpp_properties.json
│   └── launch.json
├── data/
│   ├── app.js
│   ├── battery.html
│   ├── battery.json
│   ├── BatteryMonitor.cpp
│   ├── BatteryMonitor.h
│   ├── config_inputs.html
│   ├── config_outputs.html
│   ├── controlMap.js
│   ├── controlMap.json
│   ├── gamepad.js
│   ├── index.html
│   ├── mobile.html
│   ├── nipplejs.js
│   ├── outputMap.json
│   ├── page-battery.js
│   ├── page-config-inputs.js
│   ├── page-config-outputs.js
│   ├── page-index.js
│   ├── page-mobile.js
│   ├── page-troubleshooting.js
│   ├── style.css
│   ├── troubleshooting.html
│   ├── utils.js
│   └── websocket.js
├── include/
│   └── README
├── lib/
│   └── README
├── platformio.ini
├── README.md
├── src/
│   ├── main.cpp
│   ├── networkAndWebserver/
│   │   ├── ProjectWsCommands.cpp
│   │   ├── ProjectWsCommands.h
│   │   ├── StaticFileServer.cpp
│   │   ├── StaticFileServer.h
│   │   ├── WifiAPConfig.h
│   │   ├── WsCommandServer.cpp
│   │   └── WsCommandServer.h
│   ├── outputs/
│   │   ├── OutputManager.cpp
│   │   └── OutputManager.h
│   └── sensors/
│       ├── BatteryMonitor.cpp
│       └── BatteryMonitor.h
└── test/
    └── README
```

## Troubleshooting

The web interface includes a "Troubleshooting" page with the following features:

-   **Ping:** Test the connection to the ESP32.
-   **Heap:** Check the available memory on the ESP32.
-   **Restart:** Remotely restart the ESP32.

## Dependencies

This project relies on the following PlatformIO libraries, which are managed automatically via `platformio.ini`:

-   `bblanchon/ArduinoJson@^7`
-   `https://github.com/ESP32Async/AsyncTCP.git`
-   `https://github.com/ESP32Async/ESPAsyncWebServer.git`

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the GitHub repository.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
