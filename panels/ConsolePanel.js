// ============================================================================
// panels/consolePanel.js
// SM Engine — Global Developer Console
//
// Docked professional console for TimelinePanel.
//
// Captures:
//   console.log / info / warn / error / debug
//   window runtime errors
//   unhandled Promise rejections
//
// Features:
//   - All / Log / Info / Warning / Error / Debug filters
//   - search
//   - pause capture
//   - auto-scroll
//   - duplicate collapsing
//   - timestamps
//   - clear / copy visible output
//   - JS command line with history
//   - integrates as a Timeline professional view tab
//
// Classic script. Exposes:
//   window.SMConsolePanel
//   window.consolePanel
// ============================================================================

(function () {
    'use strict';

    const LEVELS = Object.freeze([
        'log',
        'info',
        'warn',
        'error',
        'debug',
        'command',
        'result'
    ]);

    const FILTERABLE_LEVELS = Object.freeze([
        'log',
        'info',
        'warn',
        'error',
        'debug'
    ]);

    const MAX_ENTRIES = 1800;
    const PREVIEW_MAX_CHARS = 1200;

    const originals = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console)
    };

    function nowTime() {
        const d = new Date();

        return [
            String(d.getHours()).padStart(2, '0'),
            String(d.getMinutes()).padStart(2, '0'),
            String(d.getSeconds()).padStart(2, '0')
        ].join(':') + '.' +
            String(d.getMilliseconds()).padStart(3, '0');
    }

    function safeString(value) {
        try {
            return String(value);
        } catch (_) {
            return '[Unprintable]';
        }
    }

    function circularReplacer() {
        const seen = new WeakSet();

        return function (key, value) {
            if (
                typeof value === 'object' &&
                value !== null
            ) {
                if (seen.has(value)) {
                    return '[Circular]';
                }

                seen.add(value);
            }

            if (typeof value === 'function') {
                return `[Function ${value.name || 'anonymous'}]`;
            }

            if (typeof value === 'bigint') {
                return `${value}n`;
            }

            return value;
        };
    }

    function objectLabel(value) {
        if (value === null) return 'null';

        if (value?.isObject3D) {
            return `${value.type || 'Object3D'} "${value.name || value.uuid || 'unnamed'}"`;
        }

        if (value instanceof Error) {
            return `${value.name}: ${value.message}`;
        }

        if (Array.isArray(value)) {
            return `Array(${value.length})`;
        }

        if (value instanceof Map) {
            return `Map(${value.size})`;
        }

        if (value instanceof Set) {
            return `Set(${value.size})`;
        }

        if (value instanceof HTMLElement) {
            const id = value.id ? `#${value.id}` : '';
            const cls =
                value.classList?.length
                    ? '.' + Array.from(value.classList).join('.')
                    : '';

            return `<${value.tagName.toLowerCase()}${id}${cls}>`;
        }

        return value?.constructor?.name || 'Object';
    }

    function previewArg(value) {
        if (value === undefined) return 'undefined';
        if (value === null) return 'null';

        const type = typeof value;

        if (type === 'string') {
            return value;
        }

        if (
            type === 'number' ||
            type === 'boolean' ||
            type === 'bigint'
        ) {
            return safeString(value);
        }

        if (type === 'symbol') {
            return value.toString();
        }

        if (type === 'function') {
            return `[Function ${value.name || 'anonymous'}]`;
        }

        if (value instanceof Error) {
            return `${value.name}: ${value.message}`;
        }

        if (value?.isObject3D) {
            const p = value.position;
            const pos = p
                ? ` @ (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`
                : '';

            return `${objectLabel(value)}${pos}`;
        }

        if (value instanceof HTMLElement) {
            return objectLabel(value);
        }

        try {
            const json = JSON.stringify(
                value,
                circularReplacer()
            );

            if (json === undefined) {
                return objectLabel(value);
            }

            return json.length > PREVIEW_MAX_CHARS
                ? json.slice(0, PREVIEW_MAX_CHARS) + '…'
                : json;
        } catch (_) {
            return objectLabel(value);
        }
    }

    function detailsArg(value) {
        if (value instanceof Error) {
            return value.stack || `${value.name}: ${value.message}`;
        }

        if (value?.isObject3D) {
            const data = {
                type: value.type,
                name: value.name,
                uuid: value.uuid,
                visible: value.visible,
                position: value.position?.toArray?.(),
                rotation: value.rotation
                    ? [
                        value.rotation.x,
                        value.rotation.y,
                        value.rotation.z,
                        value.rotation.order
                    ]
                    : undefined,
                scale: value.scale?.toArray?.(),
                userData: value.userData
            };

            try {
                return JSON.stringify(
                    data,
                    circularReplacer(),
                    2
                );
            } catch (_) {
                return previewArg(value);
            }
        }

        if (
            typeof value === 'object' &&
            value !== null
        ) {
            try {
                return JSON.stringify(
                    value,
                    circularReplacer(),
                    2
                );
            } catch (_) {
                return previewArg(value);
            }
        }

        return previewArg(value);
    }

    class SMConsolePanel {
        constructor() {
            this.entries = [];
            this.commandHistory = [];
            this.commandHistoryIndex = 0;

            this.root = null;
            this.timelineRoot = null;
            this.output = null;
            this.commandInput = null;
            this.searchInput = null;

            this.visible = false;
            this.paused = false;
            this.autoScroll = true;
            this.captureInstalled = false;
            this.uiInitialized = false;

            this.filters = new Set(
                FILTERABLE_LEVELS
            );

            this.levelCounts = {
                log: 0,
                info: 0,
                warn: 0,
                error: 0,
                debug: 0
            };

            this._timelineDisplaySnapshot = new Map();
            this._timelineClickBound = false;
            this._runtimeErrorBound = false;

            this._onTimelineReady = event => {
                this.integrateTimeline(
                    event.detail?.root ||
                    document.getElementById('timelineBody')
                );
            };

            window.addEventListener(
                'sm:timeline-panel-ready',
                this._onTimelineReady
            );

            this.installCapture();
        }

        // --------------------------------------------------------------------
        // Capture
        // --------------------------------------------------------------------

        installCapture() {
            if (this.captureInstalled) {
                return true;
            }

            FILTERABLE_LEVELS.forEach(level => {
                console[level] = (...args) => {
                    originals[level](...args);

                    if (!this.paused) {
                        this.push(
                            level,
                            args,
                            {
                                source: 'console'
                            }
                        );
                    }
                };
            });

            if (!this._runtimeErrorBound) {
                this._runtimeErrorBound = true;

                window.addEventListener(
                    'error',
                    event => {
                        if (this.paused) return;

                        const error =
                            event.error ||
                            new Error(
                                event.message ||
                                'Unknown runtime error'
                            );

                        this.push(
                            'error',
                            [
                                error,
                                event.filename
                                    ? `(${event.filename}:${event.lineno || 0}:${event.colno || 0})`
                                    : ''
                            ].filter(Boolean),
                            {
                                source: 'runtime'
                            }
                        );
                    }
                );

                window.addEventListener(
                    'unhandledrejection',
                    event => {
                        if (this.paused) return;

                        this.push(
                            'error',
                            [
                                'Unhandled Promise rejection:',
                                event.reason
                            ],
                            {
                                source: 'promise'
                            }
                        );
                    }
                );
            }

            this.captureInstalled = true;

            return true;
        }

        push(
            level,
            args,
            meta = {}
        ) {
            const normalizedLevel =
                LEVELS.includes(level)
                    ? level
                    : 'log';

            const values =
                Array.isArray(args)
                    ? args
                    : [args];

            const message =
                values
                    .map(previewArg)
                    .join(' ');

            const last =
                this.entries[
                    this.entries.length - 1
                ];

            /*
             * Collapse immediate duplicate spam.
             */
            if (
                last &&
                last.level === normalizedLevel &&
                last.message === message &&
                last.source === (meta.source || 'console')
            ) {
                last.count += 1;
                last.time = nowTime();
                last.rawArgs = values;

                this._renderAll();

                return last;
            }

            const entry = {
                id:
                    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,

                level:
                    normalizedLevel,

                time:
                    nowTime(),

                timestamp:
                    Date.now(),

                message,

                rawArgs:
                    values,

                details:
                    values
                        .map(detailsArg)
                        .join('\n\n'),

                source:
                    meta.source ||
                    'console',

                count: 1
            };

            this.entries.push(entry);

            if (
                this.levelCounts[
                    normalizedLevel
                ] !== undefined
            ) {
                this.levelCounts[
                    normalizedLevel
                ] += 1;
            }

            if (
                this.entries.length >
                MAX_ENTRIES
            ) {
                const removed =
                    this.entries.splice(
                        0,
                        this.entries.length -
                        MAX_ENTRIES
                    );

                removed.forEach(item => {
                    if (
                        this.levelCounts[
                            item.level
                        ] !== undefined
                    ) {
                        this.levelCounts[
                            item.level
                        ] = Math.max(
                            0,
                            this.levelCounts[
                                item.level
                            ] - 1
                        );
                    }
                });
            }

            this._appendEntry(entry);
            this._updateCounts();

            return entry;
        }

        // --------------------------------------------------------------------
        // Timeline integration
        // --------------------------------------------------------------------

        integrateTimeline(
            timelineRoot =
                document.getElementById(
                    'timelineBody'
                )
        ) {
            if (!timelineRoot) {
                return false;
            }

            this.timelineRoot =
                timelineRoot;

            const tabs =
                timelineRoot.querySelector(
                    '.sm-timeline-pro-view-tabs'
                );

            if (tabs) {
                let consoleTab =
                    tabs.querySelector(
                        '[data-timeline-pro-view="console"]'
                    );

                if (!consoleTab) {
                    consoleTab =
                        document.createElement(
                            'button'
                        );

                    consoleTab.className =
                        'sm-timeline-pro-view';

                    consoleTab.dataset
                        .timelineProView =
                        'console';

                    consoleTab.textContent =
                        'Console';

                    consoleTab.title =
                        'Global Developer Console';

                    tabs.appendChild(
                        consoleTab
                    );
                }
            }

            this.mount(
                timelineRoot
            );

            if (!this._timelineClickBound) {
                this._timelineClickBound =
                    true;

                /*
                 * Capture phase:
                 * - Console tab is owned here.
                 * - Other timeline tabs first close Console, then their
                 *   existing Timeline/Graph/Nodes/Rig handlers can run.
                 */
                timelineRoot.addEventListener(
                    'click',
                    event => {
                        const button =
                            event.target.closest(
                                '[data-timeline-pro-view]'
                            );

                        if (!button) {
                            return;
                        }

                        const view =
                            button.dataset
                                .timelineProView;

                        if (
                            view ===
                            'console'
                        ) {
                            event.preventDefault();
                            event.stopImmediatePropagation();

                            this.show();

                            return;
                        }

                        if (this.visible) {
                            this.hide({
                                restoreTimeline:
                                    true
                            });
                        }
                    },
                    true
                );
            }

            return true;
        }

        mount(host) {
            if (!host) {
                return false;
            }

            this._injectStyles();

            if (
                this.root &&
                this.root.parentElement !==
                    host
            ) {
                host.appendChild(
                    this.root
                );

                return true;
            }

            if (this.root) {
                return true;
            }

            const root =
                document.createElement(
                    'section'
                );

            root.id =
                'sm-global-console-panel';

            root.className =
                'sm-console-panel';

            root.setAttribute(
                'aria-label',
                'SM Engine Developer Console'
            );

            root.style.display =
                'none';

            root.innerHTML = `
                <div class="sm-console-toolbar">
                    <div class="sm-console-toolbar-left">
                        <span class="sm-console-title">Developer Console</span>

                        <button class="sm-console-filter active"
                                data-console-filter="all"
                                title="Show all messages">
                            All
                            <span class="sm-console-count" data-console-count="all">0</span>
                        </button>

                        <button class="sm-console-filter active"
                                data-console-filter="log"
                                title="Log messages">
                            Log
                            <span class="sm-console-count" data-console-count="log">0</span>
                        </button>

                        <button class="sm-console-filter active"
                                data-console-filter="info"
                                title="Info messages">
                            Info
                            <span class="sm-console-count" data-console-count="info">0</span>
                        </button>

                        <button class="sm-console-filter active"
                                data-console-filter="warn"
                                title="Warnings">
                            Warn
                            <span class="sm-console-count" data-console-count="warn">0</span>
                        </button>

                        <button class="sm-console-filter active"
                                data-console-filter="error"
                                title="Errors">
                            Error
                            <span class="sm-console-count" data-console-count="error">0</span>
                        </button>

                        <button class="sm-console-filter active"
                                data-console-filter="debug"
                                title="Debug messages">
                            Debug
                            <span class="sm-console-count" data-console-count="debug">0</span>
                        </button>
                    </div>

                    <div class="sm-console-toolbar-right">
                        <label class="sm-console-search-wrap" title="Search console">
                            <span>⌕</span>
                            <input id="sm-console-search"
                                   type="search"
                                   autocomplete="off"
                                   spellcheck="false"
                                   placeholder="Search logs">
                        </label>

                        <button class="sm-console-action"
                                data-console-action="pause"
                                title="Pause capture">
                            Pause
                        </button>

                        <button class="sm-console-action active"
                                data-console-action="autoscroll"
                                title="Auto scroll">
                            Auto
                        </button>

                        <button class="sm-console-action"
                                data-console-action="copy"
                                title="Copy visible messages">
                            Copy
                        </button>

                        <button class="sm-console-action"
                                data-console-action="clear"
                                title="Clear console">
                            Clear
                        </button>
                    </div>
                </div>

                <div class="sm-console-output"
                     id="sm-console-output"
                     role="log"
                     aria-live="polite">
                </div>

                <div class="sm-console-command-row">
                    <span class="sm-console-prompt">&gt;</span>

                    <input id="sm-console-command"
                           class="sm-console-command"
                           type="text"
                           autocomplete="off"
                           spellcheck="false"
                           placeholder="Execute JavaScript in SM Engine context…">

                    <span class="sm-console-command-hint">
                        Enter Execute · ↑↓ History
                    </span>
                </div>
            `;

            host.appendChild(
                root
            );

            this.root =
                root;

            this.output =
                root.querySelector(
                    '#sm-console-output'
                );

            this.commandInput =
                root.querySelector(
                    '#sm-console-command'
                );

            this.searchInput =
                root.querySelector(
                    '#sm-console-search'
                );

            this._bindUI();
            this._renderAll();
            this._updateCounts();

            this.uiInitialized =
                true;

            return true;
        }

        _timelineViewElements() {
            if (!this.timelineRoot) {
                return [];
            }

            const selectors = [
                '.sm-timeline-commandbar',
                '#stats-panel',
                '#timeline-controls-wrapper',
                '#timeline-sculpt-panel',
                '#bone-editor',
                '#global-node-editor-container',
                '.sm-timeline-bottom-status'
            ];

            const result = [];

            selectors.forEach(selector => {
                this.timelineRoot
                    .querySelectorAll(
                        selector
                    )
                    .forEach(element => {
                        if (
                            element &&
                            element !==
                                this.root &&
                            !result.includes(
                                element
                            )
                        ) {
                            result.push(
                                element
                            );
                        }
                    });
            });

            return result;
        }

        show() {
            if (
                !this.timelineRoot
            ) {
                this.integrateTimeline();
            }

            if (
                !this.timelineRoot ||
                !this.root
            ) {
                return false;
            }

            /*
             * Shared lower-editor workspace:
             * Console and Spreadsheet are mutually exclusive.
             */
            if (
                window.SMSpreadsheetPanel
                    ?.visible
            ) {
                window.SMSpreadsheetPanel
                    .hide?.({
                        restoreTimeline:
                            true
                    });
            }

            if (!this.visible) {
                this._timelineDisplaySnapshot
                    .clear();

                this._timelineViewElements()
                    .forEach(element => {
                        this._timelineDisplaySnapshot
                            .set(
                                element,
                                element.style
                                    .display
                            );

                        element.style
                            .setProperty(
                                'display',
                                'none',
                                'important'
                            );
                    });
            }

            this.root.style
                .setProperty(
                    'display',
                    'flex',
                    'important'
                );

            this.visible = true;

            this.timelineRoot
                .querySelectorAll(
                    '.sm-timeline-pro-view'
                )
                .forEach(button => {
                    button.classList.toggle(
                        'active',
                        button.dataset
                            .timelineProView ===
                            'console'
                    );
                });

            this._renderAll();

            requestAnimationFrame(
                () => {
                    this.commandInput
                        ?.focus?.();

                    this._scrollToBottom();
                }
            );

            window.dispatchEvent(
                new CustomEvent(
                    'sm:console-panel-shown',
                    {
                        detail: {
                            panel: this
                        }
                    }
                )
            );

            return true;
        }

        hide({
            restoreTimeline = true
        } = {}) {
            if (!this.root) {
                return false;
            }

            this.root.style
                .setProperty(
                    'display',
                    'none',
                    'important'
                );

            this.visible = false;

            if (restoreTimeline) {
                this._timelineDisplaySnapshot
                    .forEach(
                        (
                            display,
                            element
                        ) => {
                            element.style
                                .removeProperty(
                                    'display'
                                );

                            if (display) {
                                element.style
                                    .display =
                                    display;
                            }
                        }
                    );

                this._timelineDisplaySnapshot
                    .clear();
            }

            return true;
        }

        toggle() {
            return this.visible
                ? this.hide()
                : this.show();
        }

        // --------------------------------------------------------------------
        // UI
        // --------------------------------------------------------------------

        _injectStyles() {
            if (
                document.getElementById(
                    'sm-global-console-styles'
                )
            ) {
                return;
            }

            const style =
                document.createElement(
                    'style'
                );

            style.id =
                'sm-global-console-styles';

            style.textContent = `
                #timelineBody .sm-console-panel {
                    min-height:0;
                    flex:1 1 0;
                    display:flex;
                    flex-direction:column;
                    overflow:hidden;

                    background:
                        var(--panel-bg, var(--primary-dark, #333333));

                    color:
                        var(--text-primary, #ffffff);

                    font-family:
                        Inter,
                        "Segoe UI",
                        Arial,
                        sans-serif;

                    border:0;
                    border-radius:0;
                    box-shadow:none;
                }

                #timelineBody .sm-console-toolbar {
                    height:31px;
                    min-height:31px;
                    flex:0 0 31px;

                    display:flex;
                    align-items:center;
                    gap:6px;

                    padding:0 6px;

                    background:
                        var(--header-bg, var(--secondary-dark, #3c3c3c));

                    border:0;
                    overflow:hidden;
                }

                #timelineBody .sm-console-toolbar-left,
                #timelineBody .sm-console-toolbar-right {
                    min-width:0;
                    display:flex;
                    align-items:center;
                    gap:2px;
                }

                #timelineBody .sm-console-toolbar-left {
                    flex:1 1 auto;
                    overflow-x:auto;
                    scrollbar-width:none;
                }

                #timelineBody .sm-console-toolbar-left::-webkit-scrollbar {
                    display:none;
                }

                #timelineBody .sm-console-toolbar-right {
                    margin-left:auto;
                    flex:0 0 auto;
                }

                #timelineBody .sm-console-title {
                    height:24px;
                    display:inline-flex;
                    align-items:center;

                    padding:0 8px 0 5px;

                    color:
                        var(--text-secondary, #b0b0b0);

                    font-size:9px;
                    font-weight:600;
                    letter-spacing:.25px;
                    text-transform:uppercase;
                    white-space:nowrap;
                }

                #timelineBody .sm-console-filter,
                #timelineBody .sm-console-action {
                    height:24px;
                    min-height:24px;

                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    gap:5px;

                    padding:0 7px;

                    background:transparent;
                    color:
                        var(--text-secondary, #b0b0b0);

                    border:0;
                    border-radius:0;
                    box-shadow:none;

                    font-size:9px;
                    cursor:pointer;
                    white-space:nowrap;
                }

                #timelineBody .sm-console-filter:hover,
                #timelineBody .sm-console-action:hover {
                    background:rgba(255,255,255,.045);
                    color:
                        var(--text-primary, #fff);
                }

                #timelineBody .sm-console-filter.active,
                #timelineBody .sm-console-action.active {
                    background:rgba(255,255,255,.07);
                    color:
                        var(--text-primary, #fff);
                }

                #timelineBody .sm-console-filter[data-console-filter="warn"].active {
                    color:#d9b56c;
                }

                #timelineBody .sm-console-filter[data-console-filter="error"].active {
                    color:#d97c7c;
                }

                #timelineBody .sm-console-filter[data-console-filter="info"].active {
                    color:#8eb5d5;
                }

                #timelineBody .sm-console-filter[data-console-filter="debug"].active {
                    color:#a98fc4;
                }

                #timelineBody .sm-console-count {
                    min-width:13px;
                    height:13px;

                    display:inline-grid;
                    place-items:center;

                    padding:0 3px;

                    background:rgba(255,255,255,.055);
                    color:#7f7f7f;

                    font-family:
                        "Cascadia Mono",
                        Consolas,
                        monospace;

                    font-size:7px;
                    line-height:13px;
                }

                #timelineBody .sm-console-search-wrap {
                    width:clamp(120px,15vw,220px);
                    height:24px;

                    display:flex;
                    align-items:center;
                    gap:4px;

                    padding:0 6px;

                    background:
                        var(--primary-dark, #333333);

                    color:#717171;
                }

                #timelineBody .sm-console-search-wrap input {
                    min-width:0;
                    width:100%;
                    height:22px;

                    padding:0;

                    background:transparent;
                    color:
                        var(--text-primary, #fff);

                    border:0;
                    border-radius:0;
                    outline:0;
                    box-shadow:none;

                    font-size:9px;
                }

                #timelineBody .sm-console-search-wrap input::placeholder {
                    color:#666;
                }

                #timelineBody .sm-console-output {
                    min-height:0;
                    flex:1 1 0;

                    overflow:auto;

                    background:
                        var(--primary-dark, #333333);

                    scrollbar-width:thin;
                    scrollbar-color:
                        rgba(255,255,255,.15)
                        transparent;

                    font-family:
                        "Cascadia Mono",
                        Consolas,
                        "SFMono-Regular",
                        monospace;

                    font-size:10px;
                    line-height:1.45;
                }

                #timelineBody .sm-console-output::-webkit-scrollbar {
                    width:6px;
                    height:6px;
                }

                #timelineBody .sm-console-output::-webkit-scrollbar-track {
                    background:transparent;
                }

                #timelineBody .sm-console-output::-webkit-scrollbar-thumb {
                    background:rgba(255,255,255,.14);
                    border-radius:0;
                }

                #timelineBody .sm-console-empty {
                    height:100%;

                    display:grid;
                    place-items:center;

                    color:#626262;
                    font-size:9px;
                }

                #timelineBody .sm-console-row {
                    min-height:23px;

                    display:grid;
                    grid-template-columns:
                        66px
                        18px
                        minmax(0,1fr)
                        auto;

                    align-items:start;

                    padding:3px 7px 3px 5px;

                    background:transparent;
                    color:#c6c6c6;

                    border:0;
                    cursor:default;
                }

                #timelineBody .sm-console-row:nth-child(even) {
                    background:rgba(255,255,255,.008);
                }

                #timelineBody .sm-console-row:hover {
                    background:rgba(255,255,255,.032);
                }

                #timelineBody .sm-console-row[data-level="warn"] {
                    background:rgba(170,126,47,.075);
                    color:#d7bd83;
                }

                #timelineBody .sm-console-row[data-level="error"] {
                    background:rgba(151,54,54,.095);
                    color:#e09a9a;
                }

                #timelineBody .sm-console-row[data-level="info"] {
                    color:#9fc2df;
                }

                #timelineBody .sm-console-row[data-level="debug"] {
                    color:#b3a0c8;
                }

                #timelineBody .sm-console-row[data-level="command"] {
                    color:#d8d8d8;
                    background:rgba(255,255,255,.025);
                }

                #timelineBody .sm-console-row[data-level="result"] {
                    color:#9fd0a4;
                    background:rgba(71,126,78,.055);
                }

                #timelineBody .sm-console-time {
                    color:#606060;
                    font-size:8px;
                    user-select:none;
                }

                #timelineBody .sm-console-level-icon {
                    width:14px;
                    height:14px;

                    display:grid;
                    place-items:center;

                    margin-top:1px;

                    color:#747474;
                    font-size:8px;
                    user-select:none;
                }

                #timelineBody .sm-console-row[data-level="warn"] .sm-console-level-icon {
                    color:#d9b15c;
                }

                #timelineBody .sm-console-row[data-level="error"] .sm-console-level-icon {
                    color:#d86666;
                }

                #timelineBody .sm-console-row[data-level="info"] .sm-console-level-icon {
                    color:#75a8cf;
                }

                #timelineBody .sm-console-message {
                    min-width:0;
                    white-space:pre-wrap;
                    overflow-wrap:anywhere;
                }

                #timelineBody .sm-console-repeat {
                    min-width:18px;
                    height:15px;

                    display:inline-grid;
                    place-items:center;

                    margin-left:8px;
                    padding:0 4px;

                    background:rgba(255,255,255,.07);
                    color:#9b9b9b;

                    font-size:7px;
                }

                #timelineBody .sm-console-details {
                    grid-column:1 / -1;

                    display:none;

                    margin:4px 0 2px 79px;
                    padding:7px 8px;

                    overflow:auto;
                    max-height:220px;

                    background:rgba(0,0,0,.14);
                    color:#9d9d9d;

                    white-space:pre-wrap;
                    overflow-wrap:anywhere;

                    font-size:9px;
                    line-height:1.45;
                }

                #timelineBody .sm-console-row.expanded .sm-console-details {
                    display:block;
                }

                #timelineBody .sm-console-command-row {
                    height:29px;
                    min-height:29px;
                    flex:0 0 29px;

                    display:flex;
                    align-items:center;
                    gap:6px;

                    padding:0 7px;

                    background:
                        var(--header-bg, var(--secondary-dark, #3c3c3c));

                    border:0;

                    font-family:
                        "Cascadia Mono",
                        Consolas,
                        monospace;
                }

                #timelineBody .sm-console-prompt {
                    color:#8eb392;
                    font-size:11px;
                    font-weight:600;
                }

                #timelineBody .sm-console-command {
                    min-width:0;
                    flex:1 1 auto;
                    height:25px;

                    padding:0 2px;

                    background:transparent;
                    color:
                        var(--text-primary, #fff);

                    border:0;
                    border-radius:0;
                    outline:0;
                    box-shadow:none;

                    font-family:inherit;
                    font-size:10px;
                }

                #timelineBody .sm-console-command::placeholder {
                    color:#666;
                }

                #timelineBody .sm-console-command-hint {
                    color:#5f5f5f;
                    font-size:7px;
                    white-space:nowrap;
                }

                @media (max-width:1000px) {
                    #timelineBody .sm-console-title,
                    #timelineBody .sm-console-command-hint {
                        display:none;
                    }

                    #timelineBody .sm-console-search-wrap {
                        width:120px;
                    }
                }
            `;

            document.head.appendChild(
                style
            );
        }

        _bindUI() {
            if (!this.root) {
                return;
            }

            this.root
                .querySelectorAll(
                    '[data-console-filter]'
                )
                .forEach(button => {
                    button.addEventListener(
                        'click',
                        () => {
                            const level =
                                button.dataset
                                    .consoleFilter;

                            if (
                                level ===
                                    'all'
                            ) {
                                const allEnabled =
                                    FILTERABLE_LEVELS
                                        .every(
                                            item =>
                                                this.filters
                                                    .has(
                                                        item
                                                    )
                                        );

                                if (allEnabled) {
                                    this.filters.clear();
                                } else {
                                    this.filters =
                                        new Set(
                                            FILTERABLE_LEVELS
                                        );
                                }
                            } else {
                                if (
                                    this.filters
                                        .has(
                                            level
                                        )
                                ) {
                                    this.filters
                                        .delete(
                                            level
                                        );
                                } else {
                                    this.filters
                                        .add(
                                            level
                                        );
                                }
                            }

                            this._syncFilterButtons();
                            this._renderAll();
                        }
                    );
                });

            this.root
                .querySelectorAll(
                    '[data-console-action]'
                )
                .forEach(button => {
                    button.addEventListener(
                        'click',
                        () => {
                            const action =
                                button.dataset
                                    .consoleAction;

                            if (
                                action ===
                                    'clear'
                            ) {
                                this.clear();
                            }

                            if (
                                action ===
                                    'pause'
                            ) {
                                this.paused =
                                    !this.paused;

                                button.classList.toggle(
                                    'active',
                                    this.paused
                                );

                                button.textContent =
                                    this.paused
                                        ? 'Resume'
                                        : 'Pause';
                            }

                            if (
                                action ===
                                    'autoscroll'
                            ) {
                                this.autoScroll =
                                    !this.autoScroll;

                                button.classList.toggle(
                                    'active',
                                    this.autoScroll
                                );

                                if (
                                    this.autoScroll
                                ) {
                                    this._scrollToBottom();
                                }
                            }

                            if (
                                action ===
                                    'copy'
                            ) {
                                this.copyVisible();
                            }
                        }
                    );
                });

            this.searchInput
                ?.addEventListener(
                    'input',
                    () =>
                        this._renderAll()
                );

            this.output
                ?.addEventListener(
                    'click',
                    event => {
                        const row =
                            event.target.closest(
                                '.sm-console-row'
                            );

                        if (!row) {
                            return;
                        }

                        row.classList.toggle(
                            'expanded'
                        );
                    }
                );

            this.commandInput
                ?.addEventListener(
                    'keydown',
                    event => {
                        if (
                            event.key ===
                                'Enter' &&
                            !event.shiftKey
                        ) {
                            event.preventDefault();

                            const code =
                                this.commandInput
                                    .value
                                    .trim();

                            if (!code) {
                                return;
                            }

                            this.commandInput.value =
                                '';

                            this.execute(
                                code
                            );

                            return;
                        }

                        if (
                            event.key ===
                                'ArrowUp'
                        ) {
                            if (
                                !this.commandHistory
                                    .length
                            ) {
                                return;
                            }

                            event.preventDefault();

                            this.commandHistoryIndex =
                                Math.max(
                                    0,
                                    this.commandHistoryIndex -
                                        1
                                );

                            this.commandInput.value =
                                this.commandHistory[
                                    this.commandHistoryIndex
                                ] ||
                                '';

                            this.commandInput
                                .setSelectionRange(
                                    this.commandInput
                                        .value
                                        .length,
                                    this.commandInput
                                        .value
                                        .length
                                );

                            return;
                        }

                        if (
                            event.key ===
                                'ArrowDown'
                        ) {
                            if (
                                !this.commandHistory
                                    .length
                            ) {
                                return;
                            }

                            event.preventDefault();

                            this.commandHistoryIndex =
                                Math.min(
                                    this.commandHistory
                                        .length,
                                    this.commandHistoryIndex +
                                        1
                                );

                            this.commandInput.value =
                                this.commandHistoryIndex <
                                this.commandHistory.length
                                    ? (
                                        this.commandHistory[
                                            this.commandHistoryIndex
                                        ] ||
                                        ''
                                    )
                                    : '';
                        }
                    }
                );
        }

        _syncFilterButtons() {
            if (!this.root) {
                return;
            }

            const all =
                FILTERABLE_LEVELS.every(
                    level =>
                        this.filters.has(
                            level
                        )
                );

            this.root
                .querySelectorAll(
                    '[data-console-filter]'
                )
                .forEach(button => {
                    const level =
                        button.dataset
                            .consoleFilter;

                    button.classList.toggle(
                        'active',
                        level === 'all'
                            ? all
                            : this.filters.has(
                                level
                            )
                    );
                });
        }

        _passesFilter(entry) {
            if (
                FILTERABLE_LEVELS
                    .includes(
                        entry.level
                    ) &&
                !this.filters.has(
                    entry.level
                )
            ) {
                return false;
            }

            const query =
                this.searchInput
                    ?.value
                    ?.trim()
                    ?.toLowerCase() ||
                '';

            if (
                query &&
                !(
                    entry.message
                        .toLowerCase()
                        .includes(query) ||
                    entry.source
                        .toLowerCase()
                        .includes(query) ||
                    entry.level
                        .toLowerCase()
                        .includes(query)
                )
            ) {
                return false;
            }

            return true;
        }

        _levelIcon(level) {
            return {
                log: '•',
                info: 'i',
                warn: '▲',
                error: '×',
                debug: '◇',
                command: '›',
                result: '↳'
            }[level] || '•';
        }

        _entryElement(entry) {
            const row =
                document.createElement(
                    'div'
                );

            row.className =
                'sm-console-row';

            row.dataset.level =
                entry.level;

            row.dataset.entryId =
                entry.id;

            row.dataset.source =
                entry.source ||
                'console';

            row.title =
                `Source: ${entry.source || 'console'}`;

            const time =
                document.createElement(
                    'span'
                );

            time.className =
                'sm-console-time';

            time.textContent =
                entry.time;

            const icon =
                document.createElement(
                    'span'
                );

            icon.className =
                'sm-console-level-icon';

            icon.textContent =
                this._levelIcon(
                    entry.level
                );

            const message =
                document.createElement(
                    'span'
                );

            message.className =
                'sm-console-message';

            message.textContent =
                entry.message;

            const repeat =
                document.createElement(
                    'span'
                );

            if (
                entry.count > 1
            ) {
                repeat.className =
                    'sm-console-repeat';

                repeat.textContent =
                    String(
                        entry.count
                    );
            }

            const details =
                document.createElement(
                    'pre'
                );

            details.className =
                'sm-console-details';

            details.textContent =
                entry.details ||
                entry.message;

            row.append(
                time,
                icon,
                message,
                repeat,
                details
            );

            return row;
        }

        _appendEntry(entry) {
            if (
                !this.output ||
                !this._passesFilter(
                    entry
                )
            ) {
                return;
            }

            if (
                this.output.querySelector(
                    '.sm-console-empty'
                )
            ) {
                this.output.innerHTML =
                    '';
            }

            this.output.appendChild(
                this._entryElement(
                    entry
                )
            );

            if (this.autoScroll) {
                this._scrollToBottom();
            }
        }

        _renderAll() {
            if (!this.output) {
                return;
            }

            const visible =
                this.entries.filter(
                    entry =>
                        this._passesFilter(
                            entry
                        )
                );

            this.output.innerHTML =
                '';

            if (!visible.length) {
                const empty =
                    document.createElement(
                        'div'
                    );

                empty.className =
                    'sm-console-empty';

                empty.textContent =
                    this.entries.length
                        ? 'No messages match the current filters.'
                        : 'Console ready. Engine logs will appear here.';

                this.output.appendChild(
                    empty
                );

                return;
            }

            const fragment =
                document.createDocumentFragment();

            visible.forEach(entry => {
                fragment.appendChild(
                    this._entryElement(
                        entry
                    )
                );
            });

            this.output.appendChild(
                fragment
            );

            if (this.autoScroll) {
                this._scrollToBottom();
            }
        }

        _updateCounts() {
            if (!this.root) {
                return;
            }

            FILTERABLE_LEVELS.forEach(
                level => {
                    const element =
                        this.root.querySelector(
                            `[data-console-count="${level}"]`
                        );

                    if (element) {
                        element.textContent =
                            String(
                                this.levelCounts[
                                    level
                                ] ||
                                0
                            );
                    }
                }
            );

            const all =
                this.root.querySelector(
                    '[data-console-count="all"]'
                );

            if (all) {
                all.textContent =
                    String(
                        FILTERABLE_LEVELS
                            .reduce(
                                (
                                    total,
                                    level
                                ) =>
                                    total +
                                    (
                                        this.levelCounts[
                                            level
                                        ] ||
                                        0
                                    ),
                                0
                            )
                    );
            }
        }

        _scrollToBottom() {
            if (!this.output) {
                return;
            }

            requestAnimationFrame(
                () => {
                    this.output.scrollTop =
                        this.output.scrollHeight;
                }
            );
        }

        // --------------------------------------------------------------------
        // Commands
        // --------------------------------------------------------------------

        async execute(code) {
            const command =
                String(code || '')
                    .trim();

            if (!command) {
                return undefined;
            }

            this.commandHistory.push(
                command
            );

            if (
                this.commandHistory.length >
                120
            ) {
                this.commandHistory.shift();
            }

            this.commandHistoryIndex =
                this.commandHistory.length;

            this.push(
                'command',
                [command],
                {
                    source: 'command'
                }
            );

            if (
                command === ':clear' ||
                command === 'clear'
            ) {
                this.clear();

                return undefined;
            }

            if (
                command === ':help'
            ) {
                this.push(
                    'result',
                    [
                        [
                            'SM Console commands:',
                            ':clear — clear output',
                            ':help — show help',
                            ':scene — inspect window.scene',
                            ':selected — inspect selected object',
                            ':camera — inspect active camera',
                            'Any other input executes as JavaScript.'
                        ].join('\n')
                    ],
                    {
                        source: 'console'
                    }
                );

                return undefined;
            }

            const aliases = {
                ':scene':
                    'window.scene',

                ':selected':
                    'window.selectedObject',

                ':camera':
                    'window.cameraSystem?.activeCamera || window.camera'
            };

            const executable =
                aliases[
                    command
                ] ||
                command;

            try {
                /*
                 * Indirect eval intentionally executes in the GLOBAL context,
                 * which is exactly what an editor developer console needs.
                 */
                let result =
                    (0, eval)(
                        executable
                    );

                if (
                    result &&
                    typeof result.then ===
                        'function'
                ) {
                    result =
                        await result;
                }

                this.push(
                    'result',
                    [result],
                    {
                        source:
                            'command-result'
                    }
                );

                return result;
            } catch (error) {
                this.push(
                    'error',
                    [error],
                    {
                        source:
                            'command-error'
                    }
                );

                return undefined;
            }
        }

        /**
         * Remove entries emitted by one engine subsystem/source.
         * Other console messages remain untouched.
         */
        clearSource(source) {
            const target =
                String(
                    source ??
                    ''
                ).trim();

            if (!target) {
                return 0;
            }

            const before =
                this.entries.length;

            this.entries =
                this.entries.filter(
                    entry =>
                        entry.source !==
                        target
                );

            const removed =
                before -
                this.entries.length;

            FILTERABLE_LEVELS.forEach(
                level => {
                    this.levelCounts[level] =
                        0;
                }
            );

            this.entries.forEach(
                entry => {
                    if (
                        this.levelCounts[
                            entry.level
                        ] !==
                        undefined
                    ) {
                        this.levelCounts[
                            entry.level
                        ] +=
                            1;
                    }
                }
            );

            this._renderAll();
            this._updateCounts();

            window.dispatchEvent(
                new CustomEvent(
                    'sm:console-source-cleared',
                    {
                        detail: {
                            source:
                                target,
                            removed
                        }
                    }
                )
            );

            return removed;
        }

        getSourceEntries(source) {
            const target =
                String(
                    source ??
                    ''
                ).trim();

            if (!target) {
                return [];
            }

            return this.entries.filter(
                entry =>
                    entry.source ===
                    target
            );
        }

        clear() {
            this.entries = [];

            FILTERABLE_LEVELS.forEach(
                level => {
                    this.levelCounts[
                        level
                    ] = 0;
                }
            );

            this._renderAll();
            this._updateCounts();

            window.dispatchEvent(
                new CustomEvent(
                    'sm:console-cleared'
                )
            );
        }

        async copyVisible() {
            const visible =
                this.entries.filter(
                    entry =>
                        this._passesFilter(
                            entry
                        )
                );

            const text =
                visible
                    .map(entry => {
                        const repeat =
                            entry.count > 1
                                ? ` ×${entry.count}`
                                : '';

                        return `[${entry.time}] [${entry.level.toUpperCase()}] ${entry.message}${repeat}`;
                    })
                    .join('\n');

            try {
                await navigator.clipboard
                    .writeText(
                        text
                    );

                this.push(
                    'info',
                    [
                        `Copied ${visible.length} visible console message(s).`
                    ],
                    {
                        source: 'console'
                    }
                );
            } catch (_) {
                this.push(
                    'warn',
                    [
                        'Clipboard write failed.'
                    ],
                    {
                        source: 'console'
                    }
                );
            }
        }

        restoreNativeConsole() {
            FILTERABLE_LEVELS.forEach(
                level => {
                    console[level] =
                        originals[level];
                }
            );

            this.captureInstalled =
                false;
        }

        debug() {
            originals.log(
                '[SMConsolePanel]',
                {
                    visible:
                        this.visible,
                    entries:
                        this.entries.length,
                    paused:
                        this.paused,
                    autoScroll:
                        this.autoScroll,
                    filters:
                        Array.from(
                            this.filters
                        )
                }
            );
        }
    }

    const panel =
        new SMConsolePanel();

    window.SMConsolePanel =
        panel;

    window.consolePanel =
        panel;

    /*
     * Handle a load order where TimelinePanel was already initialized before
     * consolePanel.js loaded.
     */
    const existingTimeline =
        document.getElementById(
            'timelineBody'
        );

    if (
        existingTimeline &&
        existingTimeline.querySelector(
            '.sm-timeline-pro-header'
        )
    ) {
        panel.integrateTimeline(
            existingTimeline
        );
    }
})();