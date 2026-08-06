async function main() {
  // Establish WebSocket connection early
  connectWebSocket();

  // Initialize page-specific logic
  if (isConfigInputsPage()) {
    await loadControlMap();
    appendLog(debugEl, `Loaded controlmap.json (channels.count=${CHANNEL_COUNT}, sources=${SOURCES.length})`);
    initConfigInputsPage();
  } else if (isMobilePage()) {
    // Mobile page is self-contained and does not need controlMap
    initMobilePage();
  } else if (isIndexPage()) {
    await loadControlMap();
    appendLog(logEl, `Loaded controlmap.json (channels.count=${CHANNEL_COUNT}, sources=${SOURCES.length})`);
    initIndexPage();
  }
}

// Run the main entry point
main().catch(e => {
    console.error("Initialization failed:", e);
    appendLog(logEl || debugEl, "FATAL: App initialization failed. Check console.");
});