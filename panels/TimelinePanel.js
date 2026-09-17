// -----------------------------------------------------------------------------
// SM Engine Timeline Professional UI
// Frontend chrome only. Animation/keyframe logic remains in sm-timeline-core.js.
// -----------------------------------------------------------------------------
function smTimelinePanelInjectProfessionalStyles() {
    if (document.getElementById('sm-timeline-professional-styles')) return;

    const style = document.createElement('style');
    style.id = 'sm-timeline-professional-styles';
    style.textContent = `
        #timelineBody.sm-timeline-professional {
            --sm-tlp-bg:#2b2b2b;
            --sm-tlp-deep:#252525;
            --sm-tlp-soft:#303030;
            --sm-tlp-raised:#353535;
            --sm-tlp-hover:rgba(255,255,255,.045);
            --sm-tlp-active:rgba(255,255,255,.085);
            --sm-tlp-selected:#3c3c3c;
            --sm-tlp-text:#d5d5d5;
            --sm-tlp-muted:#808080;
            --sm-tlp-faint:#626262;
            --sm-tlp-playhead:#c18a48;
            --sm-tlp-key:#a8a8a8;
            --sm-tlp-key-selected:#f1f1f1;
            --sm-tlp-clip:#4b5057;
            --sm-tlp-row-height:26px;
            --sm-tlp-ruler-height:27px;
            --sm-tlp-left-width:clamp(230px,18vw,310px);
            display:flex!important;
            flex-direction:column!important;
            min-height:100px!important;
            background:var(--sm-tlp-bg)!important;
            border:0!important;
            border-radius:0!important;
            box-shadow:none!important;
            overflow:hidden!important;
            color:#aaa!important;
            font-family:Inter,"Segoe UI",Arial,sans-serif!important;
            font-size:10px!important;
        }

        #timelineBody.sm-timeline-professional *,
        #timelineBody.sm-timeline-professional *::before,
        #timelineBody.sm-timeline-professional *::after {
            box-sizing:border-box;
        }

        #timelineBody.sm-timeline-professional button,
        #timelineBody.sm-timeline-professional input,
        #timelineBody.sm-timeline-professional select {
            font:inherit;
        }

        #timelineBody .resize-handle-timeline {
            height:5px!important;
            flex:0 0 5px!important;
            position:relative!important;
            top:auto!important;
            left:auto!important;
            width:100%!important;
            background:transparent!important;
            border:0!important;
            cursor:row-resize!important;
        }

        #timelineBody .resize-handle-timeline::after {
            content:"";
            position:absolute;
            left:50%;
            top:1px;
            width:46px;
            height:2px;
            transform:translateX(-50%);
            background:rgba(255,255,255,.12);
            opacity:0;
            transition:opacity 80ms ease;
        }

        #timelineBody .resize-handle-timeline:hover::after {
            opacity:1;
        }

        /* ---------------------------------------------------------------
           Professional top header
           --------------------------------------------------------------- */

        #timelineBody .sm-timeline-pro-header {
            height:34px;
            min-height:34px;
            flex:0 0 34px;
            display:flex;
            align-items:center;
            gap:9px;
            padding:0 6px 0 9px;
            background:#353535;
        }

        #timelineBody .sm-timeline-pro-brand {
            min-width:190px;
            display:flex;
            align-items:center;
            gap:7px;
        }

        #timelineBody .sm-timeline-pro-brand-mark {
            width:21px;
            height:21px;
            display:grid;
            place-items:center;
            background:#414141;
            color:#d8d8d8;
            font-size:8px;
            font-weight:700;
            letter-spacing:.3px;
        }

        #timelineBody .sm-timeline-pro-brand-copy {
            min-width:0;
            display:flex;
            flex-direction:column;
            line-height:1.05;
        }

        #timelineBody .sm-timeline-pro-brand-copy strong {
            color:#d0d0d0;
            font-size:10px;
            font-weight:600;
        }

        #timelineBody .sm-timeline-pro-brand-copy span {
            margin-top:3px;
            color:#696969;
            font-size:8px;
        }

        #timelineBody .sm-timeline-pro-view-tabs {
            height:100%;
            display:flex;
            align-items:stretch;
        }

        #timelineBody .sm-timeline-pro-view {
            min-width:66px;
            padding:0 9px;
            background:transparent;
            color:#818181;
            border:0;
            border-radius:0;
            font-size:9px;
            font-weight:600;
            letter-spacing:.25px;
            text-transform:uppercase;
            cursor:pointer;
        }

        #timelineBody .sm-timeline-pro-view:hover {
            background:rgba(255,255,255,.035);
            color:#bdbdbd;
        }

        #timelineBody .sm-timeline-pro-view.active {
            background:#3c3c3c;
            color:#f0f0f0;
            box-shadow:inset 0 -2px 0 #8b8b8b;
        }

        #timelineBody .sm-timeline-pro-head-spacer {
            flex:1 1 auto;
        }

        #timelineBody .sm-timeline-pro-icon-button {
            width:26px;
            height:26px;
            display:grid;
            place-items:center;
            padding:0;
            background:transparent;
            color:#777;
            border:0;
            border-radius:0;
            cursor:pointer;
        }

        #timelineBody .sm-timeline-pro-icon-button:hover,
        #timelineBody .sm-timeline-pro-icon-button.active {
            background:rgba(255,255,255,.055);
            color:#e0e0e0;
        }

        /* ---------------------------------------------------------------
           Professional command shelf
           --------------------------------------------------------------- */

        #timelineBody .sm-timeline-commandbar {
            height:31px;
            min-height:31px;
            flex:0 0 31px;
            display:flex;
            align-items:center;
            gap:3px;
            padding:0 6px;
            overflow-x:auto;
            overflow-y:hidden;
            scrollbar-width:none;
            background:#303030;
        }

        #timelineBody .sm-timeline-commandbar::-webkit-scrollbar {
            display:none;
        }

        #timelineBody .sm-timeline-2d-only {
            display:none !important;
        }

        #timelineBody[data-timeline-context="2d"] .sm-timeline-2d-only {
            display:flex !important;
        }

        #timelineBody .sm-timeline-context-badge {
            display:inline-flex;
            align-items:center;
            height:18px;
            padding:0 6px;
            margin-left:6px;
            border:1px solid rgba(255,255,255,.10);
            background:rgba(255,255,255,.05);
            color:#a9a9a9;
            border-radius:3px;
            font-size:9px;
            font-weight:700;
            letter-spacing:.06em;
        }

        #timelineBody[data-timeline-context="2d"] .sm-timeline-context-badge {
            color:#dbe8ff;
            background:rgba(93,140,255,.16);
            border-color:rgba(93,140,255,.34);
        }

        #timelineBody .sm-timeline-command-tool.danger:hover {
            color:#ffb1b1 !important;
            background:rgba(190,60,60,.18) !important;
        }

        #timelineBody .sm-timeline-command-group {
            display:flex;
            align-items:center;
            gap:1px;
        }

        #timelineBody .sm-timeline-command-tool,
        #timelineBody .sm-timeline-command-text,
        #timelineBody .sm-timeline-command-action {
            height:24px;
            min-height:24px;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            gap:5px;
            padding:0 7px;
            background:transparent;
            color:#858585;
            border:0;
            border-radius:0;
            cursor:pointer;
            white-space:nowrap;
        }

        #timelineBody .sm-timeline-command-tool {
            width:25px;
            padding:0;
            font-size:11px;
        }

        #timelineBody .sm-timeline-command-tool:hover,
        #timelineBody .sm-timeline-command-text:hover {
            background:rgba(255,255,255,.045);
            color:#cfcfcf;
        }

        #timelineBody .sm-timeline-command-tool.active,
        #timelineBody .sm-timeline-command-text.active {
            background:#3d3d3d;
            color:#efefef;
        }

        #timelineBody .sm-timeline-command-separator {
            width:8px;
            flex:0 0 8px;
        }

        #timelineBody .sm-timeline-command-field {
            height:24px;
            display:inline-flex;
            align-items:center;
            gap:5px;
            padding-left:6px;
            background:#2b2b2b;
            color:#696969;
        }

        #timelineBody .sm-timeline-command-field > span {
            font-size:8px;
            letter-spacing:.2px;
            text-transform:uppercase;
        }

        #timelineBody .sm-timeline-command-field select {
            height:24px;
            padding:0 20px 0 6px;
            background:#333;
            color:#aaa;
            border:0;
            border-radius:0;
            outline:0;
            font-size:9px;
        }

        #timelineBody .sm-timeline-command-spacer {
            flex:1 1 auto;
        }

        #timelineBody .sm-timeline-command-action {
            background:#393939;
            color:#aaa;
            font-size:9px;
            font-weight:500;
        }

        #timelineBody .sm-timeline-command-action:hover {
            background:#444;
            color:#fff;
        }

        #timelineBody .sm-timeline-command-action.primary {
            background:#454545;
            color:#e7e7e7;
        }

        #timelineBody .sm-timeline-autokey-dot {
            width:6px;
            height:6px;
            border-radius:50%;
            background:#7a5858;
        }

        #timelineBody .sm-timeline-command-text.active .sm-timeline-autokey-dot {
            background:#b77979;
        }

        /* ---------------------------------------------------------------
           Existing transport becomes compact/pro
           --------------------------------------------------------------- */

        #timelineBody #timeline-controls-wrapper {
            min-height:0!important;
            flex:1 1 0!important;
            display:flex!important;
            flex-direction:column!important;
            background:var(--sm-tlp-bg)!important;
            overflow:hidden!important;
        }

        #timelineBody .timeline-controls {
            height:34px!important;
            min-height:34px!important;
            flex:0 0 34px!important;
            display:flex!important;
            align-items:center!important;
            gap:2px!important;
            padding:0 6px!important;
            background:#323232!important;
            border:0!important;
            border-radius:0!important;
            box-shadow:none!important;
        }

        #timelineBody .timeline-controls button,
        #timelineBody .timeline-controls .tool-button {
            width:27px!important;
            min-width:27px!important;
            height:27px!important;
            min-height:27px!important;
            display:inline-grid!important;
            place-items:center!important;
            padding:0!important;
            background:transparent!important;
            color:#959595!important;
            border:0!important;
            border-radius:0!important;
            box-shadow:none!important;
            transform:none!important;
            cursor:pointer!important;
        }

        #timelineBody .timeline-controls button:hover,
        #timelineBody .timeline-controls .tool-button:hover {
            background:rgba(255,255,255,.055)!important;
            color:#fff!important;
        }

        #timelineBody .timeline-controls button.active,
        #timelineBody .timeline-controls .tool-button.active {
            background:rgba(255,255,255,.085)!important;
            color:#fff!important;
        }

        #timelineBody #time-display {
            min-width:88px!important;
            height:25px!important;
            display:inline-flex!important;
            align-items:center!important;
            justify-content:center!important;
            padding:0 7px!important;
            background:#292929!important;
            color:#d8d8d8!important;
            border:0!important;
            border-radius:0!important;
            box-shadow:none!important;
            font-family:"Cascadia Mono",Consolas,monospace!important;
            font-size:10px!important;
            font-variant-numeric:tabular-nums!important;
        }

        #timelineBody .timeline-controls select,
        #timelineBody .timeline-controls input[type="text"],
        #timelineBody .timeline-controls input[type="number"] {
            height:24px!important;
            padding:0 6px!important;
            background:#292929!important;
            color:#aaa!important;
            border:0!important;
            border-radius:0!important;
            outline:0!important;
            box-shadow:none!important;
            font-size:9px!important;
        }

        /* ---------------------------------------------------------------
           Main aligned split
           --------------------------------------------------------------- */

        #timelineBody .timeline-body {
            min-height:0!important;
            flex:1 1 0!important;
            display:grid!important;
            grid-template-columns:var(--sm-tlp-left-width) minmax(0,1fr)!important;
            align-items:stretch!important;
            background:var(--sm-tlp-bg)!important;
            overflow:hidden!important;
        }

        #timelineBody .timeline-layers {
            width:auto!important;
            min-width:0!important;
            max-width:none!important;
            min-height:0!important;
            display:flex!important;
            flex-direction:column!important;
            background:#292929!important;
            border:0!important;
            overflow-x:hidden!important;
            overflow-y:auto!important;
            scrollbar-width:thin;
            scrollbar-color:#454545 transparent;
        }

        #timelineBody .timeline-track {
            min-width:0!important;
            min-height:0!important;
            display:flex!important;
            flex-direction:column!important;
            position:relative!important;
            background:#2b2b2b!important;
            border:0!important;
            overflow:hidden!important;
        }

        /* The left header MUST have exactly the ruler height. */
        #timelineBody .sm-timeline-track-head {
            height:var(--sm-tlp-ruler-height)!important;
            min-height:var(--sm-tlp-ruler-height)!important;
            flex:0 0 var(--sm-tlp-ruler-height)!important;
            position:sticky;
            top:0;
            z-index:30;
            display:flex;
            align-items:center;
            gap:3px;
            padding:2px 4px;
            background:#303030;
        }

        #timelineBody .sm-timeline-track-search-wrap {
            min-width:0;
            height:23px;
            flex:1 1 auto;
            display:flex;
            align-items:center;
            background:#272727;
        }

        #timelineBody .sm-timeline-track-search-icon {
            width:22px;
            flex:0 0 22px;
            display:grid;
            place-items:center;
            color:#666;
        }

        #timelineBody #timeline-track-search {
            min-width:0;
            height:23px;
            flex:1 1 auto;
            padding:0 4px;
            background:transparent;
            color:#bbb;
            border:0;
            border-radius:0;
            outline:0;
            font-size:9px;
        }

        #timelineBody #timeline-track-search::placeholder {
            color:#5d5d5d;
        }

        #timelineBody #timeline-track-search-clear,
        #timelineBody #timeline-collapse-all,
        #timelineBody #timeline-expand-all {
            width:22px;
            height:23px;
            padding:0;
            background:transparent;
            color:#696969;
            border:0;
            border-radius:0;
            cursor:pointer;
        }

        #timelineBody #timeline-track-search-clear:hover,
        #timelineBody #timeline-collapse-all:hover,
        #timelineBody #timeline-expand-all:hover {
            background:rgba(255,255,255,.045);
            color:#ddd;
        }

        #timelineBody #layers-list {
            min-height:0!important;
            position:relative!important;
            background:#292929!important;
        }

        #timelineBody .timeline-layer-item {
            min-height:var(--sm-tlp-row-height)!important;
            height:var(--sm-tlp-row-height)!important;
            max-height:var(--sm-tlp-row-height)!important;
            display:flex!important;
            align-items:center!important;
            gap:5px!important;
            padding:0 5px!important;
            margin:0!important;
            background:transparent!important;
            color:#9c9c9c!important;
            border:0!important;
            border-radius:0!important;
            box-shadow:none!important;
            line-height:var(--sm-tlp-row-height)!important;
            user-select:none!important;
        }

        #timelineBody .timeline-layer-item:nth-child(even) {
            background:rgba(255,255,255,.008)!important;
        }

        #timelineBody .timeline-layer-item:hover {
            background:rgba(255,255,255,.04)!important;
            color:#d0d0d0!important;
        }

        #timelineBody .timeline-layer-item.selected {
            background:var(--sm-tlp-selected)!important;
            color:#fff!important;
            box-shadow:inset 2px 0 0 #8a8a8a!important;
        }

        #timelineBody .timeline-layer-item .layer-name {
            min-width:0;
            flex:1 1 auto;
            overflow:hidden;
            text-overflow:ellipsis;
            white-space:nowrap;
            color:inherit!important;
            font-size:9.5px!important;
        }

        #timelineBody .tl-expand-arrow {
            width:11px!important;
            min-width:11px!important;
            color:#676767!important;
            font-size:8px!important;
            transform:none!important;
        }

        #timelineBody .tl-expand-arrow.open {
            transform:rotate(90deg)!important;
        }

        #timelineBody .tl-layer-icon {
            width:13px!important;
            min-width:13px!important;
            color:#808080!important;
            font-size:8px!important;
            text-align:center!important;
        }

        #timelineBody .tl-layer-badge,
        #timelineBody .tl-kf-count,
        #timelineBody .sm-timeline-row-badge {
            height:15px!important;
            display:inline-flex!important;
            align-items:center!important;
            padding:0 4px!important;
            background:rgba(255,255,255,.035)!important;
            color:#777!important;
            border:0!important;
            border-radius:0!important;
            line-height:15px!important;
            font-size:7px!important;
            white-space:nowrap!important;
        }

        #timelineBody .sm-timeline-row-action {
            width:17px;
            height:17px;
            display:grid;
            place-items:center;
            padding:0;
            background:transparent;
            color:#5f5f5f;
            border:0;
            border-radius:0;
            font-size:7px;
            cursor:pointer;
        }

        #timelineBody .sm-timeline-row-action:hover,
        #timelineBody .sm-timeline-row-action.active {
            background:rgba(255,255,255,.045);
            color:#c7c7c7;
        }

        /* Ruler has exactly the same height as the left track header. */
        #timelineBody .timeline-scale {
            height:var(--sm-tlp-ruler-height)!important;
            min-height:var(--sm-tlp-ruler-height)!important;
            max-height:var(--sm-tlp-ruler-height)!important;
            flex:0 0 var(--sm-tlp-ruler-height)!important;
            position:relative!important;
            background:#303030!important;
            border:0!important;
            border-radius:0!important;
            box-shadow:none!important;
            transform-origin:left top!important;
            will-change:transform;
        }

        #timelineBody .timeline-scale-marker.major {
            width:1px!important;
            height:11px!important;
            background:rgba(255,255,255,.13)!important;
        }

        #timelineBody .timeline-scale-marker.medium,
        #timelineBody .timeline-scale-marker.minor {
            width:1px!important;
            background:rgba(255,255,255,.065)!important;
        }

        #timelineBody .timeline-scale-label {
            color:#818181!important;
            font-family:"Cascadia Mono",Consolas,monospace!important;
            font-size:8px!important;
            font-weight:400!important;
        }

        #timelineBody #timeline-content {
            min-height:0!important;
            flex:1 1 0!important;
            position:relative!important;
            background:#2b2b2b!important;
            border:0!important;
            overflow:auto!important;
            scrollbar-width:thin;
            scrollbar-color:#454545 transparent;
        }

        #timelineBody #timeline-content::-webkit-scrollbar,
        #timelineBody .timeline-layers::-webkit-scrollbar {
            width:5px;
            height:5px;
        }

        #timelineBody #timeline-content::-webkit-scrollbar-track,
        #timelineBody .timeline-layers::-webkit-scrollbar-track {
            background:transparent;
        }

        #timelineBody #timeline-content::-webkit-scrollbar-thumb,
        #timelineBody .timeline-layers::-webkit-scrollbar-thumb {
            background:#454545;
            border-radius:0;
        }

        #timelineBody #keyframes-container {
            min-height:1px!important;
            position:relative!important;
            background:transparent!important;
        }

        /* RIGHT rows are positioned by sm-timeline-core using the exact
           measured LEFT row top/height. */
        #timelineBody .timeline-track-row {
            position:absolute!important;
            left:0!important;
            min-height:var(--sm-tlp-row-height)!important;
            margin:0!important;
            padding:0!important;
            background:rgba(255,255,255,.004)!important;
            border:0!important;
            border-radius:0!important;
            box-shadow:none!important;
            overflow:hidden!important;
        }

        #timelineBody .timeline-track-row:nth-child(even) {
            background:rgba(0,0,0,.055)!important;
        }

        #timelineBody .timeline-track-row:hover {
            background:rgba(255,255,255,.025)!important;
        }

        #timelineBody .timeline-track-row.selected-object-track {
            background:rgba(255,255,255,.055)!important;
            box-shadow:inset 2px 0 0 #8a8a8a!important;
        }

        #timelineBody .timeline-track-line {
            height:1px!important;
            top:50%!important;
            background:rgba(255,255,255,.045)!important;
            border:0!important;
        }

        #timelineBody .keyframe {
            width:7px!important;
            height:7px!important;
            background:var(--sm-tlp-key)!important;
            border:0!important;
            border-radius:0!important;
            box-shadow:none!important;
            transform:translate(-50%,-50%) rotate(45deg)!important;
        }

        #timelineBody .keyframe:hover {
            background:#d8d8d8!important;
            transform:translate(-50%,-50%) rotate(45deg) scale(1.15)!important;
        }

        #timelineBody .keyframe.selected {
            background:var(--sm-tlp-key-selected)!important;
            box-shadow:0 0 0 2px rgba(255,255,255,.1)!important;
        }

        /* Native AnimationClip visual lane. It is visual only and never edits
           the THREE.AnimationClip. */
        #timelineBody .timeline-native-clip-visual {
            position:absolute;
            top:4px;
            height:calc(100% - 8px);
            min-width:18px;
            display:flex;
            align-items:center;
            gap:5px;
            padding:0 6px;
            overflow:hidden;
            background:var(--sm-tlp-clip);
            color:#aeb1b5;
            font-size:7.5px;
            white-space:nowrap;
            pointer-events:none;
            z-index:1;
        }

        #timelineBody .timeline-native-clip-visual.active {
            background:#555b63;
            color:#ddd;
        }

        #timelineBody .timeline-native-clip-visual-count {
            color:#7c8188;
        }

        #timelineBody .keyframe {
            z-index:3!important;
        }

        #timelineBody #playhead,
        #timelineBody .playhead {
            width:1px!important;
            background:var(--sm-tlp-playhead)!important;
            border:0!important;
            box-shadow:none!important;
            z-index:50!important;
        }

        #timelineBody .playhead-handle {
            width:11px!important;
            height:12px!important;
            background:var(--sm-tlp-playhead)!important;
            border:0!important;
            border-radius:0!important;
            box-shadow:none!important;
            clip-path:polygon(0 0,100% 0,100% 68%,50% 100%,0 68%)!important;
        }

        /* ---------------------------------------------------------------
           Bottom status
           --------------------------------------------------------------- */

        #timelineBody .sm-timeline-bottom-status {
            height:23px;
            min-height:23px;
            flex:0 0 23px;
            display:flex;
            align-items:center;
            gap:9px;
            padding:0 7px;
            background:#2e2e2e;
            color:#686868;
            font-size:8px;
            white-space:nowrap;
        }

        #timelineBody .sm-timeline-bottom-status b {
            color:#999;
            font-weight:500;
        }

        #timelineBody .sm-timeline-overview {
            min-width:90px;
            height:8px;
            flex:1 1 auto;
            position:relative;
            overflow:hidden;
            background:#262626;
        }

        #timelineBody .sm-timeline-overview::before {
            content:"";
            position:absolute;
            left:5%;
            right:4%;
            top:3px;
            height:2px;
            background:linear-gradient(to right,#555b62 0 18%,#4d535a 18% 58%,#5a5149 58% 66%,#4d535a 66%);
        }

        #timelineBody .sm-timeline-overview-window {
            position:absolute;
            left:17%;
            width:42%;
            top:1px;
            bottom:1px;
            background:rgba(255,255,255,.045);
        }

        #timelineBody .sm-timeline-bottom-right {
            margin-left:auto;
            display:flex;
            align-items:center;
            gap:7px;
        }

        /* Graph editor follows the same borderless language. */
        #timelineBody #graph-editor-container {
            background:#292929!important;
            border:0!important;
            border-radius:0!important;
            box-shadow:none!important;
        }

        #timelineBody .graph-editor-bar {
            min-height:31px!important;
            background:#323232!important;
            border:0!important;
        }

        #timelineBody #graph-channels-list {
            background:#292929!important;
            border:0!important;
        }

        #timelineBody .graph-tree-row {
            min-height:24px!important;
            background:transparent!important;
            border:0!important;
        }

        #timelineBody .graph-tree-row:hover {
            background:rgba(255,255,255,.04)!important;
        }

        #timelineBody .graph-tree-row.selected {
            background:#3a3a3a!important;
        }

        #timelineBody .graph-canvas-wrapper,
        #timelineBody #graph-canvas {
            background:#272727!important;
            border:0!important;
        }

        /* Never reintroduce visible box borders in timeline chrome. */
        #timelineBody.sm-timeline-professional :is(
            button,input,select,
            .timeline-controls,
            .timeline-layers,
            .timeline-track,
            .timeline-scale,
            .timeline-track-row,
            .timeline-layer-item,
            #graph-editor-container
        ) {
            border-color:transparent!important;
        }

        #timelineBody.sm-timeline-professional :is(button,input,select):focus-visible {
            outline:0!important;
            box-shadow:none!important;
        }

        @media (max-width:1180px) {
            #timelineBody.sm-timeline-professional {
                --sm-tlp-left-width:215px;
            }

            #timelineBody .sm-timeline-pro-brand {
                min-width:150px;
            }

            #timelineBody .sm-timeline-pro-brand-copy span,
            #timelineBody .sm-timeline-command-field > span {
                display:none;
            }
        }

        @media (max-width:900px) {
            #timelineBody.sm-timeline-professional {
                --sm-tlp-left-width:185px;
            }

            #timelineBody .sm-timeline-pro-view {
                min-width:auto;
                padding:0 6px;
            }
        }

        /* ================================================================
           BLENDER-LIKE CHANNEL SELECTION + LOOP RANGE
           ================================================================ */

        /*
         * Child/channel selection.
         * Selected row on the left and its exact matching lane on the right
         * share the same restrained teal/grey highlight.
         */
        #timelineBody .timeline-layer-item.timeline-row-selected {
            background:rgba(68,105,113,.24)!important;
            color:#f0f0f0!important;
            box-shadow:inset 2px 0 0 rgba(112,161,171,.72)!important;
        }

        #timelineBody .timeline-track-row.timeline-row-selected {
            background:rgba(68,105,113,.13)!important;
            box-shadow:inset 2px 0 0 rgba(112,161,171,.54)!important;
        }

        #timelineBody .timeline-track-row.timeline-row-selected .timeline-track-line {
            background:rgba(120,177,187,.18)!important;
        }

        #timelineBody .timeline-track-row.timeline-row-selected .keyframe {
            background:#ececec!important;
            opacity:1!important;
        }

        #timelineBody .timeline-track-row.timeline-row-selected .timeline-native-clip-visual {
            background:#606970!important;
            color:#f2f2f2!important;
        }

        /*
         * Native loop / preview range.
         * The region remains visible even when looping is disabled, but is
         * dimmed so the Start/End limits are never ambiguous.
         */
        #timelineBody #sm-timeline-loop-zone {
            position:absolute!important;
            top:0!important;
            bottom:auto!important;
            min-width:1px!important;
            pointer-events:none!important;
            z-index:2!important;

            background:
                linear-gradient(
                    180deg,
                    rgba(77,126,137,.105),
                    rgba(77,126,137,.055)
                )!important;

            box-shadow:
                inset 1px 0 0 rgba(112,161,171,.66),
                inset -1px 0 0 rgba(112,161,171,.66)!important;
        }

        #timelineBody #sm-timeline-loop-zone.loop-disabled {
            opacity:.28!important;
        }

        #timelineBody .sm-timeline-loop-handle {
            position:absolute!important;
            top:0!important;
            bottom:0!important;
            width:1px!important;

            background:rgba(126,176,185,.82)!important;

            pointer-events:auto!important;
            cursor:ew-resize!important;

            z-index:8!important;
        }

        #timelineBody .sm-timeline-loop-start {
            left:0!important;
        }

        #timelineBody .sm-timeline-loop-end {
            right:0!important;
        }

        #timelineBody .sm-timeline-loop-handle::before {
            content:""!important;

            position:absolute!important;
            top:1px!important;

            width:8px!important;
            height:8px!important;

            background:#7898a0!important;

            box-shadow:none!important;
        }

        #timelineBody .sm-timeline-loop-start::before {
            left:0!important;

            clip-path:polygon(0 0,100% 0,0 100%)!important;
        }

        #timelineBody .sm-timeline-loop-end::before {
            right:0!important;

            clip-path:polygon(0 0,100% 0,100% 100%)!important;
        }

        /*
         * Allow loop tint to remain visible through alternating rows.
         * Rows use translucent tones instead of opaque blocks.
         */
        #timelineBody #keyframes-container > .timeline-track-row:nth-child(odd) {
            background:rgba(255,255,255,.008)!important;
        }

        #timelineBody #keyframes-container > .timeline-track-row:nth-child(even) {
            background:rgba(0,0,0,.055)!important;
        }

        #timelineBody #keyframes-container > .timeline-track-row {
            z-index:3!important;
        }

        #timelineBody #keyframes-container .keyframe,
        #timelineBody #keyframes-container .timeline-native-clip-visual {
            z-index:7!important;
        }

        #timelineBody #playhead,
        #timelineBody .playhead {
            z-index:60!important;
        }

        /*
         * Compact original search toolbar.
         * No second toolbar means the first channel begins on the same Y as
         * the first right-side lane.
         */
        #timelineBody .sm-timeline-original-track-toolbar {
            height:26px!important;
            min-height:26px!important;
            max-height:26px!important;
            flex:0 0 26px!important;

            display:flex!important;
            align-items:center!important;
            gap:1px!important;

            margin:0!important;
            padding:2px 4px!important;

            background:#303030!important;
            border:0!important;
        }

        #timelineBody .sm-timeline-original-track-toolbar #timeline-track-search {
            min-width:0!important;
            height:22px!important;
            flex:1 1 auto!important;

            margin:0!important;
            padding:0 6px!important;

            background:#282828!important;
            color:#b9b9b9!important;

            border:0!important;
            border-radius:0!important;
            outline:0!important;
            box-shadow:none!important;

            font-size:9px!important;
        }

        #timelineBody .sm-timeline-original-track-toolbar :is(
            #timeline-track-search-clear,
            #timeline-collapse-all,
            #timeline-expand-all
        ) {
            width:21px!important;
            min-width:21px!important;
            height:22px!important;

            padding:0!important;

            background:transparent!important;
            color:#6f6f6f!important;

            border:0!important;
            border-radius:0!important;

            cursor:pointer!important;
        }

        #timelineBody .sm-timeline-original-track-toolbar :is(
            #timeline-track-search-clear,
            #timeline-collapse-all,
            #timeline-expand-all
        ):hover {
            background:rgba(255,255,255,.05)!important;
            color:#ddd!important;
        }

        /* ---------------------------------------------------------------
           Clarity refresh: keep the animation surface calm and move
           infrequent controls into a compact tools drawer.
           --------------------------------------------------------------- */
        #timelineBody.sm-timeline-professional {
            --sm-tlp-bg:#333333;
            --sm-tlp-deep:#282828;
            --sm-tlp-soft:#3b3b3b;
            --sm-tlp-raised:#454545;
            --sm-tlp-hover:rgba(255,255,255,.06);
            --sm-tlp-active:rgba(255,255,255,.11);
            --sm-tlp-selected:#484848;
            --sm-tlp-text:#eeeeee;
            --sm-tlp-muted:#aaaaaa;
            --sm-tlp-faint:#737373;
            --sm-tlp-playhead:#d3d3d3;
            --sm-tlp-key:#b7b7b7;
            --sm-tlp-key-selected:#ffffff;
            --sm-tlp-clip:#565656;
            --sm-tlp-row-height:30px;
            --sm-tlp-ruler-height:30px;
            --sm-tlp-left-width:clamp(205px,18vw,280px);
            background:linear-gradient(180deg,#3b3b3b 0%,var(--sm-tlp-bg) 36%)!important;
            color:var(--sm-tlp-text)!important;
        }

        #timelineBody .sm-timeline-pro-header {
            height:40px;
            min-height:40px;
            flex-basis:40px;
            gap:10px;
            padding:0 10px;
            background:rgba(51,51,51,.96);
            border-bottom:1px solid rgba(255,255,255,.10);
            box-shadow:0 4px 18px rgba(0,0,0,.16);
        }

        #timelineBody .sm-timeline-pro-brand {
            min-width:160px;
            gap:8px;
        }

        #timelineBody .sm-timeline-pro-brand-mark {
            width:24px;
            height:24px;
            border-radius:7px;
            background:linear-gradient(135deg,#5b5b5b,#414141);
            color:#f2f2f2;
            font-size:10px;
            box-shadow:0 5px 13px rgba(0,0,0,.22);
        }

        #timelineBody .sm-timeline-pro-brand-copy strong {
            color:#eeeeee;
            font-size:11px;
            letter-spacing:.02em;
        }

        #timelineBody .sm-timeline-pro-brand-copy span {
            margin-top:2px;
            color:#949494;
            font-size:8.5px;
        }

        #timelineBody .sm-timeline-context-badge {
            height:19px;
            margin-left:2px;
            padding:0 6px;
            border-radius:999px;
            border-color:rgba(255,255,255,.16);
            background:rgba(255,255,255,.08);
            color:#dddddd;
            font-size:8px;
        }

        #timelineBody .sm-timeline-pro-view-tabs {
            height:28px;
            align-items:center;
            gap:2px;
            padding:3px;
            border:1px solid rgba(255,255,255,.10);
            border-radius:8px;
            background:rgba(0,0,0,.14);
        }

        #timelineBody .sm-timeline-pro-view {
            min-width:auto;
            height:22px;
            padding:0 9px;
            border-radius:5px;
            color:#a5a5a5;
            font-size:8.5px;
            letter-spacing:.03em;
            text-transform:none;
        }

        #timelineBody .sm-timeline-pro-view:hover {
            background:rgba(255,255,255,.07);
            color:#eeeeee;
        }

        #timelineBody .sm-timeline-pro-view.active {
            background:linear-gradient(180deg,#575757,#484848);
            color:#ffffff;
            box-shadow:none;
        }

        #timelineBody .sm-timeline-pro-utility-tabs {
            display:flex;
            align-items:center;
            gap:2px;
            margin-left:2px;
        }

        #timelineBody .sm-timeline-pro-view.sm-timeline-pro-utility {
            width:27px;
            min-width:27px;
            padding:0;
            border:1px solid transparent;
            color:#b8b8b8;
            font-size:12px;
        }

        #timelineBody .sm-timeline-pro-view.sm-timeline-pro-utility.active {
            border-color:rgba(255,255,255,.16);
        }

        #timelineBody .sm-timeline-pro-icon-button {
            width:27px;
            height:27px;
            border-radius:6px;
            color:#a6a6a6;
        }

        #timelineBody .sm-timeline-pro-icon-button:hover,
        #timelineBody .sm-timeline-pro-icon-button.active {
            background:rgba(255,255,255,.08);
            color:#f0f0f0;
        }

        #timelineBody .sm-timeline-commandbar {
            height:34px;
            min-height:34px;
            flex-basis:34px;
            position:relative;
            gap:6px;
            padding:0 9px;
            overflow:visible;
            background:rgba(47,47,47,.98);
            border-bottom:1px solid rgba(255,255,255,.08);
        }

        #timelineBody .sm-timeline-command-group {
            gap:3px;
        }

        #timelineBody .sm-timeline-command-tool,
        #timelineBody .sm-timeline-command-text,
        #timelineBody .sm-timeline-command-action {
            height:25px;
            min-height:25px;
            border-radius:6px;
            color:#b3b3b3;
        }

        #timelineBody .sm-timeline-command-tool {
            width:26px;
            background:rgba(255,255,255,.025);
        }

        #timelineBody .sm-timeline-command-text {
            padding:0 8px;
            background:rgba(255,255,255,.025);
            font-size:8.5px;
        }

        #timelineBody .sm-timeline-command-tool:hover,
        #timelineBody .sm-timeline-command-text:hover,
        #timelineBody .sm-timeline-command-tool.active,
        #timelineBody .sm-timeline-command-text.active {
            background:rgba(255,255,255,.11);
            color:#f0f0f0;
        }

        #timelineBody .sm-timeline-command-action {
            padding:0 8px;
            background:rgba(255,255,255,.045);
            color:#d0d0d0;
            font-size:8.5px;
        }

        #timelineBody .sm-timeline-command-action.primary {
            background:linear-gradient(180deg,#5a5a5a,#484848);
            color:#ffffff;
        }

        #timelineBody .sm-timeline-command-action:hover {
            background:rgba(255,255,255,.12);
            color:#ffffff;
        }

        #timelineBody .sm-timeline-command-action.primary:hover {
            background:linear-gradient(180deg,#666666,#525252);
        }

        #timelineBody .sm-timeline-tools-toggle {
            margin-left:1px;
        }

        #timelineBody .sm-timeline-command-drawer {
            display:none;
            position:absolute;
            z-index:120;
            right:9px;
            top:39px;
            width:min(460px,calc(100vw - 36px));
            padding:9px;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:8px;
            border:1px solid rgba(255,255,255,.14);
            border-radius:10px;
            background:linear-gradient(180deg,#454545,#343434);
            box-shadow:0 18px 42px rgba(0,0,0,.38);
        }

        #timelineBody .sm-timeline-commandbar.is-tools-open .sm-timeline-command-drawer {
            display:grid;
        }

        #timelineBody .sm-timeline-command-drawer-section {
            min-width:0;
            display:flex;
            flex-direction:column;
            gap:6px;
            padding:7px;
            border:1px solid rgba(255,255,255,.055);
            border-radius:7px;
            background:rgba(0,0,0,.12);
        }

        #timelineBody .sm-timeline-command-drawer-section:last-child {
            grid-column:1 / -1;
        }

        #timelineBody .sm-timeline-command-drawer-label {
            color:#d0d0d0;
            font-size:8px;
            font-weight:700;
            letter-spacing:.09em;
            text-transform:uppercase;
        }

        #timelineBody .sm-timeline-command-drawer-section .sm-timeline-command-field {
            height:25px;
            padding-left:7px;
            border:1px solid rgba(255,255,255,.06);
            border-radius:5px;
            background:rgba(0,0,0,.16);
            color:#b7b7b7;
        }

        #timelineBody .sm-timeline-command-drawer-section .sm-timeline-command-field > span {
            display:inline;
            color:#a0a0a0;
            font-size:7.5px;
        }

        #timelineBody .sm-timeline-command-drawer-section .sm-timeline-command-field select {
            height:23px;
            background:transparent;
            color:#e0e0e0;
            font-size:8px;
        }

        #timelineBody .timeline-controls {
            height:36px!important;
            min-height:36px!important;
            flex-basis:36px!important;
            gap:3px!important;
            padding:0 9px!important;
            background:rgba(53,53,53,.96)!important;
            border-bottom:1px solid rgba(255,255,255,.08)!important;
        }

        #timelineBody .timeline-controls button,
        #timelineBody .timeline-controls .tool-button {
            border-radius:5px!important;
        }

        #timelineBody #time-display {
            min-width:94px!important;
            border:1px solid rgba(255,255,255,.12)!important;
            border-radius:6px!important;
            background:rgba(0,0,0,.16)!important;
            color:#eeeeee!important;
        }

        #timelineBody .timeline-body {
            background:#303030!important;
        }

        #timelineBody .timeline-layers {
            background:#363636!important;
            border-right:1px solid rgba(255,255,255,.10)!important;
        }

        #timelineBody .timeline-track,
        #timelineBody #timeline-content {
            background:#303030!important;
        }

        #timelineBody .sm-timeline-original-track-toolbar,
        #timelineBody .timeline-scale {
            background:#3a3a3a!important;
            border-bottom:1px solid rgba(255,255,255,.10)!important;
        }

        #timelineBody .sm-timeline-original-track-toolbar {
            height:30px!important;
            min-height:30px!important;
            max-height:30px!important;
            padding:3px 5px!important;
        }

        #timelineBody .sm-timeline-original-track-toolbar #timeline-track-search {
            height:24px!important;
            border-radius:5px!important;
            background:rgba(0,0,0,.16)!important;
        }

        #timelineBody .timeline-layer-item {
            padding:0 8px!important;
            color:#c4c4c4!important;
        }

        #timelineBody .timeline-layer-item:nth-child(even),
        #timelineBody #keyframes-container > .timeline-track-row:nth-child(even) {
            background:rgba(255,255,255,.018)!important;
        }

        #timelineBody .timeline-layer-item:hover,
        #timelineBody .timeline-track-row:hover {
            background:rgba(255,255,255,.055)!important;
        }

        #timelineBody .timeline-layer-item.selected,
        #timelineBody .timeline-layer-item.timeline-row-selected {
            background:rgba(255,255,255,.10)!important;
            box-shadow:inset 3px 0 0 #d0d0d0!important;
        }

        #timelineBody .timeline-track-row.timeline-row-selected {
            background:rgba(255,255,255,.065)!important;
            box-shadow:inset 3px 0 0 rgba(208,208,208,.72)!important;
        }

        #timelineBody .timeline-scale-label {
            color:#b0b0b0!important;
        }

        #timelineBody .sm-timeline-bottom-status {
            height:25px;
            min-height:25px;
            flex-basis:25px;
            padding:0 10px;
            background:#2b2b2b;
            border-top:1px solid rgba(255,255,255,.08);
            color:#969696;
        }

        #timelineBody .sm-timeline-overview {
            height:9px;
            border-radius:999px;
            background:#242424;
        }

        #timelineBody .sm-timeline-overview-window {
            border-radius:999px;
            background:rgba(255,255,255,.18);
        }

        @media (max-width:980px) {
            #timelineBody .sm-timeline-pro-brand-copy span,
            #timelineBody .sm-timeline-command-action[data-timeline-ui-action="marker"] {
                display:none;
            }

            #timelineBody .sm-timeline-pro-brand {
                min-width:auto;
            }
        }

        @media (max-width:760px) {
            #timelineBody.sm-timeline-professional {
                --sm-tlp-left-width:170px;
            }

            #timelineBody .sm-timeline-pro-view-tabs {
                gap:0;
                padding:2px;
            }

            #timelineBody .sm-timeline-pro-view {
                padding:0 6px;
            }

            #timelineBody .sm-timeline-pro-view[data-timeline-pro-view="nodes"],
            #timelineBody .sm-timeline-pro-view[data-timeline-pro-view="bone"] {
                display:none;
            }

            #timelineBody .sm-timeline-command-text[data-timeline-ui-toggle="snap"] {
                display:none;
            }
        }

    `;

    document.head.appendChild(style);
}

