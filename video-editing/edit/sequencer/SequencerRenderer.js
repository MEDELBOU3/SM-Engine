/**
 * SequencerRenderer.js
 * Professional After Effects / Unreal inspired timeline presentation layer.
 * Keeps the existing SequencerState / SequencerInteraction architecture intact.
 */
(function () {
    'use strict';
    const MIN_CONTENT_WIDTH = 1800;
    const TIME_RIGHT_PADDING = 360;
    const STYLE_ID = 'sm-professional-sequencer-styles';
    const SVG = {
        eye: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        speaker: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>',
        lock: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
        play: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>',
        pause: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
        scissors: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8.5L20 20M8.5 15.5L20 4"/></svg>',
        marker: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2l4 7 7 1-5 5 1 7-7-3-7 3 1-7-5-5 7-1z"/></svg>',
        text: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 5h14M12 5v14M9 19h6"/></svg>',
        rect: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
        plus: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
        cursor: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l7 18 2.5-8L22 10.5z"/></svg>',
        zoomIn: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L21 21M10 7v6M7 10h6"/></svg>',
        zoomOut: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L21 21M7 10h6"/></svg>',
        film: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/></svg>',
        music: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
        chevron: '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M8 5l7 7-7 7"/></svg>'
    };
    const BADGE = { video: 'VID', image: 'IMG', gif: 'GIF', audio: 'AUD', text: 'TXT', solid: 'SOL' };
    function themeVar(name, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return value || fallback || '';
    }
    function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#sequencer-root.sequencer-root {
    --sq-bg: var(--timeline-surface-0, #202124);
    --sq-bg-1: var(--timeline-surface-1, #25272a);
    --sq-bg-2: var(--timeline-surface-2, #2b2d31);
    --sq-bg-3: var(--timeline-surface-3, #303238);
    --sq-border: var(--timeline-border, #4d4d4d);
    --sq-border-strong: var(--timeline-border-strong, #5a5a5a);
    --sq-text: var(--text-primary, #ffffff);
    --sq-muted: var(--text-muted, #8e8e96);
    --sq-soft: var(--timeline-text-soft, #b0b0b0);
    --sq-hover: var(--timeline-surface-hover, #474747);
    --sq-selected: var(--timeline-layer-item-selected-bg, #525252);
    --sq-playhead: var(--video-playhead, var(--timeline-playhead, #57f5d0));
    --sq-grid-major: var(--timeline-grid-line-major, rgba(255, 255, 255, 0.1));
    --sq-grid-minor: var(--timeline-grid-line-minor, rgba(255, 255, 255, 0.05));
    --sq-track-h: var(--sq-track-height, 34px);
    --sq-head-w: var(--sq-header-width, 380px);

    position: absolute;
    inset: auto 0 0 0;
    height: var(--sequencer-live-height, var(--timeline-live-height, var(--timeline-height, 260px)));
    min-height: 140px;
    display: flex;
    flex-direction: column;
    overflow: visible;
    background: var(--sq-bg);
    border-top: 1px solid var(--sq-border-strong);
    box-shadow: var(--shadow-heavy, 0 10px 30px rgba(0,0,0,0.6));
    z-index: 40;
    color: var(--sq-text);
    font-family: var(--cb-font, 'Segoe UI', system-ui, sans-serif);
    font-size: 11px;
    user-select: none;
}

#sequencer-root *, #sequencer-root *::before, #sequencer-root *::after { box-sizing: border-box; }
#sequencer-root button, #sequencer-root select, #sequencer-root input { font: inherit; color: inherit; outline: none; }

/* === PRO RESIZE SPLITTER === */
#sequencer-root .sequencer-splitter {
    position: absolute;
    left: 0;
    right: 0;
    top: -5px;
    height: 10px;
    z-index: 120;
    cursor: ns-resize;
    touch-action: none;
    user-select: none;
    background: transparent;
}
#sequencer-root .sequencer-splitter::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 4px;
    height: 2px;
    background: var(--sq-border-strong);
    transition: height 0.12s ease, background 0.12s ease;
}
#sequencer-root .sequencer-splitter::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 2px;
    width: 48px;
    height: 4px;
    transform: translateX(-50%);
    border-radius: 999px;
    background: var(--text-muted);
    opacity: 0.3;
    transition: opacity 0.12s ease, background 0.12s ease;
}
#sequencer-root .sequencer-splitter:hover::before,
#sequencer-root .sequencer-splitter.dragging::before {
    height: 3px;
    background: var(--accent-info, #00bcd4);
    box-shadow: 0 0 8px rgba(0, 188, 212, 0.4);
}
#sequencer-root .sequencer-splitter:hover::after,
#sequencer-root .sequencer-splitter.dragging::after {
    background: #ffffff;
    opacity: 0.8;
}
body.sequencer-resizing, body.sequencer-resizing * {
    cursor: ns-resize !important;
    user-select: none !important;
}

/* === TIMELINE TOOLBAR === */
#sequencer-root .sequencer-toolbar {
    position: relative;
    z-index: 10;
    height: var(--toolbar-height, 34px);
    min-height: var(--toolbar-height, 34px);
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    background: var(--app-toolbar-bg, var(--secondary-dark));
    border-bottom: 1px solid var(--sq-border);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
#sequencer-root .sequencer-toolbar-group {
    height: 26px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 6px;
    margin-right: 3px;
    border-right: 1px solid var(--panel-soft-border, rgba(255, 255, 255, 0.08));
}
#sequencer-root .sequencer-toolbar-group:last-child { border-right: 0; }
#sequencer-root .sequencer-toolbar-right { margin-left: auto; margin-right: 0; padding-right: 0; }

#sequencer-root .sequencer-icon-btn,
#sequencer-root .sequencer-tool-btn {
    height: 24px;
    min-width: 26px;
    border: 1px solid var(--input-border, #565656);
    background: var(--bg-button, #3c3c3c);
    color: var(--text-secondary, #b0b0b0);
    border-radius: var(--radius, 3px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 7px;
    cursor: pointer;
    font-size: 10.5px;
    transition: all 0.12s ease;
}
#sequencer-root .sequencer-icon-btn:hover,
#sequencer-root .sequencer-tool-btn:hover {
    background: var(--bg-button-hover, #4d4d4d);
    color: var(--text-primary, #ffffff);
    border-color: var(--timeline-border-strong);
}
#sequencer-root .sequencer-tool-btn.active {
    background: var(--active-bg, var(--accent-blue-dark));
    color: #ffffff;
    border-color: var(--input-focus-border, #65778d);
}
#sequencer-root .btn-play.active {
    background: var(--timeline-success-surface, #454545);
    color: var(--accent-success, #4caf50);
    border-color: var(--accent-success);
}
#sequencer-root .sequencer-check {
    height: 24px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 4px;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 10px;
}
#sequencer-root .sequencer-check input {
    width: 12px;
    height: 12px;
    margin: 0;
    accent-color: var(--accent-info, #00bcd4);
    cursor: pointer;
}
#sequencer-root .sequencer-view-select {
    height: 24px;
    min-width: 82px;
    border: 1px solid var(--input-border, #565656);
    background: var(--input-bg, #333333);
    color: var(--text-secondary);
    border-radius: var(--radius, 3px);
    padding: 0 18px 0 6px;
    font-size: 10px;
    cursor: pointer;
}
#sequencer-root .sequencer-timecode {
    height: 24px;
    min-width: 140px;
    padding: 0 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--timeline-surface-0);
    border: 1px solid var(--input-border);
    color: var(--text-primary);
    border-radius: var(--radius, 3px);
    font: 10.5px/1 var(--cb-font-mono, 'Consolas', monospace);
    letter-spacing: 0.3px;
}

/* === MAIN SCROLLER & RULER === */
#sequencer-root .sequencer-scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--video-bg-0, #202124);
    scrollbar-width: thin;
    scrollbar-color: var(--video-scroll-thumb, #555a61) var(--video-scroll-track, #1c1d20);
}
#sequencer-root .sequencer-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
#sequencer-root .sequencer-scroll::-webkit-scrollbar-track { background: var(--video-scroll-track, #1c1d20); }
#sequencer-root .sequencer-scroll::-webkit-scrollbar-thumb {
    background: var(--video-scroll-thumb, #555a61);
    border-radius: 4px;
}
#sequencer-root .sequencer-scroll::-webkit-scrollbar-thumb:hover { background: var(--video-scroll-thumb-hover, #686e77); }

#sequencer-root .sequencer-inner { position: relative; min-height: 100%; background: var(--sq-bg); }

#sequencer-root .sequencer-ruler {
    position: sticky;
    top: 0;
    height: var(--sq-ruler-height, 28px);
    min-height: var(--sq-ruler-height, 28px);
    z-index: 30;
    background: var(--timeline-scale-bg, #444444);
    border-bottom: 1px solid var(--timeline-border);
}
#sequencer-root .sequencer-ruler-corner {
    position: sticky;
    left: 0;
    top: 0;
    width: var(--sq-head-w);
    height: 100%;
    z-index: 40;
    display: grid;
    grid-template-columns: 22px 22px 20px 20px 20px minmax(100px, 1fr) 62px 64px;
    align-items: center;
    padding: 0 4px;
    background: var(--timeline-header-bg, #3e3e3e);
    border-right: 1px solid var(--timeline-border);
}
#sequencer-root .sq-corner-cell {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--timeline-text-faint);
    font-size: 9px;
    font-weight: 600;
}
#sequencer-root .sq-corner-name {
    justify-content: flex-start;
    padding-left: 6px;
    color: var(--timeline-text-soft);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    font-size: 9px;
}
#sequencer-root .sequencer-ruler-canvas {
    position: sticky;
    top: 0;
    z-index: 32;
    display: block;
    cursor: crosshair;
    background: transparent;
}
#sequencer-root .sequencer-workarea {
    position: absolute;
    top: 0;
    height: 4px;
    background: var(--accent-success, #4caf50);
    z-index: 33;
    pointer-events: none;
}
#sequencer-root .sequencer-workarea::before, #sequencer-root .sequencer-workarea::after {
    content: "";
    position: absolute;
    top: 0;
    width: 4px;
    height: 7px;
    background: var(--accent-success, #4caf50);
}
#sequencer-root .sequencer-workarea::before { left: 0; border-radius: 1px 0 0 1px; }
#sequencer-root .sequencer-workarea::after { right: 0; border-radius: 0 1px 1px 0; }

#sequencer-root .sequencer-playhead-handle {
    position: absolute;
    top: 2px;
    width: 12px;
    height: 14px;
    z-index: 45;
    cursor: ew-resize;
    background: var(--sq-playhead);
    clip-path: polygon(0 0, 100% 0, 100% 65%, 50% 100%, 0 65%);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}
#sequencer-root .sequencer-playhead-line {
    position: absolute;
    top: 0;
    width: 1px;
    background: var(--sq-playhead);
    z-index: 25;
    pointer-events: none;
    box-shadow: 0 0 3px rgba(87, 245, 208, 0.4);
}

/* === TRACK LANES & CONTINUOUS RESIZE GRID === */
#sequencer-root .sequencer-lanes {
    position: relative;
    min-height: 100%;
    background: var(--video-track-lane-bg, #202124);
    overflow: hidden;
}

/* Continues the timeline track lanes and grid across the entire free area when resized */
#sequencer-root .sequencer-lanes::before {
    content: "";
    position: absolute;
    left: var(--sq-head-w, 380px);
    right: 0;
    top: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 0;
    background-image:
        linear-gradient(to right, var(--sq-grid-major) 1px, transparent 1px),
        linear-gradient(to right, var(--sq-grid-minor) 1px, transparent 1px),
        repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent calc(var(--sq-track-h, 34px) - 1px),
            var(--timeline-border, #4d4d4d) calc(var(--sq-track-h, 34px) - 1px),
            var(--timeline-border, #4d4d4d) var(--sq-track-h, 34px)
        );
    background-size:
        var(--sq-major-grid, 60px) 100%,
        var(--sq-minor-grid, 12px) 100%,
        100% var(--sq-track-h, 34px);
    background-position: 0 0, 0 0, 0 0;
    opacity: 0.65;
}

/* Continues the left header tracks column pattern across the entire height */
#sequencer-root .sequencer-lanes::after {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--sq-head-w, 380px);
    pointer-events: none;
    z-index: 0;
    background:
        repeating-linear-gradient(
            to bottom,
            var(--video-track-label-bg, #2a2c30) 0,
            var(--video-track-label-bg, #2a2c30) calc(var(--sq-track-h, 34px) - 1px),
            var(--timeline-border, #4d4d4d) calc(var(--sq-track-h, 34px) - 1px),
            var(--timeline-border, #4d4d4d) var(--sq-track-h, 34px)
        );
    border-right: 1px solid var(--sq-border-strong, #5a5a5a);
}

#sequencer-root .sequencer-lane {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: var(--sq-head-w, 380px) 1fr;
    height: var(--sq-track-h, 34px);
    min-height: var(--sq-track-h, 34px);
    border-bottom: 1px solid rgba(0, 0, 0, 0.35);
}
#sequencer-root .sequencer-lane:nth-of-type(even) .sequencer-lane-body { background-color: var(--timeline-row-even, #383838); }
#sequencer-root .sequencer-lane:nth-of-type(odd) .sequencer-lane-body { background-color: var(--timeline-row-odd, #434343); }

#sequencer-root .sequencer-lane-head {
    position: sticky;
    left: 0;
    z-index: 22;
    height: 100%;
    display: grid;
    grid-template-columns: 22px 22px 20px 20px 20px minmax(100px, 1fr) 62px 64px;
    align-items: center;
    padding: 0 4px;
    background: var(--video-track-label-bg, #2a2c30);
    border-right: 1px solid var(--timeline-border);
}
#sequencer-root .sequencer-lane:hover .sequencer-lane-head { background: var(--timeline-surface-hover, #474747); }
#sequencer-root .sequencer-lane.active-track .sequencer-lane-head {
    background: var(--timeline-layer-item-selected-bg, #525252);
    box-shadow: inset 2px 0 var(--accent-info, #00bcd4);
}
#sequencer-root .sq-track-index {
    color: var(--text-muted);
    font: 9.5px var(--cb-font-mono, monospace);
    text-align: center;
}
#sequencer-root .sq-track-color {
    width: 4px;
    height: 18px;
    border-radius: 1px;
    margin: 0 auto;
    background: var(--video-clip-video-edge, #c08f62);
}
#sequencer-root .sequencer-lane[data-track-type="audio"] .sq-track-color { background: var(--video-clip-audio-edge, #89b875); }

#sequencer-root .sequencer-track-btn {
    width: 18px;
    height: 18px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    cursor: pointer;
    padding: 0;
    transition: all 0.1s ease;
}
#sequencer-root .sequencer-track-btn:hover { background: var(--panel-hover-bg, rgba(255,255,255,0.08)); color: #ffffff; }
#sequencer-root .sequencer-track-btn.on { color: #ffffff; }
#sequencer-root .sequencer-track-btn.off { color: var(--text-muted); opacity: 0.45; }
#sequencer-root .btn-mute.on { color: var(--accent-warning, #ffcc00); }
#sequencer-root .btn-lock.on { color: var(--accent-warning, #ffcc00); }
#sequencer-root .sq-solo-btn.on { color: var(--accent-warning, #ffcc00); }

#sequencer-root .sequencer-lane-title {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    padding-left: 4px;
    overflow: hidden;
}
#sequencer-root .sequencer-lane-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
    font-size: 10.5px;
    font-weight: 500;
}
#sequencer-root .sq-track-select {
    width: 100%;
    height: 20px;
    border: 1px solid var(--input-border, #565656);
    background: var(--input-bg, #333333);
    color: var(--text-secondary);
    font-size: 9px;
    padding: 0 2px;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
}

/* === TIMELINE BODY & CLIPS === */
#sequencer-root .sequencer-lane-body {
    position: relative;
    height: 100%;
    overflow: hidden;
    background-image:
        linear-gradient(to right, var(--sq-grid-major) 1px, transparent 1px),
        linear-gradient(to right, var(--sq-grid-minor) 1px, transparent 1px);
    background-size: var(--sq-major-grid, 60px) 100%, var(--sq-minor-grid, 12px) 100%;
}

#sequencer-root .sequencer-clip {
    position: absolute;
    top: 2px;
    height: calc(var(--sq-track-h) - 4px);
    z-index: 8;
    min-width: 6px;
    padding: 0 4px;
    display: flex;
    align-items: center;
    border: 1px solid rgba(0, 0, 0, 0.4);
    border-left: 3px solid var(--video-clip-video-edge, #c08f62);
    border-radius: 2px;
    background: var(--video-clip-video-bg, #514336);
    color: var(--text-primary);
    overflow: hidden;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    user-select: none;
}
#sequencer-root .sequencer-clip[data-media-type="audio"] { background: var(--video-clip-audio-bg, #41563a); border-left-color: var(--video-clip-audio-edge, #89b875); }
#sequencer-root .sequencer-clip[data-media-type="image"],
#sequencer-root .sequencer-clip[data-media-type="gif"]   { background: var(--video-clip-image-bg, #5f4d3c); border-left-color: var(--video-clip-image-edge, #d6a16a); }
#sequencer-root .sequencer-clip[data-media-type="text"],
#sequencer-root .sequencer-clip[data-media-type="solid"] { background: var(--timeline-surface-3, #383838); border-left-color: var(--timeline-border-strong, #5a5a5a); }

#sequencer-root .sequencer-clip:hover { filter: brightness(1.08); }
#sequencer-root .sequencer-clip.selected {
    outline: 1px solid #ffffff;
    box-shadow: 0 0 0 1px var(--accent-info, #00bcd4);
    z-index: 10;
}
#sequencer-root .sequencer-clip-name {
    font-size: 9.5px;
    font-weight: 500;
    color: #ffffff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
#sequencer-root .sq-trim-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    z-index: 12;
    cursor: ew-resize;
    opacity: 0;
    background: rgba(255, 255, 255, 0.1);
    transition: opacity 0.1s ease;
}
#sequencer-root .sq-trim-handle.left { left: 0; border-left: 2px solid #ffffff; }
#sequencer-root .sq-trim-handle.right { right: 0; border-right: 2px solid #ffffff; }
#sequencer-root .sequencer-clip:hover .sq-trim-handle,
#sequencer-root .sequencer-clip.selected .sq-trim-handle { opacity: 1; }

#sequencer-root .sq-clip-key {
    position: absolute;
    width: 6px;
    height: 6px;
    background: var(--timeline-keyframe-selected-bg, #c8c8c8);
    border: 1px solid #000000;
    transform: translateX(-50%) rotate(45deg);
    top: 2px;
}

/* === STATUS BAR === */
#sequencer-root .sequencer-bottom-status {
    height: 22px;
    min-height: 22px;
    display: flex;
    align-items: center;
    padding: 0 8px;
    background: var(--status-bar-bg, var(--panel-bg));
    border-top: 1px solid var(--status-bar-border, var(--border-color));
    color: var(--status-bar-text, var(--text-secondary));
    font-size: 9.5px;
    gap: 10px;
}
#sequencer-root .sq-status-spacer { flex: 1; }
#sequencer-root .sq-zoom-readout { font: 9.5px var(--cb-font-mono, monospace); color: var(--timeline-text-soft); }

@media (max-width: 1100px) {
    #sequencer-root .sequencer-tool-btn span { display: none; }
    #sequencer-root .sequencer-timecode { min-width: 120px; }
}
`;
    document.head.appendChild(style);
}
    class SequencerRenderer {
        constructor(state, snap) {
            this.state = state;
            this.snap = snap;
            this.el = {};
            this.laneEls = new Map();
            this.clipEls = new Map();
            this.headEls = new Map();
            this.markerEls = new Map();
            this.toggleEls = { vis: new Map(), mute: new Map(), lock: new Map(), solo: new Map() };
            this.actions = {};
            this._devPx = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
            this._rulerCtx = null;
            this._dirty = false;
        }
        setActions(actions) { this.actions = actions || {}; }
        build(root) {
            injectStyles();
            this.el.root = root;
            root.classList.add('sequencer-root');
            root.innerHTML = '';
            const toolbar = document.createElement('div');
            toolbar.className = 'sequencer-toolbar';
            const scroll = document.createElement('div');
            scroll.className = 'sequencer-scroll';
            const inner = document.createElement('div');
            inner.className = 'sequencer-inner';
            const ruler = document.createElement('div');
            ruler.className = 'sequencer-ruler';
            const corner = document.createElement('div');
            corner.className = 'sequencer-ruler-corner';
            corner.innerHTML = '<span class="sq-corner-cell">#</span><span class="sq-corner-cell">' + SVG.eye + '</span><span class="sq-corner-cell">' + SVG.speaker + '</span><span class="sq-corner-cell">S</span><span class="sq-corner-cell">' + SVG.lock + '</span><span class="sq-corner-cell sq-corner-name">Layer</span><span class="sq-corner-cell">Mode</span><span class="sq-corner-cell">Matte</span>';
            const workArea = document.createElement('div');
            workArea.className = 'sequencer-workarea';
            const rulerCanvas = document.createElement('canvas');
            rulerCanvas.className = 'sequencer-ruler-canvas';
            const rulerHandle = document.createElement('div');
            rulerHandle.className = 'sequencer-playhead-handle';
            rulerHandle.title = 'Current Time Indicator — drag to scrub';
            ruler.append(corner, workArea, rulerCanvas, rulerHandle);
            const lanes = document.createElement('div');
            lanes.className = 'sequencer-lanes';
            const playheadLine = document.createElement('div');
            playheadLine.className = 'sequencer-playhead-line';
            const emptyHint = document.createElement('div');
            emptyHint.className = 'sequencer-empty-hint';
            emptyHint.textContent = 'Drop media here or use Add Media / Text / Solid';
            lanes.append(playheadLine, emptyHint);
            const bottomStatus = document.createElement('div');
            bottomStatus.className = 'sequencer-bottom-status';
            bottomStatus.innerHTML = '<span class="sq-status-left">Ready</span><span class="sq-status-spacer"></span><span class="sq-zoom-readout">100%</span>';
            inner.append(ruler, lanes);
            scroll.appendChild(inner);
            root.append(toolbar, scroll, bottomStatus);
            this.el.toolbar = toolbar;
            this.el.scroll = scroll;
            this.el.inner = inner;
            this.el.ruler = ruler;
            this.el.rulerCorner = corner;
            this.el.workArea = workArea;
            this.el.rulerCanvas = rulerCanvas;
            this.el.rulerHandle = rulerHandle;
            this.el.lanes = lanes;
            this.el.playheadLine = playheadLine;
            this.el.emptyHint = emptyHint;
            this.el.bottomStatus = bottomStatus;
            this.el.zoomReadout = bottomStatus.querySelector('.sq-zoom-readout');
            this._rulerCtx = rulerCanvas.getContext('2d', { alpha: true });
            this._buildToolbar();
            this._buildTracks();
            this.render();
        }
        _buildToolbar() {
            const tb = this.el.toolbar;
            tb.innerHTML = '';
            const transport = this._group();
            this.el.playBtn = this._iconButton('Play / Pause (Space)', SVG.play, 'btn-play');
            transport.appendChild(this.el.playBtn);
            const tools = this._group();
            this.el.toolSelect = this._toolButton('select', 'Select', SVG.cursor);
            this.el.toolRazor = this._toolButton('razor', 'Cut', SVG.scissors);
            tools.append(this.el.toolSelect, this.el.toolRazor);
            const add = this._group();
            this.el.btnMarker = this._iconButton('Marker at playhead', SVG.marker, 'btn-marker');
            this.el.btnText = this._iconButton('Add Text', SVG.text, 'btn-text');
            this.el.btnSolid = this._iconButton('Add Solid', SVG.rect, 'btn-solid');
            this.el.btnMedia = this._iconButton('Import Media', SVG.plus, 'btn-media');
            add.append(this.el.btnMarker, this.el.btnText, this.el.btnSolid, this.el.btnMedia);
            const toggles = this._group();
            this.el.tglSnap = this._check('snap', 'Snap');
            this.el.tglWave = this._check('waveforms', 'Wave');
            this.el.tglThumb = this._check('thumbnails', 'Thumb');
            toggles.append(this.el.tglSnap, this.el.tglWave, this.el.tglThumb);
            const view = this._group();
            this.el.zoomOutBtn = this._iconButton('Zoom Out', SVG.zoomOut, 'btn-zoom-out');
            this.el.zoomInBtn = this._iconButton('Zoom In', SVG.zoomIn, 'btn-zoom-in');
            const select = document.createElement('select');
            select.className = 'sequencer-view-select';
            [['fit', 'Fit'], ['25', '25%'], ['50', '50%'], ['100', '100%'], ['200', '200%']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; select.appendChild(o); });
            select.addEventListener('change', () => this.actions.onViewChange?.(select.value));
            this.el.viewSelect = select;
            view.append(this.el.zoomOutBtn, this.el.zoomInBtn, select);
            const right = this._group('sequencer-toolbar-right');
            this.el.timecode = document.createElement('span');
            this.el.timecode.className = 'sequencer-timecode';
            right.appendChild(this.el.timecode);
            tb.append(transport, tools, add, toggles, view, right);
        }
        _group(extra) { const g = document.createElement('div'); g.className = 'sequencer-toolbar-group' + (extra ? ' ' + extra : ''); return g; }
        _toolButton(id, label, svg) {
            const b = document.createElement('button');
            b.className = 'sequencer-tool-btn';
            b.dataset.tool = id;
            b.title = label + (id === 'razor' ? ' (C)' : ' (V)');
            b.innerHTML = svg + '<span>' + label + '</span>';
            b.addEventListener('click', () => this.actions.onTool?.(id));
            return b;
        }
        _iconButton(label, svg, cls) {
            const b = document.createElement('button');
            b.className = 'sequencer-icon-btn ' + (cls || '');
            b.title = label;
            b.innerHTML = svg;
            b.addEventListener('click', () => {
                if (cls === 'btn-marker') this.actions.onMarker?.();
                else if (cls === 'btn-text') this.actions.onText?.();
                else if (cls === 'btn-solid') this.actions.onSolid?.();
                else if (cls === 'btn-media') this.actions.onMedia?.();
                else if (cls === 'btn-play') this.actions.onPlay?.();
                else if (cls === 'btn-zoom-in') this.actions.onZoomIn?.();
                else if (cls === 'btn-zoom-out') this.actions.onZoomOut?.();
            });
            return b;
        }
        _check(name, label) {
            const wrap = document.createElement('label');
            wrap.className = 'sequencer-check';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = name;
            const span = document.createElement('span');
            span.textContent = label;
            wrap.append(input, span);
            input.addEventListener('change', () => this.actions.onToggle?.(name, input.checked));
            this.el['tgl_' + name] = input;
            return wrap;
        }
        _svgBtn(svg, cls, title) { const b = document.createElement('button'); b.type = 'button'; b.className = 'sequencer-track-btn ' + (cls || ''); b.title = title || ''; b.innerHTML = svg; return b; }
        _buildTracks() {
            const s = this.state;
            const lanes = this.el.lanes;
            const modeOptions = ['Normal', 'Multiply', 'Screen', 'Overlay', 'Add', 'Darken', 'Lighten'];
            const matteOptions = ['None', 'Alpha', 'Alpha Inverted', 'Luma', 'Luma Inverted'];
            s.tracks.forEach((t, index) => {
                const row = document.createElement('div');
                row.className = 'sequencer-lane';
                row.dataset.trackId = t.id;
                row.dataset.trackType = t.type;
                const head = document.createElement('div');
                head.className = 'sequencer-lane-head';
                const idx = document.createElement('span');
                idx.className = 'sq-track-index';
                idx.textContent = String(index + 1);
                const vis = this._svgBtn(SVG.eye, 'btn-vis', 'Visibility');
                const mute = this._svgBtn(SVG.speaker, 'btn-mute', 'Mute');
                const solo = this._svgBtn('S', 'sq-solo-btn btn-solo', 'Solo');
                const lock = this._svgBtn(SVG.lock, 'btn-lock', 'Lock');
                const title = document.createElement('span');
                title.className = 'sequencer-lane-title';
                const color = document.createElement('span');
                color.className = 'sq-track-color';
                if (t.color) color.style.background = t.color; else color.style.removeProperty('background');
                const typeIcon = document.createElement('span');
                typeIcon.className = 'sq-track-type';
                typeIcon.innerHTML = t.type === 'audio' ? SVG.music : SVG.film;
                const name = document.createElement('span');
                name.className = 'sequencer-lane-name';
                name.textContent = t.name;
                name.title = t.name + ' — ' + t.type + ' track';
                title.append(color, typeIcon, name);
                const mode = document.createElement('select');
                mode.className = 'sq-track-select sq-mode-select';
                modeOptions.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; mode.appendChild(o); });
                mode.value = t.mode || 'Normal';
                mode.title = 'Track blend mode';
                mode.addEventListener('change', e => { e.stopPropagation(); t.mode = mode.value; this.actions.onTracksChanged?.(); });
                const matte = document.createElement('select');
                matte.className = 'sq-track-select sq-matte-select';
                matteOptions.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; matte.appendChild(o); });
                matte.value = t.matte || 'None';
                matte.title = 'Track matte';
                matte.addEventListener('change', e => { e.stopPropagation(); t.matte = matte.value; this.actions.onTracksChanged?.(); });
                head.append(idx, vis, mute, solo, lock, title, mode, matte);
                const body = document.createElement('div');
                body.className = 'sequencer-lane-body';
                body.dataset.trackId = t.id;
                row.append(head, body);
                lanes.appendChild(row);
                this.laneEls.set(t.id, row);
                this.headEls.set(t.id, head);
                this.toggleEls.vis.set(t.id, vis);
                this.toggleEls.mute.set(t.id, mute);
                this.toggleEls.lock.set(t.id, lock);
                this.toggleEls.solo.set(t.id, solo);
                this._syncTrackButton(vis, t.visible !== false);
                this._syncTrackButton(mute, !!t.muted);
                this._syncTrackButton(lock, !!t.locked);
                this._syncTrackButton(solo, !!t.solo);
            });
        }
        _syncTrackButton(btn, on) { if (!btn) return; btn.classList.toggle('on', !!on); btn.classList.toggle('off', !on); }
        syncTrack(track) {
            this._syncTrackButton(this.toggleEls.vis.get(track.id), track.visible !== false);
            this._syncTrackButton(this.toggleEls.mute.get(track.id), !!track.muted);
            this._syncTrackButton(this.toggleEls.lock.get(track.id), !!track.locked);
            this._syncTrackButton(this.toggleEls.solo.get(track.id), !!track.solo);
            const row = this.laneEls.get(track.id);
            if (row) {
                row.classList.toggle('locked', !!track.locked);
                row.classList.toggle('muted', !!track.muted);
                row.classList.toggle('hidden', track.visible === false);
                const name = row.querySelector('.sequencer-lane-name');
                if (name) name.textContent = track.name;
            }
        }
        _syncTracks() {
            const want = this.state.tracks.map(t => t.id).join('|');
            const have = Array.from(this.laneEls.keys()).join('|');
            if (want === have) { this.state.tracks.forEach(t => this.syncTrack(t)); this.laneEls.forEach(row => row.classList.remove('active-track')); this.state.selectedClips.forEach(c => this.laneEls.get(c.trackId)?.classList.add('active-track')); return; }
            this.el.lanes.querySelectorAll('.sequencer-lane').forEach(n => n.remove());
            this.laneEls.clear(); this.headEls.clear(); this.clipEls.clear();
            Object.values(this.toggleEls).forEach(m => m.clear());
            this._buildTracks();
        }
        render() {
            if (!this.el.root) return;
            this._syncTracks();
            this._syncContentSize();
            this._syncClips();
            this._syncMarkers();
            this.updateRuler();
            this.updatePlayhead();
            this._syncToolbar();
            this._syncScrollPosition();
        }
        _syncContentSize() {
            const s = this.state;
            const trackRowsHeight = s.tracks.length * s.trackHeight;
            // bottomStatus is OUTSIDE .sequencer-scroll, therefore scroll.clientHeight
            // already excludes it. The old `-22` created a permanent dead strip when
            // the timeline was resized taller.
            const availableLaneHeight = Math.max(
                0,
                (this.el.scroll.clientHeight || 0) - s.rulerHeight
            );
            const lanesH = Math.max(trackRowsHeight, availableLaneHeight);
            const end = Math.max(s.maxEnd(), 10);
            const contentW = Math.max(MIN_CONTENT_WIDTH, s.trackHeaderWidth + (end + 20) * s.pixelsPerSecond + TIME_RIGHT_PADDING);
            this.el.root.style.setProperty('--sq-header-width', s.trackHeaderWidth + 'px');
            this.el.root.style.setProperty('--sq-track-height', s.trackHeight + 'px');
            this.el.root.style.setProperty('--sq-major-grid', Math.max(8, s.pixelsPerSecond) + 'px');
            this.el.root.style.setProperty('--sq-minor-grid', Math.max(4, s.pixelsPerSecond / 5) + 'px');
            this.el.inner.style.width = contentW + 'px';
            this.el.lanes.style.height = lanesH + 'px';
            this.el.playheadLine.style.height = lanesH + 'px';
            this.el.emptyHint.style.display = s.clips.length === 0 ? 'flex' : 'none';
            const visibleRulerW = Math.max(100, (this.el.scroll.clientWidth || 800) - s.trackHeaderWidth);
            const cv = this.el.rulerCanvas;
            cv.style.left = s.trackHeaderWidth + 'px';
            cv.style.width = visibleRulerW + 'px';
            cv.style.height = s.rulerHeight + 'px';
            const pxW = Math.max(1, Math.round(visibleRulerW * this._devPx));
            const pxH = Math.max(1, Math.round(s.rulerHeight * this._devPx));
            if (cv.width !== pxW) cv.width = pxW;
            if (cv.height !== pxH) cv.height = pxH;
            this.el.ruler.style.height = s.rulerHeight + 'px';
            this.el.workArea.style.left = (s.trackHeaderWidth + (s.workAreaStart || 0) * s.pixelsPerSecond) + 'px';
            const workEnd = Math.max(s.workAreaEnd || s.maxEnd() || 10, 1);
            this.el.workArea.style.width = Math.max(12, (workEnd - (s.workAreaStart || 0)) * s.pixelsPerSecond) + 'px';
        }
        _syncClips() {
            const wanted = new Set(this.state.clips.map(c => c.id));
            this.clipEls.forEach((el, id) => { if (!wanted.has(id)) { el.remove(); this.clipEls.delete(id); } });
            this.state.clips.forEach(c => {
                let el = this.clipEls.get(c.id);
                if (!el) { el = this._buildClipEl(c); this.clipEls.set(c.id, el); }
                const body = this.el.lanes.querySelector('.sequencer-lane-body[data-track-id="' + c.trackId + '"]');
                if (body && el.parentElement !== body) body.appendChild(el);
                this._syncClipEl(c, el);
            });
        }
        _buildClipEl(c) {
            const el = document.createElement('div');
            el.className = 'sequencer-clip';
            el.dataset.clipId = c.id;
            el.dataset.mediaType = c.mediaType;
            el.title = c.name;
            const visual = document.createElement('div');
            visual.className = 'sq-clip-visual';
            const thumbs = document.createElement('div');
            thumbs.className = 'sq-clip-thumbs';
            const shade = document.createElement('div');
            shade.className = 'sq-clip-shade';
            visual.append(thumbs, shade);
            const header = document.createElement('div');
            header.className = 'sq-clip-header';
            const badge = document.createElement('span'); badge.className = 'sequencer-clip-badge'; badge.textContent = BADGE[c.mediaType] || 'CLP';
            const name = document.createElement('span'); name.className = 'sequencer-clip-name'; name.textContent = c.name;
            const time = document.createElement('span'); time.className = 'sequencer-clip-time';
            header.append(badge, name, time);
            const wave = document.createElement('canvas'); wave.className = 'sequencer-clip-wave';
            const keys = document.createElement('div'); keys.className = 'sq-clip-keyframes';
            const left = document.createElement('span'); left.className = 'sq-trim-handle left'; left.title = 'Trim In';
            const right = document.createElement('span'); right.className = 'sq-trim-handle right'; right.title = 'Trim Out';
            el.append(visual, header, wave, keys, left, right);
            return el;
        }
        _syncClipEl(c, el) {
            const s = this.state;
            const widthPx = Math.max(10, Math.round(c.duration * s.pixelsPerSecond));
            el.style.left = Math.round(c.start * s.pixelsPerSecond) + 'px';
            el.style.width = widthPx + 'px';
            el.style.height = Math.max(22, s.trackHeight - 6) + 'px';
            el.style.top = '3px';
            el.style.removeProperty('border-left-color');
            el.style.removeProperty('background-color');
            el.style.removeProperty('background');
            el.classList.toggle('selected', !!c.selected);
            el.classList.toggle('locked', !!c.locked);
            el.classList.toggle('hidden', c.visible === false);
            el.dataset.mediaType = c.mediaType;
            const name = el.querySelector('.sequencer-clip-name'); if (name) name.textContent = c.name;
            const time = el.querySelector('.sequencer-clip-time'); if (time) time.textContent = SequencerMath.timecode(c.duration, s.fps);
            this._syncMediaPreview(c, el, widthPx);
            this._syncWaveform(c, el.querySelector('canvas.sequencer-clip-wave'), widthPx);
            this._syncClipKeyframes(c, el.querySelector('.sq-clip-keyframes'));
            const row = this.laneEls.get(c.trackId);
            if (row && c.selected) row.classList.add('active-track');
        }
        _syncMediaPreview(c, el, widthPx) {
            const strip = el.querySelector('.sq-clip-thumbs');
            if (!strip) return;
            if (!this.state.showThumbnails || c.mediaType === 'audio' || c.mediaType === 'text' || c.mediaType === 'solid') {
                strip.replaceChildren();
                strip.style.display = 'none';
                strip.dataset.sig = '';
                return;
            }
            const frames = (Array.isArray(c.thumbnails) && c.thumbnails.length ? c.thumbnails : (c.thumb ? [c.thumb] : (c.mediaType === 'image' && c.src ? [c.src] : []))).filter(Boolean);
            if (!frames.length) { strip.replaceChildren(); strip.style.display = 'none'; return; }
            strip.style.display = 'flex';
            const tileW = 72;
            const count = Math.max(1, Math.ceil(widthPx / tileW));
            const sig = frames.join('|') + ':' + count;
            if (strip.dataset.sig === sig) return;
            const frag = document.createDocumentFragment();
            for (let i = 0; i < count; i++) {
                const img = document.createElement('img');
                img.className = 'sq-clip-thumb-tile';
                img.alt = '';
                img.draggable = false;
                img.src = frames[i % frames.length];
                frag.appendChild(img);
            }
            strip.replaceChildren(frag);
            strip.dataset.sig = sig;
        }
        _syncWaveform(c, canvas, widthPx) {
            if (!canvas) return;
            if (c.mediaType !== 'audio' || !this.state.showWaveforms) { canvas.style.display = 'none'; return; }
            canvas.style.display = 'block';
            const cssW = Math.max(1, widthPx - 6);
            const cssH = Math.max(10, this.state.trackHeight - 25);
            const dpr = Math.min(this._devPx || 1, 2);
            const pxW = Math.max(1, Math.round(cssW * dpr));
            const pxH = Math.max(1, Math.round(cssH * dpr));
            if (canvas.width !== pxW) canvas.width = pxW;
            if (canvas.height !== pxH) canvas.height = pxH;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cssW, cssH);
            const peaks = c.audioPeaks && c.audioPeaks.length ? c.audioPeaks : null;
            const mid = cssH * .5;
            ctx.strokeStyle = themeVar('--video-clip-audio-edge', themeVar('--accent-success'));
            ctx.lineWidth = 1;
            ctx.beginPath();
            const samples = Math.max(16, Math.floor(cssW));
            for (let x = 0; x < samples; x++) {
                const p = peaks ? Math.abs(peaks[Math.min(peaks.length - 1, Math.floor(x / samples * peaks.length))] || 0) : (0.2 + 0.65 * Math.abs(Math.sin(x * .17 + (c.id || '').length)));
                const amp = Math.max(1, p * mid * .92);
                const px = x / samples * cssW + .5;
                ctx.moveTo(px, mid - amp); ctx.lineTo(px, mid + amp);
            }
            ctx.stroke();
            ctx.strokeStyle = themeVar('--timeline-grid-line-major', themeVar('--video-border')); ctx.beginPath(); ctx.moveTo(0, mid + .5); ctx.lineTo(cssW, mid + .5); ctx.stroke();
        }
        _syncClipKeyframes(c, host) {
            if (!host) return;
            const maps = c.keyframes || {};
            const grouped = new Map();
            Object.keys(maps).forEach(channel => {
                (maps[channel] || []).forEach(k => {
                    const time = Number(k.time ?? k.t ?? 0);
                    if (!Number.isFinite(time)) return;
                    const frame = Math.round(time * Math.max(1, this.state.fps || 30));
                    const id = String(frame);
                    let group = grouped.get(id);
                    if (!group) {
                        group = { time, channels: [] };
                        grouped.set(id, group);
                    }
                    group.channels.push(channel);
                });
            });
            const all = Array.from(grouped.values()).sort((a, b) => a.time - b.time);
            const localPlayhead = Math.max(0, (this.state.playhead || 0) - (c.start || 0));
            const eps = Math.max(0.0001, 0.45 / Math.max(1, this.state.fps || 30));
            const sig = all.map(k => k.time + ':' + k.channels.join(',')).join('|') + ':' + c.duration + ':' + Math.round(localPlayhead * this.state.fps);
            if (host.dataset.sig === sig) return;
            const frag = document.createDocumentFragment();
            all.forEach(k => {
                const d = document.createElement('span');
                d.className = 'sq-clip-key';
                if (k.channels.length > 1) d.classList.add('multi');
                if (Math.abs(k.time - localPlayhead) <= eps) d.classList.add('current');
                d.title = k.channels.join(', ') + ' @ ' + SequencerMath.timecode(k.time, this.state.fps);
                d.style.left = (Math.max(0, Math.min(1, k.time / Math.max(c.duration, .0001))) * 100) + '%';
                frag.appendChild(d);
            });
            host.replaceChildren(frag);
            host.dataset.sig = sig;
        }
        _syncMarkers() {
            const s = this.state;
            const wanted = new Set(s.markers.map(m => m.id));
            this.markerEls.forEach((pair, id) => { if (!wanted.has(id)) { pair.line.remove(); pair.handle.remove(); this.markerEls.delete(id); } });
            s.markers.forEach(m => {
                let pair = this.markerEls.get(m.id);
                if (!pair) { const line = document.createElement('div'); line.className = 'sequencer-marker-line'; const handle = document.createElement('div'); handle.className = 'sequencer-marker-handle'; handle.title = m.name || 'Marker'; this.el.lanes.appendChild(line); this.el.ruler.appendChild(handle); pair = { line, handle }; this.markerEls.set(m.id, pair); }
                const x = s.trackHeaderWidth + m.time * s.pixelsPerSecond; pair.line.style.left = Math.round(x) + 'px'; pair.line.style.height = this.el.lanes.style.height; pair.handle.style.left = Math.round(x - 4) + 'px';
            });
        }
        refreshLayout() { this._syncContentSize(); this._syncClips(); this._syncMarkers(); this.updateRuler(); this.updatePlayhead(); }
        updateClip(c) { const el = this.clipEls.get(c.id); if (el) this._syncClipEl(c, el); }
        moveClipToTrack(c) { const el = this.clipEls.get(c.id); const body = this.el.lanes.querySelector('.sequencer-lane-body[data-track-id="' + c.trackId + '"]'); if (el && body && el.parentElement !== body) body.appendChild(el); }
        updateRuler() {
            const s = this.state, ctx = this._rulerCtx, cv = this.el.rulerCanvas; if (!ctx || !cv.width) return;
            const w = cv.width / this._devPx, h = cv.height / this._devPx; ctx.setTransform(this._devPx, 0, 0, this._devPx, 0, 0); ctx.clearRect(0, 0, w, h); ctx.fillStyle = themeVar('--timeline-scale-bg', themeVar('--video-bg-2')); ctx.fillRect(0, 0, w, h);
            const pps = s.pixelsPerSecond, fps = s.fps || 30, startT = Math.max(0, s.scrollTime), endT = startT + w / pps;
            let majorSec = 1; if (pps < 25) majorSec = 5; else if (pps < 50) majorSec = 2; else if (pps > 180) majorSec = .5;
            const minorSec = majorSec / 5;
            const firstMinor = Math.floor(startT / minorSec) * minorSec;
            ctx.textBaseline = 'top'; ctx.font = '9px "Cascadia Code",Consolas,monospace';
            for (let t = firstMinor; t <= endT + minorSec; t += minorSec) { const x = (t - startT) * pps; const major = Math.abs((t / majorSec) - Math.round(t / majorSec)) < 1e-5; ctx.strokeStyle = major ? themeVar('--timeline-grid-line-major', themeVar('--video-border-strong')) : themeVar('--timeline-grid-line-minor', themeVar('--video-border')); ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, major ? 8 : 15); ctx.lineTo(Math.round(x) + .5, h); ctx.stroke(); if (major) { ctx.fillStyle = themeVar('--timeline-text-soft', themeVar('--video-text-muted')); const frame = Math.round(t * fps); const label = pps >= 90 ? SequencerMath.timecode(t, fps) : String(frame).padStart(4, '0'); ctx.fillText(label, x + 4, 9); } }
            ctx.fillStyle = themeVar('--timeline-border', themeVar('--video-border')); ctx.fillRect(0, h - 1, w, 1);
        }
        updatePlayhead() {
            const s = this.state; s.playhead = Math.max(0, Number(s.playhead) || 0); const x = s.trackHeaderWidth + s.playhead * s.pixelsPerSecond; this.el.playheadLine.style.left = Math.round(x) + 'px'; this.el.rulerHandle.style.left = Math.round(x - 6) + 'px'; if (this.el.timecode) this.el.timecode.textContent = SequencerMath.timecode(s.playhead, s.fps) + '  /  ' + SequencerMath.timecode(s.maxEnd(), s.fps); this.el.playheadLine.classList.toggle('playing', !!s.playing);
        }
        _syncToolbar() {
            const s = this.state; this.el.toolSelect?.classList.toggle('active', s.activeTool === 'select'); this.el.toolRazor?.classList.toggle('active', s.activeTool === 'razor'); this.el.playBtn?.classList.toggle('active', !!s.playing); if (this.el.playBtn) this.el.playBtn.innerHTML = s.playing ? SVG.pause : SVG.play; if (this.el.tgl_snap) this.el.tgl_snap.checked = !!s.snapEnabled; if (this.el.tgl_waveforms) this.el.tgl_waveforms.checked = !!s.showWaveforms; if (this.el.tgl_thumbnails) this.el.tgl_thumbnails.checked = !!s.showThumbnails; if (this.el.zoomReadout) this.el.zoomReadout.textContent = Math.round((s.pixelsPerSecond / 60) * 100) + '%'; const st = this.el.bottomStatus?.querySelector('.sq-status-left'); if (st) st.textContent = s.clips.length + ' clips  •  ' + s.tracks.length + ' tracks  •  ' + s.fps + ' fps';
        }
        setPlaying(playing) { this.state.playing = !!playing; this._syncToolbar(); this.updatePlayhead(); }
        _syncScrollPosition() { const target = Math.max(0, Math.round(this.state.scrollTime * this.state.pixelsPerSecond)); if (Math.abs(this.el.scroll.scrollLeft - target) > 1) this.el.scroll.scrollLeft = target; }
        syncScrollFromElement() { this.state.scrollTime = Math.max(0, (this.el.scroll.scrollLeft || 0) / this.state.pixelsPerSecond); }
        scheduleRulerUpdate() { if (this._dirty) return; this._dirty = true; requestAnimationFrame(() => { this._dirty = false; this.updateRuler(); }); }
        destroy() { if (this.el.root) this.el.root.innerHTML = ''; this.laneEls.clear(); this.clipEls.clear(); this.headEls.clear(); this.markerEls.clear(); Object.values(this.toggleEls).forEach(m => m.clear()); }
    }
    window.SequencerRenderer = SequencerRenderer;
})();