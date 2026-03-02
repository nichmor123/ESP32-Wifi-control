#include "StaticFileServer.h"

#include <LittleFS.h>

StaticFileServer::Config::Config()
    : port(80),
      mountFS(true),
      formatOnFail(true),
      defaultFile("/index.html") {}

StaticFileServer::StaticFileServer(const Config& cfg)
    : _cfg(cfg), _server(cfg.port) {}

bool StaticFileServer::begin() {
    if (_cfg.mountFS) {
        if (!LittleFS.begin(_cfg.formatOnFail)) {
            Serial.println("LittleFS mount failed");
            return false;
        }
    }

    _server.on("/", HTTP_GET, [this](AsyncWebServerRequest* req) {
        this->sendFile(req, _cfg.defaultFile, "text/html");
    });

    // Serve all assets from the FS: /style.css, /app.js, etc.
    _server.serveStatic("/", LittleFS, "/");

    _server.onNotFound([](AsyncWebServerRequest* req) {
        req->send(404, "text/plain", "Not found");
    });

    _server.begin();
    Serial.printf("HTTP server started on port %u\n", _cfg.port);
    return true;
}

void StaticFileServer::addPageRoute(const char* urlPath,
                                    const char* filePath,
                                    const char* contentType) {
    _server.on(urlPath, HTTP_GET, [this, filePath, contentType](AsyncWebServerRequest* req) {
        this->sendFile(req, filePath, contentType);
    });
}

AsyncWebServer& StaticFileServer::server() {
    return _server;
}

void StaticFileServer::sendFile(AsyncWebServerRequest* req,
                                const char* path,
                                const char* contentType) {
    if (!LittleFS.exists(path)) {
        Serial.printf("Missing file: %s\n", path);
        req->send(404, "text/plain", "File not found");
        return;
    }
    req->send(LittleFS, path, contentType);
}