function smTimelinePanelInstallProfessionalChrome(tb) {
    if (!tb) return;

    tb.classList.add('sm-timeline-professional');

    if (!tb.querySelector('.sm-timeline-pro-header')) {
        const header = document.createElement('div');
        header.className = 'sm-timeline-pro-header';
        header.innerHTML = `
            <div class="sm-timeline-pro-brand">
                <span class="sm-timeline-pro-brand-mark" aria-hidden="true">◆</span>
                <div class="sm-timeline-pro-brand-copy">
                    <strong>Timeline</strong>
                    <span id="timeline-context-description">Keyframes & animation</span>
                </div>
                <span id="timeline-context-badge" class="sm-timeline-context-badge">3D</span>
            </div>

            <nav class="sm-timeline-pro-view-tabs" aria-label="Timeline views">
                <button class="sm-timeline-pro-view active" data-timeline-pro-view="timeline">Dope Sheet</button>
                <button class="sm-timeline-pro-view" data-timeline-pro-view="graph">Graph</button>
                <button class="sm-timeline-pro-view" data-timeline-pro-view="nodes">Nodes</button>
                <button class="sm-timeline-pro-view" data-timeline-pro-view="bone">Rig</button>
            </nav>

            <div class="sm-timeline-pro-utility-tabs" aria-label="Timeline utilities">
                <button class="sm-timeline-pro-view sm-timeline-pro-utility" data-timeline-pro-view="spreadsheet" title="Timeline Spreadsheet Editor" aria-label="Spreadsheet">▦</button>
                <button class="sm-timeline-pro-view sm-timeline-pro-utility" data-timeline-pro-view="console" title="Global Developer Console" aria-label="Console">⌘</button>
            </div>

            <div class="sm-timeline-pro-head-spacer"></div>

            <button class="sm-timeline-pro-icon-button" data-timeline-ui-toggle="pin" title="Pin Timeline">⌖</button>
            <button class="sm-timeline-pro-icon-button" data-timeline-ui-toggle="max" title="Maximize Timeline">⛶</button>
        `;

        const resize = tb.querySelector('.resize-handle-timeline');
        resize?.insertAdjacentElement('afterend', header);
        if (!resize) tb.prepend(header);
    }

    if (!tb.querySelector('.sm-timeline-commandbar')) {
        const toolbar = document.createElement('div');
        toolbar.className = 'sm-timeline-commandbar';
        toolbar.innerHTML = `
            <div class="sm-timeline-command-group sm-timeline-command-quick">
                <button class="sm-timeline-command-tool active" data-timeline-ui-tool="select" title="Select">↖</button>
                <button class="sm-timeline-command-text active" data-timeline-ui-toggle="snap">⌁ Snap</button>
                <button class="sm-timeline-command-text" data-timeline-ui-toggle="autokey">
                    <span class="sm-timeline-autokey-dot"></span>
                    Auto Key
                </button>
            </div>

            <div class="sm-timeline-command-spacer"></div>

            <button class="sm-timeline-command-action" data-timeline-ui-action="marker">+ Marker</button>
            <button class="sm-timeline-command-action primary" data-timeline-ui-action="track">+ Track</button>
            <button class="sm-timeline-command-tool sm-timeline-tools-toggle" data-timeline-chrome-action="toggle-tools" title="More timeline tools" aria-label="More timeline tools" aria-expanded="false">☷</button>

            <div class="sm-timeline-command-drawer" aria-label="More timeline tools">
                <div class="sm-timeline-command-drawer-section">
                    <span class="sm-timeline-command-drawer-label">Edit</span>
                    <div class="sm-timeline-command-group">
                        <button class="sm-timeline-command-tool" data-timeline-ui-tool="box" title="Box Select">▣</button>
                        <button class="sm-timeline-command-tool" data-timeline-ui-tool="retime" title="Retime">↔</button>
                        <button class="sm-timeline-command-tool" data-timeline-ui-tool="split" title="Split Clip">╱</button>
                        <button class="sm-timeline-command-tool" data-timeline-ui-tool="slip" title="Slip Edit">⇆</button>
                    </div>
                </div>

                <div class="sm-timeline-command-drawer-section sm-timeline-2d-only" aria-label="2D frame operations">
                    <span class="sm-timeline-command-drawer-label">2D Frames</span>
                    <div class="sm-timeline-command-group">
                        <button class="sm-timeline-command-tool" id="brush-frame-copy-btn" title="Copy Current 2D Frame">⧉</button>
                        <button class="sm-timeline-command-tool" id="brush-frame-paste-btn" title="Paste 2D Frame">▣</button>
                        <button class="sm-timeline-command-tool" id="brush-frame-dup-next-btn" title="Duplicate To Next Frame">⇥</button>
                        <button class="sm-timeline-command-tool danger" id="brush-frame-clear-btn" title="Clear Current 2D Frame">×</button>
                    </div>
                </div>

                <div class="sm-timeline-command-drawer-section">
                    <span class="sm-timeline-command-drawer-label">Playback</span>
                    <div class="sm-timeline-command-group">
                        <button class="sm-timeline-command-text" data-timeline-ui-toggle="ghost">Ghost</button>
                        <label class="sm-timeline-command-field">
                            <span>Interpolation</span>
                            <select id="timeline-pro-interpolation">
                                <option value="bezier">Bezier</option>
                                <option value="linear">Linear</option>
                                <option value="constant">Constant</option>
                            </select>
                        </label>
                        <label class="sm-timeline-command-field">
                            <span>FPS</span>
                            <select id="timeline-pro-fps">
                                <option value="24">24</option>
                                <option value="30" selected>30</option>
                                <option value="60">60</option>
                            </select>
                        </label>
                    </div>
                </div>
            </div>
        `;

        const header = tb.querySelector('.sm-timeline-pro-header');
        header?.insertAdjacentElement('afterend', toolbar);
        if (!header) tb.prepend(toolbar);
    }

    const layers = tb.querySelector('.timeline-layers') || document.querySelector('.timeline-layers');
    const list = document.getElementById('layers-list');

    /*
     * Reuse the timeline's ORIGINAL search toolbar.
     * Do not create a second "Search tracks..." row.
     */
    if (layers && list) {
        const existingSearch =
            layers.querySelector(
                'input[placeholder*="Search"], input[placeholder*="search"]'
            );

        if (existingSearch) {
            existingSearch.id =
                existingSearch.id ||
                'timeline-track-search';

            if (existingSearch.id !== 'timeline-track-search') {
                existingSearch.dataset.timelineOriginalId =
                    existingSearch.id;

                existingSearch.id =
                    'timeline-track-search';
            }

            const toolbar =
                existingSearch.closest(
                    '.timeline-layer-toolbar, .layers-toolbar, .timeline-search-row'
                ) ||
                existingSearch.parentElement;

            if (toolbar) {
                toolbar.classList.add('sm-timeline-original-track-toolbar');

                if (!toolbar.querySelector('#timeline-track-search-clear')) {
                    const clear = document.createElement('button');
                    clear.id = 'timeline-track-search-clear';
                    clear.title = 'Clear Search';
                    clear.textContent = '×';
                    toolbar.appendChild(clear);
                }

                if (!toolbar.querySelector('#timeline-collapse-all')) {
                    const collapse = document.createElement('button');
                    collapse.id = 'timeline-collapse-all';
                    collapse.title = 'Collapse All';
                    collapse.textContent = '−';
                    toolbar.appendChild(collapse);
                }

                if (!toolbar.querySelector('#timeline-expand-all')) {
                    const expand = document.createElement('button');
                    expand.id = 'timeline-expand-all';
                    expand.title = 'Expand All';
                    expand.textContent = '+';
                    toolbar.appendChild(expand);
                }
            }
        }
    }

    if (!tb.querySelector('.sm-timeline-bottom-status')) {
        const status = document.createElement('div');
        status.className = 'sm-timeline-bottom-status';
        status.innerHTML = `
            <span><b id="timeline-status-visible-rows">0</b> rows</span>
            <span><b id="timeline-status-key-count">0</b> keys</span>
            <span>Frame <b id="timeline-status-frame">0</b></span>

            <div class="sm-timeline-overview" aria-label="Timeline overview">
                <div class="sm-timeline-overview-window"></div>
            </div>

            <div class="sm-timeline-bottom-right">
                <span>Range <b>0</b> — <b id="timeline-status-end-frame">0</b></span>
                <span id="timeline-status-zoom">100%</span>
            </div>
        `;

        tb.appendChild(status);
    }

    smTimelinePanelBindChromeActions(tb);
}

