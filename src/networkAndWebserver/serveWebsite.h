#pragma once

#include <Arduino.h>
#include <LittleFS.h>
#include <ESPAsyncWebServer.h>

class StaticFileServer {
public:
    struct Config {
        uint16_t port;
        bool mountFS;
        bool formatOnFail;
        const char* defaultFile;

        Config()
            : port(80),
              mountFS(true),
              formatOnFail(true),
              defaultFile("/index.html") {}
    };

    // Construct with config (no default arg)
    explicit StaticFileServer(const Config& cfg)
        : _cfg(cfg), _server(cfg.port) {}

    // Non-copyable / non-assignable (prevents the unique_ptr copy error)
    StaticFileServer(const StaticFileServer&) = delete;
    StaticFileServer& operator=(const StaticFileServer&) = delete;

    bool begin() {
        if (_cfg.mountFS) {
            if (!LittleFS.begin(_cfg.formatOnFail)) {
                Serial.println("LittleFS mount failed");
                return false;
            }
        }

        _server.on("/", HTTP_GET, [this](AsyncWebServerRequest* req) {
            this->sendFile(req, _cfg.defaultFile, "text/html");
        });

        _server.serveStatic("/", LittleFS, "/");

        _server.onNotFound([](AsyncWebServerRequest* req) {
            req->send(404, "text/plain", "Not found");
        });

        _server.begin();
        Serial.printf("HTTP server started on port %u\n", _cfg.port);
        return true;
    }

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