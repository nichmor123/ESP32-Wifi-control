#include "SerialCommandHandler.h"
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <WiFi.h>
#include <vector>

void SerialCommandHandler::begin() {
    _buffer.reserve(128);
    Serial.println("\nSerial Command Interface ready. Type 'help' for commands.");
}

void SerialCommandHandler::update() {
    while (Serial.available() > 0) {
        char c = (char)Serial.read();
        if (c == '\r') {
            continue; // Ignore carriage return
        }
        if (c == '\n') {
            _buffer.trim();
            if (_buffer.length() > 0) {
                processCommand(_buffer);
            }
            _buffer = "";
        } else {
            if (_buffer.length() < 256) {
                _buffer += c;
            }
        }
    }
}

static std::vector<String> parseTokens(const String& inputStr) {
    std::vector<String> tokens;
    String currentToken = "";
    bool inQuotes = false;

    for (size_t i = 0; i < inputStr.length(); i++) {
        char c = inputStr.charAt(i);

        if (c == '"') {
            inQuotes = !inQuotes;
        } else if (c == ' ' && !inQuotes) {
            if (currentToken.length() > 0) {
                tokens.push_back(currentToken);
                currentToken = "";
            }
        } else {
            currentToken += c;
        }
    }

    if (currentToken.length() > 0) {
        tokens.push_back(currentToken);
    }

    return tokens;
}

void SerialCommandHandler::processCommand(const String& line) {
    std::vector<String> tokens = parseTokens(line);
    if (tokens.empty()) return;

    String cmd = tokens[0];
    cmd.toLowerCase();

    if (cmd == "help" || cmd == "?") {
        printHelp();
    } else if (cmd == "get_wifi" || cmd == "wifi") {
        printWifiConfig();
    } else if (cmd == "set_wifi") {
        // Pass argument list without the command name itself
        String args = line.substring(cmd.length());
        args.trim();
        handleSetWifi(args);
    } else if (cmd == "restart" || cmd == "reboot") {
        handleRestart();
    } else if (cmd == "status") {
        printStatus();
    } else {
        Serial.printf("Unknown command: '%s'. Type 'help' for available commands.\n", cmd.c_str());
    }
}

void SerialCommandHandler::printHelp() {
    Serial.println("================== Available Serial Commands ==================");
    Serial.println("  help / ?                            : Display this help menu");
    Serial.println("  status                              : Display system & WiFi status");
    Serial.println("  get_wifi / wifi                     : View current WiFi configuration");
    Serial.println("  set_wifi <ssid> <pass> [host] [IP]  : Configure WiFi parameters");
    Serial.println("                                        e.g.: set_wifi MySSID MyPass123");
    Serial.println("                                        e.g.: set_wifi \"My SSID\" \"Pass 123\" esp32 192.168.4.1");
    Serial.println("  restart / reboot                    : Reboot the ESP32");
    Serial.println("===============================================================");
}

void SerialCommandHandler::printStatus() {
    Serial.println("=================== System Status ===================");
    Serial.printf("  Free Heap   : %u bytes\n", ESP.getFreeHeap());
    Serial.printf("  Uptime      : %lu ms\n", millis());
    
    if (WiFi.getMode() & WIFI_MODE_STA) {
        Serial.printf("  WiFi Mode   : STA (Client)\n");
        Serial.printf("  STA Status  : %s\n", WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected");
        if (WiFi.status() == WL_CONNECTED) {
            Serial.printf("  STA IP      : %s\n", WiFi.localIP().toString().c_str());
            Serial.printf("  Connected to: %s\n", WiFi.SSID().c_str());
        }
    } 
    if (WiFi.getMode() & WIFI_MODE_AP) {
        Serial.printf("  WiFi Mode   : AP (Access Point)\n");
        Serial.printf("  AP SSID     : %s\n", WiFi.softAPSSID().c_str());
        Serial.printf("  AP IP       : %s\n", WiFi.softAPIP().toString().c_str());
        Serial.printf("  AP Clients  : %d\n", WiFi.softAPgetStationNum());
    }
    Serial.println("====================================================");
}

void SerialCommandHandler::printWifiConfig() {
    File file = LittleFS.open("/wifi.json", "r");
    if (!file) {
        Serial.println("Error: Unable to open /wifi.json for reading.");
        return;
    }

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error) {
        Serial.printf("Error parsing /wifi.json: %s\n", error.c_str());
        return;
    }

    Serial.println("================ WiFi Configuration ================");
    Serial.printf("  SSID     : %s\n", doc["ssid"] | "ESP32Controller");
    Serial.printf("  Password : %s\n", doc["password"] | "12345678");
    Serial.printf("  Hostname : %s\n", doc["hostname"] | "esp32controller");
    Serial.printf("  Static IP: %s\n", doc["staticIP"] | "");
    Serial.printf("  Modified : %d\n", doc["modified"] | 0);
    Serial.println("====================================================");
}

void SerialCommandHandler::handleSetWifi(const String& argsStr) {
    std::vector<String> tokens = parseTokens(argsStr);

    if (tokens.size() < 2) {
        Serial.println("Usage: set_wifi <ssid> <password> [hostname] [staticIP]");
        Serial.println("Example: set_wifi \"My Network\" \"MyPassword123\"");
        return;
    }

    String ssid = tokens[0];
    String password = tokens[1];
    String hostname = tokens.size() >= 3 ? tokens[2] : "esp32controller";
    String staticIP = tokens.size() >= 4 ? tokens[3] : "";

    if (password.length() > 0 && password.length() < 8) {
        Serial.println("Error: WPA2 password must be at least 8 characters long (or empty for open network).");
        return;
    }

    // Read current file to preserve defaults if needed
    JsonDocument doc;
    File readFile = LittleFS.open("/wifi.json", "r");
    if (readFile) {
        deserializeJson(doc, readFile);
        readFile.close();
    }

    doc["ssid"] = ssid;
    doc["password"] = password;
    doc["hostname"] = hostname;
    doc["staticIP"] = staticIP;
    doc["modified"] = 1; // Set modified flag so DeviceInitializer respects user config

    File writeFile = LittleFS.open("/wifi.json", "w");
    if (!writeFile) {
        Serial.println("Error: Could not open /wifi.json for writing!");
        return;
    }

    serializeJson(doc, writeFile);
    writeFile.close();

    Serial.println("WiFi configuration saved successfully!");
    Serial.printf("  New SSID    : %s\n", ssid.c_str());
    Serial.printf("  New Password: %s\n", password.c_str());
    Serial.printf("  New Hostname: %s\n", hostname.c_str());
    Serial.printf("  New StaticIP: %s\n", staticIP.c_str());
    Serial.println("Restarting ESP32 to apply new settings...");
    
    delay(500);
    ESP.restart();
}

void SerialCommandHandler::handleRestart() {
    Serial.println("Restarting ESP32...");
    delay(200);
    ESP.restart();
}
