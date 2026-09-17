(function () {
    'use strict';

    class LiveCapturePanel {
        constructor(
            captureSystem,
            options = {}
        ) {
            this.captureSystem =
                captureSystem ||
                window.captureSystem ||
                null;

            this.options = {
                dockId:
                    'live-capture',
                elementId:
                    'sm-live-capture-panel',
                title:
                    'Live Capture',
                ...options
            };

            this.root = null;
            this.previewVideo = null;

            this.takeManager =
                window.SMCaptureTakeManager
                    ? new window.SMCaptureTakeManager()
                    : null;

            this.captureRecorder =
                window.SMCaptureRecorder
                    ? new window.SMCaptureRecorder()
                    : null;

            this.viewportRecorder =
                window.SMViewportRecorder
                    ? new window.SMViewportRecorder({
                        canvas:
                            window.renderer?.domElement ||
                            null
                    })
                    : null;

            this.activeRecorderType =
                null;

            this._timerHandle =
                null;

            this._boundSessionState =
                null;

            this._systemUnsubscribers = [];
            this._operationPending = false;
            this._formState = null;
            this._dockObserver = null;
            this._activeSourceType = null;
            this._activePhoneMode = null;
        }

        mount(parent = null) {
            if (this.root?.isConnected) {
                return this.root;
            }

            if (this.root) {
                this._formState = this._readFormState();
                if (this.previewVideo) this.previewVideo.srcObject = null;
                this.root = null;
                this.previewVideo = null;
            }

            const dock = window.PanelDockManager;
            let root = dock?.mountPanel?.({
                id: this.options.dockId,
                title: this.options.title,
                icon: 'fas fa-video',
                elementId: this.options.elementId,
                className: 'sm-live-capture-panel',
                display: 'flex'
            }) || null;

            if (!root) {
                const host = parent || document.body;
                root = document.createElement('section');
                root.id = this.options.elementId;
                root.className = 'sm-live-capture-panel';
                root.hidden = true;
                host.appendChild(root);
            }

            root.innerHTML = `
                <div class="sm-capture-header">
                    <div class="sm-capture-brand">
                        <span class="sm-capture-brand-icon"><i class="fas fa-video"></i></span>
                        <div class="sm-capture-title">
                            <strong>${this.options.title}</strong>
                            <small>Camera · Phone · Capture Card</small>
                        </div>
                    </div>
                    <div class="sm-capture-header-actions">
                        <span class="sm-capture-live-state" data-field="live-state">OFFLINE</span>
                        <button type="button" data-action="refresh-devices" title="Refresh capture devices">↻</button>
                        <button type="button" data-action="close" title="Close">✕</button>
                    </div>
                </div>

                <div class="sm-capture-section">
                    <label>Source</label>
                    <select data-field="source-type">
                        <option value="webcam">Webcam / USB Camera</option>
                        <option value="capture-card">Capture Card</option>
                        <option value="phone">Phone Camera</option>
                    </select>
                </div>

                <div class="sm-capture-phone-setup" data-field="phone-setup" hidden>
                    <div class="sm-capture-section">
                        <label>Phone connection</label>
                        <select data-field="phone-mode">
                            <option value="uvc">USB Webcam (UVC)</option>
                            <option value="tether">SM Camera App · Wi-Fi / USB Tether</option>
                        </select>
                    </div>
                    <div class="sm-capture-phone-tether" data-field="phone-tether" hidden>
                        <div class="sm-capture-section">
                            <label>Phone address</label>
                            <input data-field="tether-url" type="text" inputmode="url" placeholder="ws://192.168.x.x:8765">
                        </div>
                        <div class="sm-capture-phone-actions">
                            <button type="button" data-action="switch-phone-camera">Switch camera</button>
                        </div>
                    </div>
                    <div class="sm-capture-phone-help" data-field="phone-help"></div>
                </div>

                <div class="sm-capture-section" data-field="device-section">
                    <label>Device</label>
                    <select data-field="device"></select>
                </div>

                <div class="sm-capture-grid">
                    <label>
                        Width
                        <input
                            data-field="width"
                            type="number"
                            min="160"
                            value="1280"
                        >
                    </label>

                    <label>
                        Height
                        <input
                            data-field="height"
                            type="number"
                            min="120"
                            value="720"
                        >
                    </label>

                    <label>
                        FPS
                        <input
                            data-field="fps"
                            type="number"
                            min="1"
                            max="120"
                            value="30"
                        >
                    </label>
                </div>

                <label class="sm-capture-check">
                    <input
                        data-field="audio"
                        type="checkbox"
                    >
                    Capture audio
                </label>

                <div class="sm-capture-actions">
                    <button
                        type="button"
                        data-action="connect"
                    >
                        Connect
                    </button>

                    <button
                        type="button"
                        data-action="disconnect"
                    >
                        Disconnect
                    </button>
                </div>

                <div
                    class="sm-capture-status"
                    data-field="status"
                >
                    Idle
                </div>

                <div class="sm-capture-preview-wrap">
                    <video
                        data-field="preview"
                        autoplay
                        muted
                        playsinline
                    ></video>
                </div>

                <div class="sm-capture-section">
                    <label>Record</label>

                    <select data-field="record-mode">
                        <option value="source">
                            Camera Source
                        </option>
                        <option value="viewport">
                            Final Viewport
                        </option>
                    </select>
                </div>

                <div class="sm-capture-actions">
                    <button
                        type="button"
                        data-action="record"
                    >
                        ● Record
                    </button>

                    <button
                        type="button"
                        data-action="stop-record"
                    >
                        ■ Stop
                    </button>
                </div>

                <div
                    class="sm-capture-time"
                    data-field="record-time"
                >
                    00:00.000
                </div>

                <div class="sm-capture-section">
                    <div class="sm-capture-subtitle">
                        Takes
                    </div>

                    <div
                        data-field="takes"
                        class="sm-capture-takes"
                    ></div>
                </div>
            `;

            this._injectStyles();

            this.root =
                root;

            this.previewVideo =
                root.querySelector(
                    '[data-field="preview"]'
                );

            this._bindUI();
            this._installDockGuard();
            this._applyFormState(this._formState);
            this._syncSourceUI();
            this._attachActivePreview();
            this._updateControls();
            this.renderTakes();
            this.refreshDevices();

            return root;
        }

        _installDockGuard() {
            if (this._dockObserver || typeof MutationObserver === 'undefined') return;
            const inspector = document.getElementById('inspector-panel');
            if (!inspector) return;
            this._dockObserver = new MutationObserver(() => {
                const manager = window.PanelDockManager;
                if (this.root?.isConnected || !manager?.state?.open?.includes(this.options.dockId)) return;
                queueMicrotask(() => {
                    if (this.root?.isConnected) return;
                    const wasActive = manager.state.active === this.options.dockId;
                    const root = this.mount();
                    if (wasActive) manager.activatePanel(this.options.dockId);
                    else if (root) root.hidden = true;
                    manager.tabs?.render?.();
                });
            });
            this._dockObserver.observe(inspector, { childList: true, subtree: true });
        }

        _injectStyles() {
            if (
                document.getElementById(
                    'sm-live-capture-panel-style'
                )
            ) {
                return;
            }

            const style =
                document.createElement(
                    'style'
                );

            style.id =
                'sm-live-capture-panel-style';

            style.textContent = `
                .sm-live-capture-panel {
                    --capture-bg: #333;
                    --capture-panel: #393939;
                    --capture-deep: #292929;
                    --capture-line: #4c4c4c;
                    --capture-muted: #969696;
                    --capture-text: #e4e4e4;
                    --capture-ready: #a8cf8b;
                    --capture-record: #df7777;
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    height: min(740px, calc(100vh - 160px));
                    min-height: 440px;
                    max-height: 740px;
                    overflow-x: hidden;
                    overflow-y: auto;
                    background: var(--capture-bg);
                    color: var(--capture-text);
                    border: 1px solid var(--capture-line);
                    border-radius: 7px;
                    box-shadow: 0 12px 30px rgba(0, 0, 0, .28);
                    font: 10px/1.4 Inter, Arial, sans-serif;
                    padding: 0 0 10px;
                    box-sizing: border-box;
                }

                #inspector-dock-content > #sm-live-capture-panel {
                    display: flex !important;
                    flex: 0 0 auto !important;
                    height: min(740px, calc(100vh - 160px)) !important;
                    min-height: 440px !important;
                    max-height: 740px !important;
                    overflow-y: auto !important;
                }

                #inspector-dock-content > #sm-live-capture-panel[hidden] {
                    display: none !important;
                }

                .sm-capture-header, .sm-capture-brand, .sm-capture-header-actions,
                .sm-capture-actions, .sm-capture-grid, .sm-capture-take-actions {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .sm-capture-header {
                    position: sticky;
                    top: 0;
                    z-index: 2;
                    min-height: 48px;
                    justify-content: space-between;
                    padding: 0 10px;
                    margin-bottom: 2px;
                    background: linear-gradient(180deg, #414141, #383838);
                    border-bottom: 1px solid var(--capture-line);
                }

                .sm-capture-brand-icon {
                    width: 27px;
                    height: 27px;
                    display: grid;
                    place-items: center;
                    border: 1px solid #656565;
                    border-radius: 6px;
                    background: #2f2f2f;
                    color: #ddd;
                }

                .sm-capture-title {
                    display: flex;
                    flex-direction: column;
                }

                .sm-capture-title strong {
                    color: #f0f0f0;
                    font-size: 10px;
                    letter-spacing: .7px;
                    text-transform: uppercase;
                }

                .sm-capture-title small {
                    color: #8d8d8d;
                    font-size: 8px;
                }

                .sm-capture-header-actions button {
                    width: 24px;
                    height: 24px;
                    min-height: 0 !important;
                    padding: 0 !important;
                    border-radius: 4px !important;
                    background: transparent !important;
                }

                .sm-capture-header-actions button:hover {
                    background: #4a4a4a !important;
                    color: #fff;
                }

                .sm-capture-live-state {
                    padding: 3px 6px;
                    border: 1px solid #535353;
                    border-radius: 10px;
                    background: #303030;
                    color: #888;
                    font-size: 7px;
                    letter-spacing: .65px;
                }

                .sm-capture-live-state[data-state="live"] { color: var(--capture-ready); border-color: #607052; }
                .sm-capture-live-state[data-state="recording"] { color: #f19a9a; border-color: #845454; animation: sm-capture-pulse 1s ease-in-out infinite; }
                .sm-capture-live-state[data-state="working"] { color: #d9ba78; }
                @keyframes sm-capture-pulse { 50% { opacity: .45; } }

                .sm-capture-section, .sm-capture-grid, .sm-capture-check, .sm-capture-actions,
                .sm-capture-status, .sm-capture-time, .sm-capture-preview-wrap {
                    margin-left: 10px;
                    margin-right: 10px;
                }

                .sm-capture-section {
                    margin-top: 8px;
                    margin-bottom: 0;
                }

                .sm-capture-phone-setup[hidden], .sm-capture-phone-tether[hidden],
                .sm-live-capture-panel [data-field="device-section"][hidden] { display: none !important; }

                .sm-capture-phone-setup {
                    margin: 8px 10px 0;
                    padding: 1px 0 8px;
                    border: 1px solid #4a4a4a;
                    border-radius: 5px;
                    background: #353535;
                }

                .sm-capture-phone-setup .sm-capture-section { margin-left: 8px; margin-right: 8px; }
                .sm-capture-phone-actions { display: flex; padding: 7px 8px 0; }
                .sm-capture-phone-actions button { width: 100%; }
                .sm-capture-phone-help {
                    margin: 7px 8px 0;
                    padding: 6px 7px;
                    border-left: 2px solid #727272;
                    background: #303030;
                    color: #a7a7a7;
                    font-size: 8px;
                    line-height: 1.5;
                }

                .sm-capture-section > label,
                .sm-capture-grid label {
                    display: flex;
                    flex-direction: column;
                    color: var(--capture-muted);
                    font-size: 8px;
                    font-weight: 700;
                    letter-spacing: .4px;
                    text-transform: uppercase;
                }

                .sm-live-capture-panel select,
                .sm-live-capture-panel input,
                .sm-live-capture-panel button {
                    min-height: 27px;
                    box-sizing: border-box;
                    border: 1px solid #505050;
                    border-radius: 4px;
                    background: var(--capture-deep);
                    color: #ddd;
                    font: 9px Inter, Arial, sans-serif;
                    outline: none;
                }

                .sm-live-capture-panel select,
                .sm-live-capture-panel input {
                    width: 100%;
                    padding: 4px 6px;
                    margin-top: 4px;
                }

                .sm-live-capture-panel select:focus,
                .sm-live-capture-panel input:focus { border-color: #747474; }

                .sm-live-capture-panel select:disabled,
                .sm-live-capture-panel input:disabled,
                .sm-live-capture-panel button:disabled { opacity: .42; cursor: default; }

                .sm-live-capture-panel button {
                    padding: 5px 10px;
                    cursor: pointer;
                    background: #414141;
                    font-weight: 700;
                    text-transform: uppercase;
                }

                .sm-capture-grid {
                    align-items: flex-end;
                    margin-top: 8px;
                }

                .sm-capture-grid label {
                    flex: 1;
                    min-width: 0;
                }

                .sm-capture-actions { margin-top: 8px; }
                .sm-capture-actions button {
                    flex: 1;
                }

                .sm-capture-actions button:not(:disabled):hover { background: #4c4c4c; }
                .sm-capture-actions [data-action="connect"] { border-color: #5c6b51; color: #b5d39d; }
                .sm-capture-actions [data-action="record"] { border-color: #755050; color: #e49a9a; }

                .sm-capture-check {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-top: 8px;
                    color: #aaa;
                    font-size: 8px;
                    letter-spacing: .3px;
                    text-transform: uppercase;
                }

                .sm-capture-check input {
                    width: auto;
                    margin: 0;
                    accent-color: #777;
                }

                .sm-capture-status,
                .sm-capture-time {
                    margin-top: 8px;
                    margin-bottom: 0;
                    padding: 6px 8px;
                    border: 1px solid #454545;
                    border-radius: 4px;
                    background: #303030;
                    color: #aaa;
                    font-size: 8px;
                }

                .sm-capture-status[data-state="live"], .sm-capture-status[data-state="ready"] { color: var(--capture-ready); }
                .sm-capture-status[data-state="error"] { color: #eca2a2; border-color: #704c4c; }
                .sm-capture-status[data-state="warning"], .sm-capture-status[data-state="working"] { color: #d9ba78; }
                .sm-capture-status[data-state="recording"] { color: var(--capture-record); }

                .sm-capture-preview-wrap {
                    aspect-ratio: 16 / 9;
                    position: relative;
                    background: #181818;
                    border: 1px solid #484848;
                    border-radius: 5px;
                    overflow: hidden;
                    margin-top: 8px;
                    margin-bottom: 0;
                }

                .sm-capture-preview-wrap:after {
                    content: 'CAPTURE PREVIEW';
                    position: absolute;
                    left: 6px;
                    bottom: 5px;
                    padding: 2px 4px;
                    border-radius: 3px;
                    background: rgba(0,0,0,.56);
                    color: #8d8d8d;
                    font-size: 7px;
                    letter-spacing: .55px;
                    pointer-events: none;
                }

                .sm-capture-preview-wrap video {
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    display: block;
                }

                .sm-capture-subtitle {
                    margin-bottom: 6px;
                    padding-top: 8px;
                    border-top: 1px solid var(--capture-line);
                    color: #aaa;
                    font-weight: 700;
                    font-size: 8px;
                    letter-spacing: .55px;
                    text-transform: uppercase;
                }

                .sm-capture-take {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 6px;
                    padding: 6px;
                    margin-bottom: 4px;
                    border: 1px solid #454545;
                    border-radius: 4px;
                    background: #363636;
                }

                .sm-capture-take-info {
                    min-width: 0;
                    flex: 1;
                }

                .sm-capture-take-name {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    color: #ddd;
                    font-size: 9px;
                }

                .sm-capture-take-meta {
                    color: #888;
                    font-size: 8px;
                }

                .sm-capture-take-actions button {
                    min-height: 23px;
                    padding: 3px 6px;
                    font-size: 7px;
                }

                .sm-capture-empty {
                    padding: 12px 8px;
                    border: 1px dashed #4b4b4b;
                    border-radius: 4px;
                    color: #777;
                    font-size: 8px;
                    text-align: center;
                }
            `;

            document.head.appendChild(
                style
            );
        }

        _field(name) {
            return this.root?.querySelector(
                `[data-field="${name}"]`
            ) || null;
        }

        _readFormState() {
            if (!this.root) return this._formState || null;
            const value = name => this._field(name)?.value;
            return {
                sourceType: value('source-type') || 'webcam',
                deviceId: value('device') || '',
                width: value('width') || '1280',
                height: value('height') || '720',
                fps: value('fps') || '30',
                audio: this._field('audio')?.checked === true,
                recordMode: value('record-mode') || 'source',
                phoneMode: value('phone-mode') || 'uvc',
                tetherUrl: value('tether-url') || ''
            };
        }

        _applyFormState(state) {
            if (!state) return;
            const setValue = (name, value) => {
                const field = this._field(name);
                if (field && value !== undefined && value !== null) field.value = String(value);
            };
            setValue('source-type', state.sourceType);
            setValue('device', state.deviceId);
            setValue('width', state.width);
            setValue('height', state.height);
            setValue('fps', state.fps);
            setValue('record-mode', state.recordMode);
            setValue('phone-mode', state.phoneMode);
            setValue('tether-url', state.tetherUrl);
            const audio = this._field('audio');
            if (audio) audio.checked = state.audio === true;
            this._syncSourceUI();
        }

        _bindUI() {
            this.root
                .querySelector(
                    '[data-action="refresh-devices"]'
                )
                ?.addEventListener(
                    'click',
                    () => this.refreshDevices(true)
                );

            this.root
                .querySelector('[data-action="close"]')
                ?.addEventListener('click', () => this.close());

            this.root
                .querySelector(
                    '[data-action="connect"]'
                )
                ?.addEventListener(
                    'click',
                    () => this.connect()
                );

            this.root
                .querySelector(
                    '[data-action="disconnect"]'
                )
                ?.addEventListener(
                    'click',
                    () => this.disconnect()
                );

            this.root
                .querySelector(
                    '[data-action="record"]'
                )
                ?.addEventListener(
                    'click',
                    () => this.startRecording()
                );

            this.root
                .querySelector(
                    '[data-action="stop-record"]'
                )
                ?.addEventListener(
                    'click',
                    () => this.stopRecording()
                );

            this._field(
                'source-type'
            )?.addEventListener(
                'change',
                () => {
                    this._syncSourceUI();
                    if (this._field('phone-mode')?.value !== 'tether' || this._field('source-type')?.value !== 'phone') {
                        this.refreshDevices();
                    }
                }
            );

            this._field('phone-mode')?.addEventListener('change', () => {
                this._syncSourceUI();
                if (this._field('phone-mode')?.value === 'uvc') this.refreshDevices(true);
            });

            this._field('tether-url')?.addEventListener('change', () => {
                this._formState = this._readFormState();
            });

            this.root.querySelector('[data-action="switch-phone-camera"]')?.addEventListener('click', () => {
                const switched = window.smUSBPhoneBridge?.switchPhoneCamera?.();
                this._setStatus(switched ? 'Phone camera switch requested' : 'Phone control channel is not connected', switched ? 'ready' : 'warning');
            });

            this._field('record-mode')?.addEventListener(
                'change',
                () => this._updateControls()
            );
        }

        _syncSourceUI() {
            if (!this.root) return;
            const sourceType = this._field('source-type')?.value || 'webcam';
            const phoneMode = this._field('phone-mode')?.value || 'uvc';
            const isPhone = sourceType === 'phone';
            const tether = isPhone && phoneMode === 'tether';
            const phoneSetup = this._field('phone-setup');
            const tetherSetup = this._field('phone-tether');
            const deviceSection = this._field('device-section');
            if (phoneSetup) phoneSetup.hidden = !isPhone;
            if (tetherSetup) tetherSetup.hidden = !tether;
            if (deviceSection) deviceSection.hidden = tether;

            const help = this._field('phone-help');
            if (help) {
                help.textContent = tether
                    ? 'Open SM Virtual Camera, paste its ws:// address, then use Scene View to monitor and drive the 3D camera or Phone Lens to stream the physical camera.'
                    : 'Connect the phone by USB, enable USB Webcam in Android USB settings, then press Refresh and choose the phone camera.';
            }
            const connectButton = this.root.querySelector('[data-action="connect"]');
            if (connectButton) connectButton.textContent = isPhone ? 'Connect phone' : 'Connect';
            this._formState = this._readFormState();
            this._updateControls();
        }

        _normalizeTetherUrl(value) {
            let url = String(value || '').trim();
            if (!url) throw new Error('Enter the ws:// address displayed by the SM Camera Android app.');
            if (!/^wss?:\/\//i.test(url)) url = `ws://${url}`;
            const parsed = new URL(url);
            if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
                throw new Error('Phone address must start with ws:// or wss://.');
            }
            if (!parsed.port) parsed.port = '8765';
            return parsed.toString().replace(/\/$/, '');
        }

        async _ensurePhoneBridge(system) {
            let bridge = window.smUSBPhoneBridge || null;
            if (!bridge && typeof window.initSMUSBPhoneBridge === 'function') {
                bridge = await window.initSMUSBPhoneBridge({
                    captureSystem: system,
                    camera: window.camera || null
                });
            }
            if (!bridge?.connect) throw new Error('SM Phone Bridge is not loaded.');
            bridge.setCaptureSystem?.(system);
            return bridge;
        }

        async _ensureSystem() {
            const globalSystem = window.captureSystem || window.smCaptureSystem || null;
            if (globalSystem && globalSystem !== this.captureSystem) this.captureSystem = globalSystem;
            if (this.captureSystem?.refreshDevices && this.captureSystem?.deviceManager) {
                this._subscribeSystem(this.captureSystem);
                return this.captureSystem;
            }

            if (window.smCaptureInitPromise) {
                try {
                    await window.smCaptureInitPromise;
                } catch (_) {}
            }

            this.captureSystem = window.captureSystem || window.smCaptureSystem || null;
            if (!this.captureSystem && typeof window.initCaptureSystem === 'function') {
                this.captureSystem = await window.initCaptureSystem({ autoRefreshDevices: true });
            }
            if (this.captureSystem) this._subscribeSystem(this.captureSystem);
            return this.captureSystem;
        }

        _subscribeSystem(system) {
            if (!system || this._subscribedSystem === system) return;
            this._systemUnsubscribers.splice(0).forEach(unsubscribe => unsubscribe?.());
            this._subscribedSystem = system;
            const sync = () => {
                this._attachActivePreview();
                this._updateControls();
            };
            ['sessionstarted', 'sessionstopped', 'sessionremoved', 'sessionstatechange', 'sessionerror']
                .forEach(event => this._systemUnsubscribers.push(system.on?.(event, sync)));
        }

        _attachActivePreview() {
            const stream = this.captureSystem?.activeSession?.stream || null;
            if (!this.previewVideo) return;
            if (this.previewVideo.srcObject !== stream) this.previewVideo.srcObject = stream;
            if (stream) this.previewVideo.play?.().catch(() => {});
        }

        _setOperationPending(value) {
            this._operationPending = value === true;
            this._updateControls();
        }

        _updateControls() {
            if (!this.root) return;
            const activeSession = this.captureSystem?.activeSession || null;
            const connected = activeSession?.isActive?.() === true;
            const recording = !!this.activeRecorderType;
            const recordMode = this._field('record-mode')?.value || 'source';
            const setDisabled = (action, disabled) => {
                const button = this.root.querySelector(`[data-action="${action}"]`);
                if (button) button.disabled = disabled;
            };
            setDisabled('refresh-devices', this._operationPending || recording);
            setDisabled('connect', this._operationPending || connected || recording);
            setDisabled('disconnect', this._operationPending || (!activeSession && !recording));
            setDisabled('record', this._operationPending || recording || (recordMode === 'source' && !connected));
            setDisabled('stop-record', this._operationPending || !recording);

            ['source-type', 'phone-mode', 'tether-url', 'device', 'width', 'height', 'fps', 'audio'].forEach(name => {
                const field = this._field(name);
                if (field) field.disabled = this._operationPending || connected || recording;
            });
            const switchPhone = this.root.querySelector('[data-action="switch-phone-camera"]');
            if (switchPhone) {
                switchPhone.disabled = this._operationPending || this._activeSourceType !== 'phone' || this._activePhoneMode !== 'tether' || !connected;
            }
            const liveState = this._field('live-state');
            if (liveState) {
                liveState.textContent = recording ? 'RECORDING' : connected ? 'LIVE' : this._operationPending ? 'WORKING' : 'OFFLINE';
                liveState.dataset.state = recording ? 'recording' : connected ? 'live' : this._operationPending ? 'working' : 'offline';
            }
        }

        _setStatus(text, state = '') {
            const el =
                this._field('status');

            if (el) {
                el.textContent =
                    String(text);
                el.dataset.state = state;
            }
        }

        async refreshDevices(
            requestPermission = false
        ) {
            if (this._deviceRefreshPromise) return this._deviceRefreshPromise;
            this._deviceRefreshPromise = (async () => {
                this._setOperationPending(true);
                try {
                    const system = await this._ensureSystem();
                    if (!system?.refreshDevices) throw new Error('Capture System is not initialized.');
                    this._setStatus(requestPermission ? 'Requesting camera permission…' : 'Scanning capture devices…', 'working');
                    const snapshot = await system.refreshDevices({
                        requestPermission,
                        audio: this._field('audio')?.checked === true
                    });
                    const select = this._field('device');
                    if (!select) return snapshot;

                    const previousId = this._formState?.deviceId || select.value || '';
                    const sourceType = this._field('source-type')?.value || 'webcam';
                    const allCameras = snapshot.cameras || [];
                    const captureCards = sourceType === 'capture-card'
                        ? system.deviceManager?.findCaptureCardCandidates?.() || []
                        : [];
                    const cameras = sourceType === 'capture-card' && captureCards.length
                        ? captureCards
                        : allCameras;

                    select.replaceChildren();
                    if (!cameras.length) {
                        const option = document.createElement('option');
                        option.value = '';
                        option.textContent = 'No camera device found';
                        select.appendChild(option);
                    } else {
                        cameras.forEach(device => {
                            const option = document.createElement('option');
                            option.value = device.deviceId;
                            option.textContent = device.label;
                            select.appendChild(option);
                        });
                        if (cameras.some(device => device.deviceId === previousId)) select.value = previousId;
                    }
                    this._formState = this._readFormState();
                    this._setStatus(
                        cameras.length
                            ? `${cameras.length} ${sourceType === 'capture-card' ? 'capture card' : 'camera'} source${cameras.length === 1 ? '' : 's'} ready`
                            : 'No camera found · press refresh to grant permission',
                        cameras.length ? 'ready' : 'warning'
                    );
                    return snapshot;
                } catch (error) {
                    console.error('[LiveCapturePanel] refreshDevices failed:', error);
                    this._setStatus(`Device error: ${error.message}`, 'error');
                    return null;
                } finally {
                    this._deviceRefreshPromise = null;
                    this._setOperationPending(false);
                }
            })();
            return this._deviceRefreshPromise;
        }

        async connect() {
            if (this._operationPending) return null;
            if (this.activeRecorderType) {
                this._setStatus('Stop the current recording before changing the source.', 'warning');
                return null;
            }

            const sourceType =
                this._field(
                    'source-type'
                )?.value ||
                'webcam';

            const phoneMode =
                this._field('phone-mode')?.value ||
                'uvc';

            const deviceId =
                this._field(
                    'device'
                )?.value ||
                null;

            const width =
                Math.max(160, Math.min(7680, Number(
                    this._field(
                        'width'
                    )?.value
                ) || 1280));

            const height =
                Math.max(120, Math.min(4320, Number(
                    this._field(
                        'height'
                    )?.value
                ) || 720));

            const frameRate =
                Math.max(1, Math.min(120, Number(
                    this._field(
                        'fps'
                    )?.value
                ) || 30));

            const audio =
                !!this._field(
                    'audio'
                )?.checked;

            this._setOperationPending(true);
            this._setStatus(sourceType === 'phone' ? 'Connecting phone camera…' : 'Connecting camera…', 'working');

            let phoneBridge = null;
            let system = null;
            try {
                system = await this._ensureSystem();
                if (!system) throw new Error('Capture System is not initialized.');
                let session = null;

                if (
                    sourceType ===
                    'capture-card'
                ) {
                    session =
                        await system
                            .startCaptureCard({
                                deviceId,
                                width,
                                height,
                                frameRate,
                                audio
                            });
                } else if (
                    sourceType ===
                    'phone'
                ) {
                    phoneBridge = await this._ensurePhoneBridge(system);
                    if (phoneBridge.state === 'connected') await phoneBridge.disconnect();
                    if (phoneMode === 'tether') {
                        const url = this._normalizeTetherUrl(this._field('tether-url')?.value);
                        this._field('tether-url').value = url;
                        const connectPromise = phoneBridge.connect({
                            mode: 'tether',
                            url,
                            width,
                            height,
                            frameRate,
                            audio,
                            reconnect: true,
                            stopPrevious: true
                        });
                        // If the UI timeout wins, consume a later bridge
                        // rejection so Chromium does not report an unhandled
                        // promise while cleanup is running.
                        connectPromise.catch(() => {});

                        // Keep the panel responsive even if a browser/WebSocket
                        // implementation never settles its promise. The bridge
                        // has its own socket timeout; this is the UI safety net.
                        let timeoutId = null;
                        try {
                            session = await Promise.race([
                                connectPromise,
                                new Promise((_, reject) => {
                                    timeoutId = setTimeout(() => {
                                        reject(new Error(
                                            'Phone connection timed out. Check the address and make sure SM Camera is open on the same Wi‑Fi or USB-tether network.'
                                        ));
                                    }, 12000);
                                })
                            ]);
                        } finally {
                            clearTimeout(timeoutId);
                        }
                    } else {
                        session = await phoneBridge.connect({
                            mode: 'uvc',
                            deviceId,
                            width,
                            height,
                            frameRate,
                            audio,
                            requestPermission: true,
                            stopPrevious: true
                        });
                    }
                } else {
                    session =
                        await system
                            .startWebCamera({
                                deviceId,
                                width,
                                height,
                                frameRate,
                                audio
                            });
                }

                this._attachActivePreview();
                const settings = session.getSettings?.().video || {};
                if (settings.width) this._field('width').value = settings.width;
                if (settings.height) this._field('height').value = settings.height;
                if (settings.frameRate) this._field('fps').value = Math.round(settings.frameRate);
                this._formState = this._readFormState();
                this._activeSourceType = sourceType;
                this._activePhoneMode = sourceType === 'phone' ? phoneMode : null;
                const dimensions = settings.width && settings.height
                    ? ` · ${settings.width}×${settings.height}${settings.frameRate ? ` @ ${Math.round(settings.frameRate)} FPS` : ''}`
                    : '';
                const sourceLabel = sourceType === 'phone'
                    ? `phone · ${phoneMode === 'tether' ? 'SM Camera App' : 'USB Webcam'}`
                    : sourceType;
                this._setStatus(`Connected · ${sourceLabel}${dimensions}`, 'live');
                return session;
            } catch (error) {
                console.error(
                    '[LiveCapturePanel] connect failed:',
                    error
                );

                if (phoneBridge) {
                    const failedSession = phoneBridge.session || null;
                    try { await phoneBridge.disconnect?.(); } catch (_) {}
                    if (failedSession && system?.getSession?.(failedSession.id)) {
                        await system.removeSession(failedSession).catch(() => {});
                    }
                }
                this._activeSourceType = null;
                this._activePhoneMode = null;
                this._setStatus(`Connection failed: ${error.message}`, 'error');
                return null;
            } finally {
                this._setOperationPending(false);
            }
        }

        async disconnect() {
            if (this._operationPending) return false;
            this._setOperationPending(true);
            try {
                if (this.activeRecorderType) await this.stopRecording();
                const system = await this._ensureSystem();
                const activeSession = system?.activeSession || null;
                if (this._activeSourceType === 'phone' && window.smUSBPhoneBridge) {
                    const bridgeSession = window.smUSBPhoneBridge.session || activeSession;
                    await window.smUSBPhoneBridge.disconnect();
                    if (bridgeSession && system?.getSession?.(bridgeSession.id)) {
                        await system.removeSession(bridgeSession);
                    }
                } else if (activeSession) {
                    await system.removeSession(activeSession);
                }

                if (
                    this.previewVideo
                ) {
                    this.previewVideo.srcObject =
                        null;
                }

                this._setStatus('Disconnected', 'ready');
                this._activeSourceType = null;
                this._activePhoneMode = null;
                return true;
            } catch (error) {
                this._setStatus(`Disconnect failed: ${error.message}`, 'error');
                return false;
            } finally {
                this._setOperationPending(false);
            }
        }

        async startRecording() {
            if (this._operationPending || this.activeRecorderType) return null;
            const mode =
                this._field(
                    'record-mode'
                )?.value ||
                'source';

            this._setOperationPending(true);
            this._setStatus('Starting recorder…', 'working');
            try {
                if (
                    mode === 'viewport'
                ) {
                    if (!this.viewportRecorder) {
                        throw new Error(
                            'SMViewportRecorder is not loaded.'
                        );
                    }

                    const session =
                        this.captureSystem
                            ?.activeSession;

                    await this.viewportRecorder.start({
                        fps: Math.max(1, Math.min(120, Number(this._field('fps')?.value) || 30)),
                        audioStream:
                            session?.stream ||
                            null,
                        includeAudio:
                            !!this._field(
                                'audio'
                            )?.checked
                    });

                    this.activeRecorderType =
                        'viewport';
                } else {
                    const session =
                        this.captureSystem
                            ?.activeSession;

                    if (!session?.stream) {
                        throw new Error(
                            'Connect a camera source first.'
                        );
                    }

                    if (!this.captureRecorder) {
                        throw new Error(
                            'SMCaptureRecorder is not loaded.'
                        );
                    }

                    this.captureRecorder
                        .bindSession(
                            session
                        );

                    await this.captureRecorder
                        .start();

                    this.activeRecorderType =
                        'source';
                }

                this._startTimer();
                this._setStatus(`Recording ${mode === 'viewport' ? 'viewport' : 'camera source'}…`, 'recording');
                this._updateControls();
                return true;
            } catch (error) {
                console.error(
                    '[LiveCapturePanel] startRecording failed:',
                    error
                );

                this.activeRecorderType = null;
                this._setStatus(`Record failed: ${error.message}`, 'error');
                return false;
            } finally {
                this._setOperationPending(false);
            }
        }

        async stopRecording() {
            if (!this.activeRecorderType) {
                return null;
            }

            this._setStatus('Finalizing take…', 'working');
            try {
                let result = null;

                if (
                    this.activeRecorderType ===
                    'viewport'
                ) {
                    result =
                        await this.viewportRecorder
                            ?.stop?.();
                } else {
                    result =
                        await this.captureRecorder
                            ?.stop?.();
                }

                this._stopTimer();

                if (
                    result?.blob &&
                    this.takeManager
                ) {
                    this.takeManager.addTake(
                        result,
                        {
                            sourceType:
                                this.activeRecorderType
                        }
                    );
                }

                this.activeRecorderType =
                    null;

                this.renderTakes();

                this._setStatus(
                    result?.blob ? 'Take ready · use Save to export' : 'Recording stopped',
                    result?.blob ? 'ready' : 'warning'
                );
                this._updateControls();
                return result;
            } catch (error) {
                console.error(
                    '[LiveCapturePanel] stopRecording failed:',
                    error
                );

                this._setStatus(`Stop failed: ${error.message}`, 'error');
                return null;
            } finally {
                this.activeRecorderType = null;
                this._stopTimer();
                this._updateControls();
            }
        }

        _startTimer() {
            this._stopTimer();

            this._timerHandle =
                setInterval(() => {
                    const recorder =
                        this.activeRecorderType ===
                        'viewport'
                            ? this.viewportRecorder
                            : this.captureRecorder;

                    const seconds =
                        recorder
                            ?.getElapsedTime?.() ||
                        0;

                    const timeEl =
                        this._field(
                            'record-time'
                        );

                    if (
                        timeEl &&
                        this.takeManager
                    ) {
                        timeEl.textContent =
                            this.takeManager
                                .formatDuration(
                                    seconds
                                );
                    }
                }, 100);
        }

        _stopTimer() {
            if (this._timerHandle) {
                clearInterval(
                    this._timerHandle
                );

                this._timerHandle =
                    null;
            }
        }

        renderTakes() {
            const host =
                this._field(
                    'takes'
                );

            if (
                !host ||
                !this.takeManager
            ) {
                return;
            }

            host.innerHTML = '';

            const takes =
                this.takeManager
                    .getTakes()
                    .slice()
                    .reverse();

            if (!takes.length) {
                const empty = document.createElement('div');
                empty.className = 'sm-capture-empty';
                empty.textContent = 'Recorded takes will appear here.';
                host.appendChild(empty);
                return;
            }

            for (const take of takes) {
                const row =
                    document.createElement(
                        'div'
                    );

                row.className =
                    'sm-capture-take';

                row.innerHTML = `
                    <div class="sm-capture-take-info">
                        <div class="sm-capture-take-name"></div>
                        <div class="sm-capture-take-meta"></div>
                    </div>
                    <div class="sm-capture-take-actions">
                        <button type="button" data-download>Save</button>
                        <button type="button" data-remove title="Remove take">×</button>
                    </div>
                `;

                row.querySelector('.sm-capture-take-name').textContent = take.name;
                row.querySelector('.sm-capture-take-meta').textContent =
                    `${this.takeManager.formatDuration(take.duration)} · ${(take.size / 1024 / 1024).toFixed(2)} MB`;

                row.querySelector(
                    '[data-download]'
                )?.addEventListener(
                    'click',
                    () => {
                        this.takeManager
                            .downloadTake(
                                take.id
                            );
                    }
                );

                row.querySelector('[data-remove]')?.addEventListener('click', () => {
                    this.takeManager.removeTake(take.id);
                    this.renderTakes();
                });

                host.appendChild(
                    row
                );
            }
        }

        open() {
            const root = this.mount();
            window.setInspectorCollapsed?.(false);
            const docked = window.PanelDockManager?.openPanel?.(this.options.dockId);
            if (docked) this.root = docked;
            else if (root) {
                root.hidden = false;
                root.style.display = 'flex';
            }
            this._attachActivePreview();
            this._updateControls();
            return this.root;
        }

        close() {
            if (window.PanelDockManager?.registry?.get?.(this.options.dockId)) {
                window.PanelDockManager.closePanel(this.options.dockId);
            } else if (this.root) {
                this.root.hidden = true;
                this.root.style.display = 'none';
            }
        }

        async destroy() {
            this._stopTimer();

            try {
                await this.disconnect();
            } catch (_) {}

            this.captureRecorder
                ?.destroy?.();

            this.viewportRecorder
                ?.destroy?.();

            this.takeManager
                ?.destroy?.();

            this._systemUnsubscribers.splice(0).forEach(unsubscribe => unsubscribe?.());
            this._subscribedSystem = null;
            this._dockObserver?.disconnect?.();
            this._dockObserver = null;

            this.captureRecorder = null;
            this.viewportRecorder = null;
            this.takeManager = null;

            this.close();
            this.root?.remove?.();
            this.root = null;
            this.previewVideo = null;
        }
    }

    window.LiveCapturePanel =
        LiveCapturePanel;

    window.openLiveCapturePanel =
        function () {
            if (!window.liveCapturePanel) {
                window.liveCapturePanel =
                    new window.LiveCapturePanel(
                        window.captureSystem
                    );

            }

            window.liveCapturePanel.open();

            return window.liveCapturePanel;
        };

    window.closeLiveCapturePanel = function () {
        window.liveCapturePanel?.close?.();
    };

    if (!window.__smLiveCaptureDockStateBound) {
        window.__smLiveCaptureDockStateBound = true;
        window.addEventListener('sm:panel-dock-changed', event => {
            const active = event.detail?.inspector?.active === 'live-capture';
            document.getElementById('live-capture-btn')?.classList.toggle('active', active);
        });
    }
})();
