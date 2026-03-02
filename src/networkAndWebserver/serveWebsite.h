#pragma once

#include <Arduino.h>
#include <LittleFS.h>
#include <ESPAsyncWebServer.h>

class StaticFileServer {
public:
    struct Config {
        uint16_t port = 80;

        // If true, this class mounts LittleFS for you.
        // If you mount it elsewhere, set this false.
        bool mountFS = true;

        // If true and mount fails, format on first mount attempt.
        bool formatOnFail = true;

        // What file to serve for "/" (root)
        String defaultFile = "/index.html";
    };

    explicit StaticFileServer(const Config& cfg = Config())
        : _cfg(cfg), _server(cfg.port) {}

    bool begin() {
        if (_cfg.mountFS) {
            if (!LittleFS.begin(_cfg.formatOnFail)) {
                Serial.println("LittleFS mount failed");
                return false;
            }
        }

        // Root -> defaultFile
        _server.on("/", HTTP_GET, [this](AsyncWebServerRequest* req) {
            this->sendFile(req, _cfg.defaultFile.c_str(), "text/html");
        });

        // Serve everything in LittleFS at its path:
        // "/app.js" -> "/app.js", "/style.css" -> "/style.css", etc.
        _server.serveStatic("/", LittleFS, "/");

        // 404 handler (optional but useful)
        _server.onNotFound([this](AsyncWebServerRequest* req) {
            // If you prefer SPA-like behavior, you could serve index.html here instead.
            req->send(404, "text/plain", "Not found");
        });

        _server.begin();
        Serial.printf("HTTP server started on port %u\n", _cfg.port);
        return true;
    }

    // Add another route that serves a specific file, e.g. "/config/inputs" -> "/config_inputs.html"
    void addPageRoute(const char* urlPath, const char* filePath, const char* contentType = "text/html") {
        _server.on(urlPath, HTTP_GET, [this, filePath, contentType](AsyncWebServerRequest* req) {
            this->sendFile(req, filePath, contentType);
        });
    }

    AsyncWebServer& server() { return _server; }

private:
    Config _cfg;
    AsyncWebServer _server;

    void sendFile(AsyncWebServerRequest* req, const char* path, const char* contentType) {
        if (!LittleFS.exists(path)) {
            Serial.printf("Missing file: %s\n", path);
            req->send(404, "text/plain", "File not found");
            return;
        }
        req->send(LittleFS, path, contentType);
    }
};