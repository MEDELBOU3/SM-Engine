/**
 * advanced_modeling_ui.js
 * ─────────────────────────────────────────────────────────────────
 * Unified UI exposure for advanced modeling tools.
 * Styles and methods exposed for InspectorPanel integration.
 * (Auto-mounting on standard view is disabled to prevent default display)
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  "use strict";

  // ── Styles Injection ───────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("adv-modeling-styles")) return;
    const s = document.createElement("style");
    s.id = "adv-modeling-styles";
    s.textContent = `
/* ── Container & Buttons ── */
#adv-modeling-panel {
    display: flex;
    flex-direction: column;
    gap: 0;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 11px;
    color: #c8d0dc;
    user-select: none;
}
.adv-section { border-bottom: 1px solid rgba(255,255,255,.06); }
.adv-section-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 7px 10px; cursor: pointer; background: rgba(255,255,255,.02);
    font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #8a96a8; transition: background .14s;
}
.adv-section-hdr:hover { background: rgba(255,255,255,.05); color: #c8d0dc; }
.adv-section-hdr i { font-size: 9px; transition: transform .2s; }
.adv-section-hdr.open i { transform: rotate(180deg); }
.adv-section-body { padding: 8px 8px 10px; display: none; flex-direction: column; gap: 6px; }
.adv-section-body.open { display: flex; }
.adv-tool-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.adv-tool-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
.adv-tool-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
.adv-btn {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 3px; min-height: 40px; padding: 5px 3px; border: 1px solid rgba(255,255,255,.08);
    border-radius: 5px; background: rgba(255,255,255,.03); color: #aeb8c6; font-size: 9px;
    cursor: pointer; transition: background .14s, border-color .14s, color .14s; text-align: center;
}
.adv-btn:hover { background: rgba(88,160,255,.14); border-color: rgba(88,160,255,.4); color: #e6eeff; }
.adv-btn.active { background: rgba(88,160,255,.22); border-color: rgba(88,160,255,.5); color: #ffffff; }
.adv-status { margin: 4px 0 0; padding: 5px 8px; border-radius: 4px; background: rgba(18,22,28,.8); border: 1px solid rgba(255,255,255,.06); font-size: 9.5px; color: #7da8ff; }
    `;
    document.head.appendChild(s);
  }

  // Global exposure without auto-injecting into default inspector
  window.AdvancedModelingUI = {
    injectStyles,
    isReady: true
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectStyles, { once: true });
  } else {
    injectStyles();
  }
})();