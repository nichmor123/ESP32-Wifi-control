async function main() {
  // Establish WebSocket connection early
  connectWebSocket();
  
  // Load profiles directory registry
  await loadProfilesConfig();

    // Initialize page-specific logic
  if (isInputsPage()) {
    await loadControlMap();
    appendLog(debugEl, `Loaded controlmap.json (channels.count=${CHANNEL_COUNT}, sources=${SOURCES.length})`);
    initInputsPage();
  } else if (isMixesPage()) {
    await loadControlMap();
    appendLog(debugEl, `Loaded controlmap.json (channels.count=${CHANNEL_COUNT}, sources=${SOURCES.length})`);
    initMixesPage();
  } else if (isMobilePage()) {
    await loadControlMap();
    // No log element on mobile page, so no log output here
    initMobilePage();
  } else if (isOutputsPage()) {
    await loadControlMap(); // Needed for channel count
    initOutputsPage();
    } else if (isBatteryPage()) {
    initBatteryPage();
  } else if (isBackupPage()) {
    initBackupPage();
  } else if (isTroubleshootingPage()) {
        initTroubleshootingPage();
  } else if (isComputerPage()) {
    await loadControlMap();
    appendLog(logEl, `Loaded controlmap.json (channels.count=${CHANNEL_COUNT}, sources=${SOURCES.length})`);
    initComputerPage();
    } else if (isIndexPage()) {
    initIndexPage();
    } else if (isSettingsPage()) {
    initSettingsPage();
  } else if (isThemePage()) {
    if (typeof initThemePage === 'function') initThemePage();
  }
}

// Run the main entry point
main().catch(e => {
    console.error("Initialization failed:", e);
    appendLog(logEl || debugEl, "FATAL: App initialization failed. Check console.");
});