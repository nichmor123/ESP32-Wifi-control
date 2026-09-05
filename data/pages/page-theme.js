const THEME_PRESETS = [
  {
    name: "Cyber Cyan (Default)",
    accent: "#00ffcc",
    bg: "#111111",
    cardBg: "#1c1c1c",
    text: "#eeeeee",
    textMuted: "#888888"
  },
  {
    name: "Neon Purple",
    accent: "#bb86fc",
    bg: "#121212",
    cardBg: "#1e1e1e",
    text: "#ffffff",
    textMuted: "#a0a0a0"
  },
  {
    name: "Amber Flame",
    accent: "#ff9800",
    bg: "#181410",
    cardBg: "#241e18",
    text: "#f5f5f5",
    textMuted: "#9e9e9e"
  },
  {
    name: "Emerald Matrix",
    accent: "#00e676",
    bg: "#0a140d",
    cardBg: "#122016",
    text: "#e8f5e9",
    textMuted: "#81c784"
  },
  {
    name: "Solar Red",
    accent: "#ff5252",
    bg: "#140a0a",
    cardBg: "#201212",
    text: "#ffebee",
    textMuted: "#e57373"
  },
  {
    name: "OLED Midnight",
    accent: "#3d5afe",
    bg: "#000000",
    cardBg: "#121212",
    text: "#ffffff",
    textMuted: "#757575"
  }
];

function switchThemeTab(tabName) {
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

  if (tabName === 'presets') {
    document.querySelectorAll('.tab-button')[0].classList.add('active');
    document.getElementById('tab-presets').classList.add('active');
  } else {
    document.querySelectorAll('.tab-button')[1].classList.add('active');
    document.getElementById('tab-custom').classList.add('active');
  }
}

function renderPresets() {
  const container = document.getElementById('presets-grid');
  if (!container) return;

  container.innerHTML = THEME_PRESETS.map((p, idx) => `
    <div class="chanCard" style="background: ${p.cardBg}; border: 2px solid ${p.accent}; cursor: pointer;" onclick="selectPreset(${idx})">
      <div style="font-weight: bold; color: ${p.accent}; margin-bottom: 8px;">${p.name}</div>
      <div style="display: flex; gap: 6px;">
        <span style="width: 18px; height: 18px; border-radius: 50%; background: ${p.accent}; display: inline-block;"></span>
        <span style="width: 18px; height: 18px; border-radius: 50%; background: ${p.bg}; border: 1px solid #555; display: inline-block;"></span>
        <span style="width: 18px; height: 18px; border-radius: 50%; background: ${p.cardBg}; border: 1px solid #555; display: inline-block;"></span>
      </div>
    </div>
  `).join('');
}

function selectPreset(idx) {
  const p = THEME_PRESETS[idx];
  if (!p) return;

  document.getElementById('color-accent').value = p.accent;
  document.getElementById('color-bg').value = p.bg;
  document.getElementById('color-card').value = p.cardBg;
  document.getElementById('color-text').value = p.text;
  document.getElementById('color-muted').value = p.textMuted;

  applyLivePreview();
  showThemeStatus(`Applied preset: ${p.name}. Click "Save Theme" to persist.`, "#00ffcc");
}

function applyLivePreview() {
  const theme = {
    accent: document.getElementById('color-accent').value,
    bg: document.getElementById('color-bg').value,
    cardBg: document.getElementById('color-card').value,
    text: document.getElementById('color-text').value,
    textMuted: document.getElementById('color-muted').value
  };

  applyThemeToDOM(theme);
}

function attachColorInputListeners() {
  ['color-accent', 'color-bg', 'color-card', 'color-text', 'color-muted'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', applyLivePreview);
    }
  });
}

function syncInputsFromTheme(theme) {
  if (theme.accent) document.getElementById('color-accent').value = theme.accent;
  if (theme.bg) document.getElementById('color-bg').value = theme.bg;
  if (theme.cardBg) document.getElementById('color-card').value = theme.cardBg;
  if (theme.text) document.getElementById('color-text').value = theme.text;
  if (theme.textMuted) document.getElementById('color-muted').value = theme.textMuted;
}

async function saveTheme() {
  const theme = {
    accent: document.getElementById('color-accent').value,
    bg: document.getElementById('color-bg').value,
    cardBg: document.getElementById('color-card').value,
    text: document.getElementById('color-text').value,
    textMuted: document.getElementById('color-muted').value
  };

  // Immediately update local storage so theme applies instantly across all page transitions
  localStorage.setItem('userTheme', JSON.stringify(theme));
  applyThemeToDOM(theme);

  const statusEl = document.getElementById('theme-status');
  showThemeStatus("Saving theme...", "#ffaa00");

  if (typeof wsSendJson === 'function' && wsSendJson({
    cmd: "save_theme_config",
    data: {
      themeConfigText: JSON.stringify(theme, null, 2)
    }
  })) {
    // Sent via WebSocket
  } else {
    // Fallback: local storage if offline
    localStorage.setItem('userTheme', JSON.stringify(theme));
    showThemeStatus("Saved to local browser storage (offline).", "#00ffcc");
  }
}

function resetDefaultTheme() {
  selectPreset(0);
}

function showThemeStatus(msg, color) {
  const el = document.getElementById('theme-status');
  if (el) {
    el.textContent = msg;
    el.style.color = color || "#00ffcc";
  }
}

// WS Callback when save_theme_config succeeds
window.addEventListener('ws_message', (e) => {
  const msg = e.detail;
  if (msg.cmd === "save_theme_config_ok") {
    showThemeStatus("Theme saved successfully!", "#00ffcc");
  } else if (msg.cmd === "save_theme_config_err") {
    showThemeStatus("Error saving theme!", "#ff4444");
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  renderPresets();
  attachColorInputListeners();

  const theme = await loadAndApplyTheme();
  syncInputsFromTheme(theme);
});
