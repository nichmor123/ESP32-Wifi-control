async function loadAndApplyTheme() {
  let theme = null;

  try {
    const res = await fetch("/config/theme.json?v=" + Date.now(), { cache: "no-store" });
    if (res.ok) {
      theme = await res.json();
      if (theme) {
        localStorage.setItem('userTheme', JSON.stringify(theme));
      }
    }
  } catch (e) {
    // theme.json may not exist yet
  }

  if (!theme) {
    const local = localStorage.getItem('userTheme');
    if (local) {
      try { theme = JSON.parse(local); } catch (err) {}
    }
  }

  if (!theme) {
    theme = {
      accent: "#00ffcc",
      bg: "#111111",
      cardBg: "#1c1c1c",
      text: "#eeeeee",
      textMuted: "#888888"
    };
  }

  applyThemeToDOM(theme);
  return theme;
}

function applyThemeToDOM(theme) {
  if (!theme) return;
  const root = document.documentElement;
  if (theme.accent) root.style.setProperty('--accent-color', theme.accent);
  if (theme.bg) root.style.setProperty('--bg-color', theme.bg);
  if (theme.cardBg) root.style.setProperty('--card-bg', theme.cardBg);
  if (theme.text) root.style.setProperty('--text-color', theme.text);
  if (theme.textMuted) root.style.setProperty('--text-muted', theme.textMuted);
}

// 1. Instant synchronous theme application from localStorage or defaults
function initThemeSync() {
  const local = localStorage.getItem('userTheme');
  if (local) {
    try {
      const theme = JSON.parse(local);
      applyThemeToDOM(theme);
      return theme;
    } catch (e) {}
  }
  const defaultTheme = {
    accent: "#00ffcc",
    bg: "#111111",
    cardBg: "#1c1c1c",
    text: "#eeeeee",
    textMuted: "#888888"
  };
  applyThemeToDOM(defaultTheme);
  return defaultTheme;
}

// Execute immediately upon script load (0ms delay / no flash)
let currentTheme = initThemeSync();

// Background sync from ESP32 theme.json
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadAndApplyTheme);
} else {
  loadAndApplyTheme();
}
