// ---------- Backup & Restore Page ----------

const downloadBackupBtn = document.getElementById("downloadBackupBtn");
const backupFileInput = document.getElementById("backupFileInput");
const selectBackupFileBtn = document.getElementById("selectBackupFileBtn");
const selectedFileName = document.getElementById("selectedFileName");
const restoreBackupBtn = document.getElementById("restoreBackupBtn");
const backupError = document.getElementById("backupError");

let loadedBackupData = null;

function showBackupError(msg) {
  if (!backupError) return;
  backupError.textContent = msg;
  backupError.style.display = "block";
}

function clearBackupError() {
  if (!backupError) return;
  backupError.textContent = "";
  backupError.style.display = "none";
}

async function handleDownloadBackup() {
  clearBackupError();
  appendLog(debugEl, "Fetching system configurations for full backup...");

  try {
    const backupPackage = {
      version: 1,
      timestamp: new Date().toISOString(),
      files: {}
    };

    // List of core configuration files to include in full backup
    const configFiles = [
      "/config/profiles.json",
      "/config/controlMap.json",
      "/config/outputMap.json",
      "/config/battery.json",
      "/config/wifi.json",
      "/config/theme.json"
    ];

    // Scan LittleFS filesystem via HTTP to discover all profile and config JSON files dynamically
    try {
      const pRes = await fetch("/config/profiles.json?v=" + Date.now(), { cache: "no-store" });
      if (pRes.ok) {
        const pData = await pRes.json();
        const fixPath = (p) => (p && !p.startsWith("/config/")) ? "/config" + (p.startsWith("/") ? p : "/" + p) : p;
        if (pData.inputs) {
          Object.values(pData.inputs).forEach(path => {
            const fullPath = fixPath(path);
            if (fullPath && !configFiles.includes(fullPath)) configFiles.push(fullPath);
          });
        }
        if (pData.outputs) {
          Object.values(pData.outputs).forEach(path => {
            const fullPath = fixPath(path);
            if (fullPath && !configFiles.includes(fullPath)) configFiles.push(fullPath);
          });
        }
      }
    } catch (e) {
      console.warn("Could not parse profiles.json for extra profiles", e);
    }

    // Download each configuration file from LittleFS
    let includedCount = 0;
    for (const filePath of configFiles) {
      try {
        const res = await fetch(filePath + "?v=" + Date.now(), { cache: "no-store" });
        if (res.ok) {
          const content = await res.text();
          try {
            backupPackage.files[filePath] = JSON.parse(content);
          } catch (e) {
            backupPackage.files[filePath] = content;
          }
          includedCount++;
          appendLog(debugEl, `Included ${filePath} in backup.`);
        }
      } catch (err) {
        console.warn(`File ${filePath} could not be read for backup:`, err);
      }
    }

    if (includedCount === 0) {
      throw new Error("No configuration files could be read from the controller.");
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupPackage, null, 2));
    const dlAnchor = document.createElement('a');
    const filename = `esp32_controller_backup_${new Date().toISOString().slice(0,10)}.json`;
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", filename);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();

    appendLog(debugEl, `Successfully generated full backup file (${includedCount} configs): ${filename}`);
  } catch (err) {
    showBackupError("Failed to generate backup: " + err.message);
    appendLog(debugEl, "Backup error: " + err.message);
  }
}

function handleSelectFile() {
  if (backupFileInput) backupFileInput.click();
}

function handleFileChange(e) {
  clearBackupError();
  const file = e.target.files[0];
  if (!file) {
    if (selectedFileName) selectedFileName.textContent = "No file selected";
    if (restoreBackupBtn) restoreBackupBtn.disabled = true;
    loadedBackupData = null;
    return;
  }

  if (selectedFileName) selectedFileName.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (!parsed || !parsed.files || typeof parsed.files !== "object") {
        throw new Error("Invalid backup format. Missing 'files' map.");
      }
      loadedBackupData = parsed;
      if (restoreBackupBtn) restoreBackupBtn.disabled = false;
      appendLog(debugEl, `Loaded backup file with ${Object.keys(parsed.files).length} configuration files.`);
    } catch (err) {
      showBackupError("Failed to parse backup file: " + err.message);
      if (restoreBackupBtn) restoreBackupBtn.disabled = true;
      loadedBackupData = null;
    }
  };
  reader.readAsText(file);
}

function handleRestoreBackup() {
  if (!loadedBackupData || !loadedBackupData.files) {
    showBackupError("No valid backup package loaded.");
    return;
  }

  if (!wsIsOpen()) {
    showBackupError("WebSocket connection is required to restore backup.");
    return;
  }

  if (!confirm("Are you sure you want to restore this backup? All current configuration on the ESP32 will be overwritten, and the controller will restart.")) {
    return;
  }

  clearBackupError();
  appendLog(debugEl, "Sending full restore command via WebSocket...");

  const filesMap = {};
  for (const [filePath, content] of Object.entries(loadedBackupData.files)) {
    filesMap[filePath] = content;
  }

  const msg = {
    cmd: "restore_backup",
    data: {
      files: filesMap,
      restart: true
    }
  };

  if (!wsSendJson(msg)) {
    showBackupError("Failed to send restore payload to ESP32 over WebSocket.");
    appendLog(debugEl, "Restore failed: WS not connected.");
  } else {
    appendLog(debugEl, "Restore payload sent! ESP32 will write files and restart...");
    if (restoreBackupBtn) restoreBackupBtn.disabled = true;
  }
}

function initBackupPage() {
  if (downloadBackupBtn) {
    downloadBackupBtn.onclick = handleDownloadBackup;
  }

  if (selectBackupFileBtn) {
    selectBackupFileBtn.onclick = handleSelectFile;
  }

  if (backupFileInput) {
    backupFileInput.onchange = handleFileChange;
  }

  if (restoreBackupBtn) {
    restoreBackupBtn.onclick = handleRestoreBackup;
  }
}