function smTimelinePanelBindChromeActions(tb) {
    if (!tb || tb.dataset.timelineChromeActionsBound === '1') return;
    tb.dataset.timelineChromeActionsBound = '1';

    const setToolsOpen = (open) => {
        const toolbar = tb.querySelector('.sm-timeline-commandbar');
        const toggle = tb.querySelector('[data-timeline-chrome-action="toggle-tools"]');
        if (!toolbar || !toggle) return;
        toolbar.classList.toggle('is-tools-open', open);
        toggle.classList.toggle('active', open);
        toggle.setAttribute('aria-expanded', String(open));
    };

    tb.addEventListener('click', event => {
        const action = event.target.closest('[data-timeline-chrome-action]');
        if (!action) return;
        if (action.dataset.timelineChromeAction === 'toggle-tools') {
            event.preventDefault();
            setToolsOpen(!action.classList.contains('active'));
        }
    });

    tb.addEventListener('keydown', event => {
        if (event.key === 'Escape') setToolsOpen(false);
    });
}

// SM Engine Panel: panels/TimelinePanel.js
window.TimelinePanel = {
    init() {
        smTimelinePanelInjectProfessionalStyles();
        const tb = document.getElementById('timelineBody');
        if (tb) {
            if (!tb.style.height && !getComputedStyle(tb).getPropertyValue('--timeline-height')) {
                tb.style.setProperty('--timeline-height', '240px');
            }
            tb.classList.remove('hidden');
            tb.classList.add('sm-timeline-professional');
            tb.innerHTML = `<div class="resize-handle-timeline" style="z-index: 66;"></div><div class="animation-path" id="animateObjbyPath"></div>`;
            const statsPanel = document.getElementById('stats-panel');
            if (statsPanel) {
                tb.appendChild(statsPanel);
                statsPanel.style.display = 'flex';
            }
            const controlsWrapper = document.getElementById('timeline-controls-wrapper');
            const graph = document.getElementById('graph-editor-container');
            if (controlsWrapper) {
                tb.appendChild(controlsWrapper);
                if (graph && graph.parentElement !== controlsWrapper) {
                    controlsWrapper.appendChild(graph);
                }
            } else if (graph) {
                tb.appendChild(graph);
            }
            const sculpt = document.getElementById('timeline-sculpt-panel');
            if (sculpt) tb.appendChild(sculpt);
            const bone = document.getElementById('bone-editor');
            if (bone) tb.appendChild(bone);
            const nodeEditor = document.getElementById('global-node-editor-container');
            if (nodeEditor) tb.appendChild(nodeEditor);
            smTimelinePanelInstallProfessionalChrome(tb);

            /*
             * Global Developer Console integration.
             * consolePanel.js can load before OR after TimelinePanel.
             */
            window.SMConsolePanel
                ?.integrateTimeline?.(
                    tb
                );

            window.SMSpreadsheetPanel
                ?.integrateTimeline?.(
                    tb
                );
        }
        const tc = document.getElementById('timeline-content');
        if (tc) {
            if (!tc.querySelector('#timeline-markers-container')) {
                tc.insertAdjacentHTML('afterbegin', `<div id="timeline-markers-container" class="timeline-markers-container"></div>`);
            }
            if (!tc.querySelector('#timeline-audio-track-row')) {
                tc.insertAdjacentHTML('beforeend', `<div id="timeline-audio-track-row" style="height:40px;width:100%;position:relative;background:rgba(var(--primary-dark-rgb),.6);border-bottom:1px solid rgba(var(--text-primary-rgb),.08);"><canvas id="timeline-audio-waveform-canvas" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"></canvas></div>`);
            }
            if (!tc.querySelector('#loop-zone')) {
                tc.insertAdjacentHTML('beforeend', `<div class="loop-zone" id="loop-zone"></div>`);
            }
            if (!tc.querySelector('#keyframe-lines')) {
                tc.insertAdjacentHTML('beforeend', `<svg class="keyframe-lines" id="keyframe-lines" xmlns="http://www.w3.org/2000/svg"></svg>`);
            }
            if (!tc.querySelector('#playhead')) {
                tc.insertAdjacentHTML('beforeend', `<div class="playhead" id="playhead"><div class="playhead-handle" id="playhead-handle"></div></div>`);
            }
            if (!tc.querySelector('#keyframes-container')) {
                tc.insertAdjacentHTML('beforeend', `<div class="keyframes-container" id="keyframes-container"></div>`);
            }
            if (!tc.querySelector('#selection-box')) {
                tc.insertAdjacentHTML('beforeend', `<div id="selection-box" class="selection-box"></div>`);
            }
            tc.style.display = '';
        }
        const gec = document.getElementById('graph-editor-container');
        if (gec && !gec.querySelector('.graph-editor-body')) {
            gec.innerHTML = `<div class="graph-editor-bar" style="display:flex;align-items:center;justify-content:space-between;"><span class="graph-editor-title">Graph Editor</span><button class="graph-expand-btn" id="graph-editor-expand" style="display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;color:inherit;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>Expand</button></div><div class="graph-editor-body"><div id="graph-channels-list" class="graph-sidebar"></div><div class="graph-canvas-wrapper"><canvas id="graph-canvas" class="graph-canvas"></canvas></div></div>`;
        }
        console.log('TimelinePanel initialized');
        window.dispatchEvent(new CustomEvent('sm:timeline-panel-ready', {
            detail: { panel: window.TimelinePanel, root: document.getElementById('timelineBody') }
        }));

        window.SMConsolePanel
            ?.integrateTimeline?.(
                document.getElementById(
                    'timelineBody'
                )
            );

        window.SMSpreadsheetPanel
            ?.integrateTimeline?.(
                document.getElementById(
                    'timelineBody'
                )
            );

        if (typeof window.initTimelineUI === 'function') {
            try {
                window.initTimelineUI();
            } catch (e) {
                console.warn('initTimelineUI failed:', e);
            }
        }
        if (typeof updateTimelineZoom === 'function') {
            updateTimelineZoom();
        }
        if (typeof updateTimelineGridTheme === 'function') {
            updateTimelineGridTheme();
        }
        if (typeof renderTimelineRuler === 'function') {
            renderTimelineRuler();
        }
        if (typeof refreshTimelineRowStyling === 'function') {
            refreshTimelineRowStyling();
        }

        this.setContext(
            document.body.classList.contains('animation-2d-mode-active') ? '2d' : 'default',
            { silent: true }
        );
    },

    /**
     * The timeline remains a single shared editor. 2D mode changes its data
     * context and exposes frame operations, but does not inject brush/settings UI.
     */
    setContext(context = 'default', options = {}) {
        const root = document.getElementById('timelineBody');
        if (!root) return;

        const normalized = context === '2d' ? '2d' : 'default';
        root.dataset.timelineContext = normalized;
        document.body.classList.toggle('sm-timeline-context-2d', normalized === '2d');

        const badge = document.getElementById('timeline-context-badge');
        if (badge) badge.textContent = normalized === '2d' ? '2D' : '3D';

        const description = document.getElementById('timeline-context-description');
        if (description) {
            description.textContent = normalized === '2d'
                ? 'Drawing frames & animation'
                : 'Keyframes & animation';
        }

        if (normalized === '2d') {
            window.animation2DManager?.syncWithTimeline?.();
            window.animation2DManager?.syncTimelineMarkers?.();
        }

        if (!options.silent) {
            window.dispatchEvent(new CustomEvent('sm:timeline-context-changed', {
                detail: { context: normalized, root }
            }));
        }
    },

    getContext() {
        return document.getElementById('timelineBody')?.dataset.timelineContext || 'default';
    },

    openConsole() {
        return window.SMConsolePanel
            ?.show?.();
    },

    closeConsole() {
        return window.SMConsolePanel
            ?.hide?.();
    },

    toggleConsole() {
        return window.SMConsolePanel
            ?.toggle?.();
    },

    openSpreadsheet() {
        return window.SMSpreadsheetPanel
            ?.show?.();
    },

    closeSpreadsheet() {
        return window.SMSpreadsheetPanel
            ?.hide?.();
    },

    toggleSpreadsheet() {
        return window.SMSpreadsheetPanel
            ?.toggle?.();
    }
};
if (typeof window.timelinePanel === 'undefined') {
    window.timelinePanel = window.TimelinePanel;
}
