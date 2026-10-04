# ESP32 Universal WiFi Gamepad Controller

An all-in-one, high-performance WiFi controller framework for ESP32 and ESP32-S3 microcontrollers. It turns any ESP32 into a standalone WiFi receiver and web controller operated in real-time from a computer (via standard USB gamepads) or mobile devices (via on-screen touch joysticks).

Designed for robotics, RC vehicles, rovers, differential drive tanks, and custom automation.

---

## Quick Setup Guide (No C++ Compiler Required!)

Follow these 7 quick steps to get up and running in minutes using pre-compiled binaries and an online web flasher:

### 1. Install USB Drivers
Ensure your computer can communicate with your ESP32 board over USB:
- **CP210x Drivers:** [Silicon Labs CP210x VCP Drivers](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)
- **CH340 / CH341 Drivers:** [WCH CH340 USB Drivers](http://www.wch-ic.com/downloads/CH341SER_ZIP.html)
- **ESP32-S3 Native USB-CDC:** No additional driver required on Windows 10/11 or macOS.

### 2. Download the Firmware Binary
Go to the official GitHub Releases page:
**[Download Latest Firmware Binaries (GitHub Releases)](https://github.com/NickA-0/Wifi_Control/releases)**

Download the binary matching your microcontroller hardware:
- **`firmware_esp32s3.bin`** – For **ESP32-S3** boards (e.g. ESP32-S3 DevKitC-1, N8/N16).
- **`firmware_esp32wroom32.bin`** – For **ESP32 / WROOM-32 / ESP32-D0WD** standard boards.

### 3. Flash to ESP32 via Browser Web Flasher
You don't need PlatformIO or Arduino IDE! Flash directly from Google Chrome or Microsoft Edge:
1. Open the online **[ESP Web Flasher (Espressif esptool-js)](https://espressif.github.io/esptool-js/)** or **[Adafruit WebSerial ESPTool](https://adafruit.github.io/Adafruit_WebSerial_ESPTool/)**.
2. Connect your ESP32 to your computer using a USB data cable.
3. Click **Connect**, select your ESP32's COM port, and set the baud rate to `921600`.
4. Choose the downloaded binary file (`.bin`).
5. Set Flash Offset to **`0x0000`** (or `0x10000` depending on the tool prompt) and click **Program / Flash**.

---

### 4. Observe LED Status Signal
Once flashed, the onboard LED provides instant visual feedback:
- **Auto-Numbering (First Boot):** Flashes N times (e.g., 1 flash -> pause -> repeat) indicating auto-assigned controller number `ESP32Controller-1`.
- **AP Mode Active (Idle):** Long double-pulse rhythm.
- **Client Connected:** Heartbeat pulse (500ms ON / 500ms OFF).
- **Active Real-Time Control Stream:** Rapid double-strobe.

---

### 5. Connect to Controller Wi-Fi
On your smartphone, laptop, or computer:
1. Search for available Wi-Fi networks.
2. Connect to **`ESP32Controller-1`** (or whichever number your onboard LED signaled).
3. Enter default Wi-Fi password: **`12345678`**.

---

### 6. Open Web Interface
Open **Google Chrome** or **Firefox** and navigate to:
**`http://192.168.4.1`**

---

### 7. First-Time Setup Checklist (Web Control Pages)
Once the web UI loads, configure your vehicle or robot in order:

| Web Page | What to Configure |
|---|---|
| **`Overview` (`/`)** | View real-time gamepad diagnostics, active WebSocket latency, and live battery telemetry. |
| **`Input Mapping` (`/inputs`)** | Plug in a USB gamepad or enable mobile touch joysticks. Click "Start Reading" and assign physical sticks/buttons to Channels 1–20. Add deadband, expo, or axis inversion. |
| **`Input Mixes` (`/mixes`)** | Set up differential drive / tank steering (combining Throttle + Steering into Left/Right motor channels). |
| **`Output Mapping` (`/outputs`)** | Assign channels to physical ESP32 GPIO pins. Select driver mode: `ESC (Brushed/Brushless)`, `Servo`, or `H-Bridge Motor Driver (IN1/IN2)`. |
| **`Battery` (`/battery`)** | Enable battery telemetry, select chemistry (LiPo / LiFePO4), cell count, resistor values, and ADC sense pin. |

---

## Core Features

### Real-Time Low-Latency Control
- **100 Hz Binary WebSocket Stream:** Uses an optimized 100 Hz binary protocol (`UC` header format) for instantaneous control response.
- **Standard Gamepad API:** Native support for Xbox, PlayStation, Switch Pro, and standard USB/Bluetooth gamepads via modern web browsers.
- **Mobile Touch Controls:** On-screen virtual joysticks powered by `Nipple.js` with haptic feedback support.

### Dynamic Board Hardware Detection
- **ESP32-S3 vs ESP32-WROOM-32 Auto-Detection:** Automatically detects processor model, LEDC PWM channel limits (8 channels on S3 vs 16 on WROOM-32), and CPU frequency over WebSocket.
- **Hardware Timer Collision Prevention:** Detects hardware timer channel conflicts between 50 Hz Servos/ESCs and 20 kHz H-Bridge DC motor drivers, guiding pin selection across contiguous hardware groups.

### Multi-Driver Hardware Support
- **50 Hz Servos:** Pulse width control (500 µs – 2500 µs) with 14-bit resolution.
- **50 Hz ESCs:** Neutral-centered or 0-100% ESC pulse control (1000 µs – 2000 µs).
- **20 kHz H-Bridge Motor Drivers:** Silent 20 kHz dual-pin PWM driving (IN1 / IN2) for L298N, TB6612, DRV8833, L9110S with forward, reverse, braking, and coasting logic.

### Crash Protection & Safe Mode System
- **Automatic Crash Counter:** Counts consecutive fast reboots in persistent storage.
- **15-Second Stability Reset:** Automatically resets crash counter to 0 after 15 seconds of continuous stable uptime.
- **Safe Mode Recovery:** If 3 consecutive crashes occur within 15 seconds of boot, hardware outputs are automatically suspended to prevent motor runaway, while keeping the web interface alive for troubleshooting.
- **Global Safe Mode Warning Banner:** Displays a top-level alert across all web pages when Safe Mode is triggered.

### Serial Boot Logger & Troubleshooting Tools
- **In-Memory & Storage Boot Logs:** Captures boot messages, memory heap, and system reset reasons (`Power-On`, `Software Restart`, `Crash Panic`, `Watchdog Reset`, `Brownout`).
- **Web Boot Log Viewer:** View `/logs/current.log` and `/logs/last_boot.log` directly inside the browser on the `/troubleshooting` page.
- **Diagnostics:** Remote ping test, heap memory checker, and remote system restart.

### Telemetry & Battery Monitoring
- **Automatic Voltage Calculator:** Auto-calculates standard E24 resistor divider ratios (R1 / R2) based on cell count (1S–12S) and chemistry (LiPo / LiFePO4).
- **Calibrated Voltage Filter:** Smooths ADC voltage readings using a moving average filter.
- **WiFi ADC Restriction Guard:** Automatically warns if ADC2 pins are selected on ESP32-WROOM-32 (which conflict with WiFi).

### Backup, Profiles & Custom Themes
- **Multi-Profile Manager:** Save, load, create, download, and upload custom input/output configuration profiles.
- **Full System Backup & Restore:** Export or restore all device configurations (`/config/*.json`) in a single JSON backup package.
- **Custom CSS Theme Engine:** Personalize accent colors and themes across all web pages with instant live previews.

## Serial Command Interface (921600 Baud)

You can inspect system status and configure Wi-Fi parameters over USB/Serial at **921600 baud**.

| Command | Description |
|---|---|
| `help` / `?` | Print list of available commands. |
| `status` | Display free RAM heap, uptime, Wi-Fi mode, and active WebSocket client count. |
| `get_wifi` / `wifi` | Show current Wi-Fi configuration stored in `/config/wifi.json`. |
| `set_wifi <ssid> <pass> [hostname] [staticIP]` | Save new Wi-Fi credentials and reboot. Supports quotes: `set_wifi "My Network" "SecretPass123"`. |
| `restart` / `reboot` | Perform a clean software reboot of the ESP32. |

## How It Works

The system is split into two asynchronous layers:

### 1. Embedded C++ Firmware (`src/`)
- **WiFi & Async Web Server:** Hosts an AP with configurable credentials and serves static files (`.html`, `.css`, `.js`) directly from `LittleFS` using `ESPAsyncWebServer`.
- **Binary WebSocket Server:** Listens on `/ws` and parses 100 Hz binary control packets into a 20-channel bus (`ChannelBus`).
- **100 Hz Control Tick:** Maps incoming channels to physical hardware outputs via `OutputManager` (Servos, ESCs, H-Bridges).
- **Crash Counter & Safe Mode:** Tracks fast reboot loops and suspends outputs if consecutive crashes occur.
- **10 Hz Telemetry Loop:** Reads battery voltage through a moving average filter and broadcasts updates to clients.

### 2. Zero-Install Web Client (`data/`)
- **Client Control Pages (`/` and `/mobile`):** Evaluates physical Gamepad API inputs or `Nipple.js` touch joysticks, applies deadband, expo, inversion, and multi-channel mixes, and streams binary packets to the ESP32.
- **Configuration & Diagnostics Pages:** Manages input/output mapping, battery telemetry, multi-profile switching, full backup/restore, and serial boot log viewing.

## WiFi Access Point & Multiple Controllers

Navigate to `http://192.168.4.1/settings` in your browser to modify Wi-Fi credentials.

1. **SSID:** Enter desired network name (e.g., `MyRobot`).
2. **Password:** Enter a password (minimum 8 characters) or leave blank for open network.
3. **Save & Restart:** Credentials are saved to `/config/wifi.json` and the controller reboots automatically.

> **LED Status Indicator Signals:**
> - **Auto-Numbering (Unmodified Fresh Board):** Flashes $N$ times (e.g. 1 flash $\rightarrow$ pause $\rightarrow$ repeat for board `-1`).
> - **WiFi Running / Idle (No Clients Connected):** Long double-pulse (`ON 1200ms`, `OFF 300ms`, `ON 1200ms`, `OFF 2000ms`).
> - **Device Connected (Web Client Connected, Idle):** Heartbeat pulse (`ON 500ms`, `OFF 500ms`).
> - **Active Control Stream:** Rapid double-strobe (`ON 80ms`, `OFF 80ms`, `ON 80ms`, `OFF 600ms`).

### Input & Output Configuration Pages
- **Input Mapping (`/inputs`):** Map physical gamepad buttons/sticks or touch controls to channels 1–20. Customize deadband, exponential curves, or axis inversion.
- **Input Mixes (`/mixes`):** Set up differential drive tank steering or combine channels into complex virtual axes.
- **Output Mapping (`/outputs`):** Map channels to physical GPIO pins. Choose driver modes (`Servo`, `ESC`, or `H-Bridge Motor Driver`). Hardware timer collision warnings automatically guard pin assignments.
- **Battery Monitoring (`/battery`):** Enable telemetry, select chemistry, cell count, and sense pin. Built-in resistor divider calculator assists in setting R1 and R2.

---

## Project File Structure

```text
Wifi_Control/
├── platformio.ini                  # PlatformIO build configuration & dependencies
├── README.md                       # Project documentation
│
├── src/                            # Embedded C++ Source Files
│   ├── main.cpp                    # System entry point setup() & 100Hz loop()
│   ├── initializer/
│   │   ├── DeviceInitializer.cpp   # Early board hardware startup
│   │   └── DeviceInitializer.h
│   ├── system/
│   │   ├── BootManager.cpp         # Restart monitoring, safe mode & boot logger
│   │   └── BootManager.h
│   ├── led/
│   │   ├── LedHandler.cpp          # Non-blocking LED pattern engine
│   │   ├── LedHandler.h
│   │   ├── StatusLedManager.cpp    # System visual status signals
│   │   └── StatusLedManager.h
│   ├── networkAndWebserver/
│   │   ├── NetworkManager.cpp      # WiFi AP/STA, mDNS & webserver manager
│   │   ├── NetworkManager.h
│   │   ├── ProjectWsCommands.cpp   # WebSocket JSON & binary packet handlers
│   │   ├── ProjectWsCommands.h
│   │   ├── StaticFileServer.cpp    # LittleFS static file server
│   │   ├── StaticFileServer.h
│   │   ├── WifiAPConfig.h
│   │   ├── WsCommandServer.cpp     # AsyncWebSocket lifecycle wrapper
│   │   └── WsCommandServer.h
│   ├── outputs/
│   │   ├── OutputManager.cpp       # LEDC PWM hardware driver (Servos, ESCs, H-Bridges)
│   │   └── OutputManager.h
│   ├── sensors/
│   │   ├── BatteryMonitor.cpp      # ADC battery voltage monitoring
│   │   └── BatteryMonitor.h
│   └── serial/
│       ├── SerialCommandHandler.cpp# USB Serial CLI command processor
│       └── SerialCommandHandler.h
│
└── data/                           # LittleFS Web Filesystem Assets
    ├── index.html                  # Overview Control Page (`/`)
    ├── computer.html               # Desktop PC Control Page (`/computer`)
    ├── mobile.html                 # Mobile Touch Control Page (`/mobile`)
    ├── inputs.html                 # Channel Input Mapping (`/inputs`)
    ├── mixes.html                  # Input Mixes & Tank Steering (`/mixes`)
    ├── outputs.html                # Servo / ESC / H-Bridge Driver Config (`/outputs`)
    ├── battery.html                # Battery Monitor Setup (`/battery`)
    ├── backup.html                 # Backup, Restore & Profile Manager (`/backup`)
    ├── troubleshooting.html        # Diagnostics, Safe Mode & Boot Logs (`/troubleshooting`)
    ├── settings.html               # Access Point WiFi Credentials (`/settings`)
    ├── theme.html                  # Custom UI Theme Customization (`/theme`)
    │
    ├── css/
    │   └── style.css               # Responsive Layout & Theme System
    ├── js/
    │   ├── app.js                  # Global page router & initialization
    │   ├── controlMap.js           # Channel mapping & transformation engine
    │   ├── gamepad.js              # HTML5 Gamepad API reader
    │   ├── theme.js                # Dynamic CSS theme engine
    │   ├── utils.js                # Loggers, mappers, & clampers
    │   └── websocket.js            # WebSocket client & binary transmitter
    ├── lib/
    │   └── nipplejs.js             # Touch joysticks library
    ├── pages/
    │   ├── page-backup.js          # Backup & profile manager controller
    │   ├── page-battery.js         # Battery configuration page controller
    │   ├── page-computer.js       # PC control page controller
    │   ├── page-index.js           # Overview page controller
    │   ├── page-inputs.js          # Input mapping UI builder
    │   ├── page-mixes.js           # Channel mix editor
    │   ├── page-mobile.js          # Mobile touch controller
    │   ├── page-outputs.js         # Output card generator & validator
    │   ├── page-settings.js        # WiFi settings controller
    │   ├── page-theme.js           # Theme customizer UI
    │   └── page-troubleshooting.js # Safe mode & boot log viewer UI
    └── config/
        ├── battery.json            # Battery config
        ├── controlMap.json         # Input map & transformations
        ├── outputMap.json          # Output hardware mapping
        ├── profiles.json           # Profile registry
        ├── theme.json              # Custom CSS theme colors
        └── wifi.json               # WiFi credentials
```

---

## Building from Source (PlatformIO)

To compile and modify the source code:

1. **Clone Repository:**
   ```bash
   git clone https://github.com/NickA-0/Wifi_Control.git
   cd Wifi_Control
   ```
2. Open the directory in **VS Code** with **PlatformIO** extension installed.
3. **Upload Firmware:** Run PlatformIO **Upload** (`Ctrl+Alt+U`).
4. **Upload Filesystem:** Run PlatformIO **Upload Filesystem Image** task to flash `data/` to `LittleFS`.

---

## License

This project is licensed under the **MIT License**.
