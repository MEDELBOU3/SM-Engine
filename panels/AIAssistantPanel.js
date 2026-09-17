(function () {
    'use strict';

    const PANEL_ID = 'ai-assistant';

    window.AIAssistantPanel = {
        initialized: false,
        busy: false,
        pendingPrompts: [],
        messages: [],

        init() {
            // InspectorPanel can rebuild its innerHTML when the selection or
            // workspace changes. That removes docked DOM nodes while the JS
            // singleton remains initialized, so always remount a detached
            // panel before opening it again.
            if (this.initialized && this.element?.isConnected) return this.element;
            const element = window.PanelDockManager?.mountPanel?.({
                id: PANEL_ID,
                title: 'AI Assistant',
                icon: 'fas fa-wand-magic-sparkles',
                elementId: 'ai-assistant-panel',
                className: 'sm-ai-panel',
                display: 'flex'
            });
            if (!element) return null;
            this.element = element;
            this._injectStyles();
            this._render();
            this._bind();
            this._setBusy(this.busy);
            this.initialized = true;
            return element;
        },

        _render() {
            const service = window.smAIService;
            const hasKey = !!service?.getAPIKey?.();
            const directBuild = window.smAIPermissionPolicy?.autoApproveMutations !== false;
            this.element.innerHTML = `
                <header class="sm-ai-header">
                    <div class="sm-ai-brand"><span class="sm-ai-mark">AI</span><div><strong>ASSISTANT</strong><small>Gemini · Scene Agent</small></div></div>
                    <div class="sm-ai-header-actions"><span class="sm-ai-run-state is-ready" id="sm-ai-run-state">READY</span><button type="button" data-ai-action="close" title="Close">✕</button></div>
                </header>
                <section class="sm-ai-config">
                    <div class="sm-ai-section-title"><span>CONNECTION</span><span class="sm-ai-model-pill">3.5 FLASH-LITE</span></div>
                    <label><span>API KEY</span><input id="sm-ai-api-key" type="password" autocomplete="off" placeholder="AIza..." value=""></label>
                    <div class="sm-ai-config-row">
                        <select id="sm-ai-model" title="Gemini model">
                            <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite</option>
                        </select>
                        <button type="button" data-ai-action="save-key">SAVE</button>
                    </div>
                    <div class="sm-ai-config-options">
                        <label class="sm-ai-check"><input id="sm-ai-remember-key" type="checkbox"><span>Remember key</span></label>
                        <label class="sm-ai-direct ${directBuild ? 'is-on' : ''}"><input id="sm-ai-auto-approve" type="checkbox" ${directBuild ? 'checked' : ''}><span class="sm-ai-switch" aria-hidden="true"></span><span><strong>DIRECT BUILD</strong><small>Edit without confirmation alerts</small></span></label>
                    </div>
                    <div class="sm-ai-key-status ${hasKey ? 'is-ready' : ''}" id="sm-ai-key-status">${hasKey ? 'API key configured' : 'API key required'}</div>
                </section>
                <section class="sm-ai-context"><span class="sm-ai-context-dot"></span><span id="sm-ai-context">No object selected</span></section>
                <section class="sm-ai-quick">
                    <button type="button" data-ai-prompt="Describe the selected object and suggest improvements."><b>◎</b><span>INSPECT</span></button>
                    <button type="button" data-ai-prompt="Create a cube named AI_Block at position 0, 0.5, 0."><b>＋</b><span>CREATE</span></button>
                    <button type="button" data-ai-prompt="Make the selected object's material realistic with balanced roughness and metalness."><b>◆</b><span>MATERIAL</span></button>
                    <button type="button" data-ai-prompt="Analyze the current scene lighting and suggest or apply a balanced setup."><b>☼</b><span>LIGHTING</span></button>
                    <button type="button" data-ai-prompt="Create and apply a realistic grassland procedural texture to the current terrain."><b>≋</b><span>TERRAIN</span></button>
                </section>
                <section class="sm-ai-messages" id="sm-ai-messages" aria-live="polite">
                    <div class="sm-ai-message assistant">Direct Build is ready. Tell me what to create or change and I will execute the scene tools directly.</div>
                </section>
                <footer class="sm-ai-composer">
                    <div class="sm-ai-composer-box">
                        <textarea id="sm-ai-input" rows="3" placeholder="Build something in the current scene…"></textarea>
                        <button type="button" class="primary" data-ai-action="send" title="Send">➜</button>
                    </div>
                    <div class="sm-ai-composer-meta">
                        <span>Enter to send · Shift+Enter for line break</span>
                        <button type="button" data-ai-action="clear">CLEAR CHAT</button>
                    </div>
                </footer>`;
            const model = this.element.querySelector('#sm-ai-model');
            if (model) model.value = service?.model || window.SM_AI_DEFAULT_MODEL || 'gemini-3.5-flash-lite';
            this._restoreMessages();
            this._syncContext();
        },

        _bind() {
            const root = this.element;
            if (root.dataset.aiPanelBound === 'true') return;
            root.dataset.aiPanelBound = 'true';
            root.addEventListener('click', (event) => {
                const action = event.target.closest('[data-ai-action]')?.dataset.aiAction;
                const prompt = event.target.closest('[data-ai-prompt]')?.dataset.aiPrompt;
                if (prompt) {
                    root.querySelector('#sm-ai-input').value = prompt;
                    this.send();
                    return;
                }
                if (action === 'close') this.close();
                if (action === 'send') this.send();
                if (action === 'clear') this.clear();
                if (action === 'save-key') this._saveSettings(true);
            });
            root.querySelector('#sm-ai-input')?.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    this.send();
                }
            });
            root.querySelector('#sm-ai-model')?.addEventListener('change', () => this._saveSettings(false));
            root.querySelector('#sm-ai-auto-approve')?.addEventListener('change', (event) => {
                window.smAIPermissionPolicy?.setAutoApproveMutations?.(event.target.checked);
                root.querySelector('.sm-ai-direct')?.classList.toggle('is-on', event.target.checked);
                this._append('system', event.target.checked
                    ? 'Direct Build enabled. Normal scene edits run without confirmation.'
                    : 'Direct Build disabled. Scene edits will ask for confirmation.');
            });
            if (!this._globalEventsBound) {
                this._globalEventsBound = true;
                window.addEventListener('sm:selection-changed', () => this._syncContext());
                window.addEventListener('objectSelected', () => this._syncContext());
                window.addEventListener('sm:ai-tool-start', (event) => {
                    this._setHeaderStatus(`RUNNING ${String(event.detail?.name || '').replaceAll('_', ' ')}`, 'busy');
                });
                window.addEventListener('sm:ai-tool-complete', () => {
                    this._syncContext();
                    if (this.busy) this._setHeaderStatus('BUILDING', 'busy');
                });
            }
        },

        _saveSettings(showMessage) {
            const key = this.element.querySelector('#sm-ai-api-key')?.value || '';
            const remember = this.element.querySelector('#sm-ai-remember-key')?.checked === true;
            const model = this.element.querySelector('#sm-ai-model')?.value;
            if (key) window.smAIService?.setAPIKey?.(key, { remember });
            if (model) window.smAIService?.setModel?.(model);
            const directBuild = this.element.querySelector('#sm-ai-auto-approve')?.checked !== false;
            window.smAIPermissionPolicy?.setAutoApproveMutations?.(directBuild);
            const configured = !!window.smAIService?.getAPIKey?.();
            const status = this.element.querySelector('#sm-ai-key-status');
            status?.classList.toggle('is-ready', configured);
            if (status) status.textContent = configured ? 'API key configured' : 'API key required';
            if (showMessage) this._append('system', configured ? 'Gemini settings saved locally.' : 'Enter an API key first.');
            return configured;
        },

        _syncContext() {
            if (!this.element?.isConnected) {
                const manager = window.PanelDockManager;
                if (manager?.state?.open?.includes(PANEL_ID)) {
                    this.initialized = false;
                    this.init();
                    manager.tabs?.render?.();
                    if (manager.state.active === PANEL_ID) manager.activatePanel(PANEL_ID);
                }
            }
            const object = window.selectedObject;
            const context = this.element?.querySelector('#sm-ai-context');
            if (!context) return;
            context.textContent = object
                ? `SELECTED  ${object.name || object.type}  ·  ${object.type}`
                : `SCENE  ${window.scene?.children?.length || 0} root objects  ·  no selection`;
        },

        _setHeaderStatus(text, state = 'ready') {
            const status = this.element?.querySelector('#sm-ai-run-state');
            if (!status) return;
            status.textContent = String(text || 'READY').toUpperCase();
            status.classList.toggle('is-busy', state === 'busy');
            status.classList.toggle('is-ready', state !== 'busy');
        },

        _append(role, text, toolResults = []) {
            const entry = {
                role: String(role || 'assistant'),
                text: String(text || ''),
                toolResults: Array.isArray(toolResults) ? toolResults : []
            };
            this.messages.push(entry);
            this._renderMessage(entry);
        },

        _renderMessage(entry) {
            const list = this.element.querySelector('#sm-ai-messages');
            if (!list) return;
            const message = document.createElement('div');
            message.className = `sm-ai-message ${entry.role}`;
            message.textContent = entry.text;
            list.appendChild(message);
            entry.toolResults.forEach((item) => {
                const chip = document.createElement('div');
                chip.className = `sm-ai-tool ${item.result?.ok ? 'is-ok' : 'is-error'}`;
                chip.textContent = `${item.result?.ok ? '✓' : '×'} ${item.name}`;
                list.appendChild(chip);
            });
            list.scrollTop = list.scrollHeight;
        },

        _restoreMessages() {
            if (!this.messages.length) return;
            const list = this.element.querySelector('#sm-ai-messages');
            if (!list) return;
            list.replaceChildren();
            this.messages.forEach((entry) => this._renderMessage(entry));
        },

        _setBusy(value) {
            this.busy = value === true;
            const send = this.element.querySelector('[data-ai-action="send"]');
            const input = this.element.querySelector('#sm-ai-input');
            if (send) {
                send.disabled = false;
                send.textContent = this.busy ? '+' : '➜';
                send.title = this.busy ? 'Queue this message' : 'Send';
            }
            if (input) {
                input.disabled = false;
                input.placeholder = this.busy
                    ? 'Add the next instruction to the build queue…'
                    : 'Build something in the current scene…';
            }
            this._setHeaderStatus(this.busy ? 'BUILDING' : 'READY', this.busy ? 'busy' : 'ready');
        },

        async send() {
            const input = this.element.querySelector('#sm-ai-input');
            const prompt = String(input?.value || '').trim();
            if (!prompt) return;
            if (!this._saveSettings(false)) {
                this._append('error', 'Add a Gemini API key, then press Save.');
                return;
            }
            input.value = '';
            this._append('user', prompt);
            if (this.busy) {
                this.pendingPrompts.push(prompt);
                this._append('system', `Queued · ${this.pendingPrompts.length} message${this.pendingPrompts.length === 1 ? '' : 's'} waiting`);
                input?.focus();
                return;
            }
            await this._runPrompt(prompt);
        },

        async _runPrompt(prompt) {
            this._setBusy(true);
            try {
                const result = await window.smAIService.sendMessage(prompt, {
                    requestPermission: async ({ message }) => window.confirm(message)
                });
                this._append('assistant', result.text, result.toolResults);
                this._syncContext();
            } catch (error) {
                this._append('error', error?.message || String(error));
            } finally {
                this._setBusy(false);
                this.element?.querySelector('#sm-ai-input')?.focus();
                const nextPrompt = this.pendingPrompts.shift();
                if (nextPrompt) {
                    queueMicrotask(() => this._runPrompt(nextPrompt));
                }
            }
        },

        clear() {
            window.smAIService?.clearConversation?.();
            this.pendingPrompts.length = 0;
            this.messages.length = 0;
            const list = this.element.querySelector('#sm-ai-messages');
            if (list) list.innerHTML = '<div class="sm-ai-message assistant">Chat cleared. I still have live access to the current scene context.</div>';
        },

        open() {
            const element = this.init();
            if (!element) return null;
            window.setInspectorCollapsed?.(false);
            window.PanelDockManager?.openPanel?.(PANEL_ID);
            setTimeout(() => this.element?.querySelector('#sm-ai-input')?.focus(), 0);
            return element;
        },

        close() { window.PanelDockManager?.closePanel?.(PANEL_ID); },

        _injectStyles() {
            if (document.getElementById('sm-ai-panel-styles')) return;

            const style = document.createElement('style');
            style.id = 'sm-ai-panel-styles';

            style.textContent = `
        /* =========================================================
           SM ENGINE AI ASSISTANT
           Dark Graphite / Indigo / Cyan theme
        ========================================================= */

        .sm-ai-panel {
            --ai-bg: #111318;
            --ai-panel: #171a21;
            --ai-panel-2: #1b1f28;
            --ai-panel-3: #202530;
            --ai-deep: #0d0f14;

            --ai-line: #2a303b;
            --ai-line-soft: #222731;

            --ai-text: #e8ebf2;
            --ai-text-soft: #c1c7d2;
            --ai-muted: #747d8d;
            --ai-muted-2: #596170;

            --ai-accent: #8b7cff;
            --ai-accent-strong: #a99fff;
            --ai-accent-soft: rgba(139,124,255,.12);

            --ai-cyan: #54d6e8;
            --ai-cyan-soft: rgba(84,214,232,.10);

            --ai-green: #72d49a;
            --ai-green-soft: rgba(114,212,154,.10);

            --ai-orange: #e9b86b;
            --ai-red: #ed7d88;

            height: min(760px, calc(100vh - 150px));
            min-height: 460px;

            display: flex;
            flex-direction: column;

            background:
                linear-gradient(
                    180deg,
                    #151820 0%,
                    var(--ai-bg) 100%
                );

            color: var(--ai-text);

            border: 1px solid var(--ai-line);
            box-shadow:
                0 14px 38px rgba(0,0,0,.38),
                inset 0 1px rgba(255,255,255,.015);

            font:
                11px/1.45
                Inter,
                "Segoe UI",
                Arial,
                sans-serif;

            overflow: hidden;

            color-scheme: dark;
        }


        /* =========================================================
           INSPECTOR DOCK
        ========================================================= */

        #inspector-dock-content > #ai-assistant-panel {
            display: flex !important;
            flex: 0 0 auto !important;

            height: min(760px, calc(100vh - 150px)) !important;
            min-height: 460px !important;
            max-height: 760px !important;

            overflow: hidden !important;
        }

        #inspector-dock-content > #ai-assistant-panel[hidden] {
            display: none !important;
        }


        /* =========================================================
           HEADER
        ========================================================= */

        .sm-ai-header {
            position: relative;

            min-height: 53px;

            display: flex;
            align-items: center;
            justify-content: space-between;

            padding: 0 12px;

            background:
                linear-gradient(
                    180deg,
                    #20242d 0%,
                    #191c23 100%
                );

            border-bottom: 1px solid var(--ai-line);
        }

        .sm-ai-header::after {
            content: "";

            position: absolute;
            left: 0;
            right: 0;
            bottom: -1px;

            height: 1px;

            background:
                linear-gradient(
                    90deg,
                    transparent,
                    rgba(139,124,255,.55),
                    rgba(84,214,232,.24),
                    transparent
                );

            pointer-events: none;
        }

        .sm-ai-brand,
        .sm-ai-header-actions {
            display: flex;
            align-items: center;
            gap: 9px;
        }

        .sm-ai-mark {
            position: relative;

            width: 29px;
            height: 29px;

            display: grid;
            place-items: center;

            border: 1px solid rgba(139,124,255,.52);
            border-radius: 5px;

            background:
                linear-gradient(
                    145deg,
                    rgba(139,124,255,.22),
                    rgba(84,214,232,.06)
                ),
                #171a21;

            color: #c8c1ff;

            font-size: 10px;
            font-weight: 800;
            letter-spacing: .8px;

            box-shadow:
                inset 0 1px rgba(255,255,255,.05),
                0 0 14px rgba(139,124,255,.08);
        }

        .sm-ai-mark::after {
            content: "";

            position: absolute;
            width: 4px;
            height: 4px;

            right: 3px;
            top: 3px;

            border-radius: 50%;

            background: var(--ai-cyan);

            box-shadow: 0 0 6px rgba(84,214,232,.7);
        }

        .sm-ai-header strong {
            display: block;

            color: #f0f2f7;

            font-size: 10px;
            font-weight: 750;

            letter-spacing: 1.35px;
        }

        .sm-ai-header small {
            display: block;

            margin-top: 1px;

            color: #747d8c;

            font-size: 8px;
            letter-spacing: .3px;
        }


        .sm-ai-header button {
            width: 25px;
            height: 25px;

            display: grid;
            place-items: center;

            border: 1px solid transparent;
            border-radius: 4px;

            background: transparent;
            color: #78808d;

            cursor: pointer;

            transition:
                background .16s ease,
                color .16s ease,
                border-color .16s ease;
        }

        .sm-ai-header button:hover {
            border-color: #353b47;

            background: #252a34;
            color: #fff;
        }


        /* =========================================================
           RUN STATE
        ========================================================= */

        .sm-ai-run-state {
            position: relative;

            max-width: 125px;

            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;

            padding: 3px 7px 3px 15px;

            border: 1px solid #343a46;
            border-radius: 10px;

            background: #14171d;

            color: #8d96a5;

            font-size: 7px;
            font-weight: 700;
            letter-spacing: .8px;
        }

        .sm-ai-run-state::before {
            content: "";

            position: absolute;

            left: 6px;
            top: 50%;

            width: 4px;
            height: 4px;

            border-radius: 50%;

            background: #697180;

            transform: translateY(-50%);
        }

        .sm-ai-run-state.is-ready {
            border-color: rgba(114,212,154,.26);
            background: rgba(114,212,154,.055);
            color: var(--ai-green);
        }

        .sm-ai-run-state.is-ready::before {
            background: var(--ai-green);
            box-shadow: 0 0 7px rgba(114,212,154,.65);
        }

        .sm-ai-run-state.is-busy {
            border-color: rgba(233,184,107,.25);
            background: rgba(233,184,107,.055);
            color: var(--ai-orange);

            animation: sm-ai-pulse 1.1s ease-in-out infinite;
        }

        .sm-ai-run-state.is-busy::before {
            background: var(--ai-orange);
            box-shadow: 0 0 7px rgba(233,184,107,.6);
        }

        @keyframes sm-ai-pulse {
            50% {
                opacity: .5;
            }
        }


        /* =========================================================
           CONFIG / CONNECTION
        ========================================================= */

        .sm-ai-config {
            padding: 10px;

            border-bottom: 1px solid var(--ai-line);

            background:
                linear-gradient(
                    180deg,
                    #171a21,
                    #14171d
                );
        }

        .sm-ai-section-title {
            display: flex;
            align-items: center;
            justify-content: space-between;

            margin-bottom: 8px;

            color: #747d8c;

            font-size: 8px;
            font-weight: 700;

            letter-spacing: 1px;
        }


        .sm-ai-model-pill {
            padding: 2px 6px;

            border: 1px solid rgba(139,124,255,.27);
            border-radius: 8px;

            background: rgba(139,124,255,.07);

            color: #a99fff;

            font-size: 7px;
            font-weight: 600;
            letter-spacing: .5px;
        }


        .sm-ai-config > label:not(.sm-ai-check):not(.sm-ai-direct) {
            display: grid;

            grid-template-columns: 51px 1fr;

            align-items: center;

            gap: 7px;
        }

        .sm-ai-config label > span {
            color: #89909d;
            font-size: 8px;
        }


        /* =========================================================
           INPUTS
        ========================================================= */

        .sm-ai-config input,
        .sm-ai-config select,
        .sm-ai-config button,
        .sm-ai-composer textarea,
        .sm-ai-composer button {
            box-sizing: border-box;

            border: 1px solid #2e3440;

            background: #101319;
            color: #dfe3eb;

            font:
                10px
                Inter,
                "Segoe UI",
                Arial,
                sans-serif;

            outline: none;
        }


        .sm-ai-config input::placeholder,
        .sm-ai-composer textarea::placeholder {
            color: #525a68;
        }


        .sm-ai-config input:hover,
        .sm-ai-config select:hover {
            border-color: #3b4351;
        }

        .sm-ai-config input:focus,
        .sm-ai-config select:focus {
            border-color: rgba(139,124,255,.75);

            box-shadow:
                0 0 0 1px rgba(139,124,255,.10);
        }


        .sm-ai-config > label > input {
            height: 29px;

            padding: 0 8px;

            border-radius: 4px;
        }


        .sm-ai-config-row {
            display: grid;

            grid-template-columns: 1fr 52px;

            gap: 5px;

            margin-top: 6px;
            margin-left: 58px;
        }


        .sm-ai-config select,
        .sm-ai-config button {
            height: 28px;
            border-radius: 4px;
        }


        .sm-ai-config select {
            padding: 0 7px;

            background-color: #11141a;
            color: #aeb5c0;

            cursor: pointer;
        }


        .sm-ai-config button {
            border-color: rgba(139,124,255,.32);

            background:
                linear-gradient(
                    180deg,
                    #37324f,
                    #29253d
                );

            color: #c9c3ff;

            cursor: pointer;

            font-size: 8px;
            font-weight: 750;

            letter-spacing: .45px;

            transition:
                background .15s ease,
                border-color .15s ease,
                color .15s ease;
        }

        .sm-ai-config button:hover {
            border-color: rgba(169,159,255,.56);

            background:
                linear-gradient(
                    180deg,
                    #443e61,
                    #332e4a
                );

            color: #fff;
        }


        /* =========================================================
           CONFIG OPTIONS
        ========================================================= */

        .sm-ai-config-options {
            display: flex;

            align-items: center;
            justify-content: space-between;

            gap: 8px;

            margin-top: 9px;
        }


        .sm-ai-check {
            display: flex;
            align-items: center;

            gap: 5px;

            color: #8d95a2;

            white-space: nowrap;

            cursor: pointer;
        }

        .sm-ai-check input {
            width: 12px;
            height: 12px;

            accent-color: var(--ai-accent);
        }


        /* =========================================================
           DIRECT BUILD SWITCH
        ========================================================= */

        .sm-ai-direct {
            display: flex;
            align-items: center;

            gap: 7px;

            cursor: pointer;
            user-select: none;
        }

        .sm-ai-direct > input {
            position: absolute;

            opacity: 0;
            pointer-events: none;
        }


        .sm-ai-direct > span:last-child {
            display: flex;
            flex-direction: column;
        }

        .sm-ai-direct strong {
            color: #9199a6;

            font-size: 8px;
            font-weight: 750;

            letter-spacing: .65px;

            transition: color .16s ease;
        }

        .sm-ai-direct small {
            margin-top: 1px;

            color: #5f6774;

            font-size: 7px;
        }


        .sm-ai-direct.is-on strong {
            color: var(--ai-green);
        }


        .sm-ai-switch {
            position: relative;

            width: 29px;
            height: 15px;

            flex: 0 0 auto;

            border: 1px solid #343b46;
            border-radius: 8px;

            background: #0e1116;

            transition:
                background .18s ease,
                border-color .18s ease,
                box-shadow .18s ease;
        }


        .sm-ai-switch::after {
            content: "";

            position: absolute;

            top: 2px;
            left: 2px;

            width: 9px;
            height: 9px;

            border-radius: 50%;

            background: #69717e;

            transition:
                left .18s ease,
                background .18s ease,
                box-shadow .18s ease;
        }


        .sm-ai-direct.is-on .sm-ai-switch {
            border-color: rgba(114,212,154,.44);

            background: rgba(114,212,154,.10);

            box-shadow:
                inset 0 0 0 1px rgba(114,212,154,.035);
        }


        .sm-ai-direct.is-on .sm-ai-switch::after {
            left: 16px;

            background: var(--ai-green);

            box-shadow: 0 0 7px rgba(114,212,154,.45);
        }


        /* =========================================================
           API STATUS
        ========================================================= */

        .sm-ai-key-status {
            margin-top: 7px;
            padding-left: 58px;

            color: var(--ai-red);

            font-size: 8px;
        }

        .sm-ai-key-status::before {
            content: "●";

            margin-right: 5px;

            color: currentColor;

            font-size: 6px;
        }

        .sm-ai-key-status.is-ready {
            color: var(--ai-green);
        }


        /* =========================================================
           ACTIVE OBJECT CONTEXT
        ========================================================= */

        .sm-ai-context {
            min-height: 29px;

            display: flex;
            align-items: center;

            gap: 7px;

            padding: 0 10px;

            background: #191c23;

            border-bottom: 1px solid var(--ai-line);

            color: #a6aeba;

            font-size: 8px;
            letter-spacing: .3px;

            white-space: nowrap;
            overflow: hidden;
        }


        .sm-ai-context > span:last-child {
            overflow: hidden;

            text-overflow: ellipsis;
        }


        .sm-ai-context-dot {
            width: 5px;
            height: 5px;

            flex: 0 0 auto;

            border-radius: 50%;

            background: var(--ai-cyan);

            box-shadow:
                0 0 0 3px rgba(84,214,232,.07),
                0 0 8px rgba(84,214,232,.25);
        }


        /* =========================================================
           QUICK COMMAND BAR
        ========================================================= */

        .sm-ai-quick {
            display: grid;

            grid-template-columns: repeat(5, 1fr);

            gap: 1px;

            padding: 1px;

            background: #0f1116;

            border-bottom: 1px solid var(--ai-line);
        }


        .sm-ai-quick button {
            position: relative;

            height: 43px;

            display: flex;
            flex-direction: column;

            align-items: center;
            justify-content: center;

            gap: 3px;

            border: 0;
            border-radius: 2px;

            background: #171a21;

            color: #737c89;

            font-size: 7px;
            font-weight: 650;

            letter-spacing: .35px;

            cursor: pointer;

            overflow: hidden;

            transition:
                background .16s ease,
                color .16s ease;
        }


        .sm-ai-quick button::after {
            content: "";

            position: absolute;

            left: 25%;
            right: 25%;
            bottom: 0;

            height: 1px;

            background: transparent;

            transition:
                left .16s ease,
                right .16s ease,
                background .16s ease;
        }


        .sm-ai-quick button b {
            color: #b2b9c5;

            font-size: 14px;
            font-weight: 400;

            line-height: 14px;

            transition:
                color .16s ease,
                transform .16s ease;
        }


        .sm-ai-quick button:hover {
            background:
                linear-gradient(
                    180deg,
                    rgba(139,124,255,.11),
                    rgba(139,124,255,.035)
                ),
                #1b1e26;

            color: #c5c0ff;
        }


        .sm-ai-quick button:hover::after {
            left: 12%;
            right: 12%;

            background: var(--ai-accent);
        }


        .sm-ai-quick button:hover b {
            color: #a99fff;

            transform: translateY(-1px);
        }


        /* Make each tool slightly identifiable */

        .sm-ai-quick button:nth-child(2):hover b {
            color: #67d7e6;
        }

        .sm-ai-quick button:nth-child(3):hover b {
            color: #d19cff;
        }

        .sm-ai-quick button:nth-child(4):hover b {
            color: #f2c36d;
        }

        .sm-ai-quick button:nth-child(5):hover b {
            color: #78d69c;
        }


        /* =========================================================
           MESSAGES AREA
        ========================================================= */

        .sm-ai-messages {
            flex: 1;

            min-height: 130px;

            overflow: auto;

            padding: 13px 10px;

            background:
                radial-gradient(
                    circle at 80% 0%,
                    rgba(139,124,255,.035),
                    transparent 32%
                ),
                #111318;

            scrollbar-width: thin;
            scrollbar-color: #343a46 transparent;
        }


        .sm-ai-messages::-webkit-scrollbar {
            width: 6px;
        }

        .sm-ai-messages::-webkit-scrollbar-track {
            background: transparent;
        }

        .sm-ai-messages::-webkit-scrollbar-thumb {
            background: #343a46;

            border-radius: 5px;
        }

        .sm-ai-messages::-webkit-scrollbar-thumb:hover {
            background: #444b58;
        }


        /* =========================================================
           MESSAGE
        ========================================================= */

        .sm-ai-message {
            position: relative;

            max-width: 88%;

            margin: 0 0 10px;

            padding: 9px 10px;

            border: 1px solid #292f39;
            border-radius: 3px 7px 7px 7px;

            background:
                linear-gradient(
                    180deg,
                    #1b1e25,
                    #181b21
                );

            color: #ced3dc;

            white-space: pre-wrap;
            overflow-wrap: anywhere;

            box-shadow:
                0 3px 8px rgba(0,0,0,.12);

            animation:
                sm-ai-message-in .15s ease-out both;
        }


        @keyframes sm-ai-message-in {
            from {
                opacity: 0;
                transform: translateY(3px);
            }

            to {
                opacity: 1;
                transform: translateY(0);
            }
        }


        /* AI message */

        .sm-ai-message.assistant {
            border-left: 2px solid var(--ai-accent);

            background:
                linear-gradient(
                    100deg,
                    rgba(139,124,255,.055),
                    transparent 45%
                ),
                #191c23;
        }


        /* User message */

        .sm-ai-message.user {
            margin-left: auto;

            border-color: rgba(84,214,232,.20);

            border-radius: 7px 3px 7px 7px;

            background:
                linear-gradient(
                    135deg,
                    rgba(84,214,232,.085),
                    rgba(139,124,255,.055)
                ),
                #1d222b;

            color: #eef1f6;
        }


        /* system */

        .sm-ai-message.system {
            max-width: 100%;

            border-color: rgba(114,212,154,.22);
            border-left: 2px solid var(--ai-green);

            background:
                rgba(114,212,154,.055);

            color: #a9dcbc;

            font-size: 9px;
        }


        /* error */

        .sm-ai-message.error {
            max-width: 100%;

            border-color: rgba(237,125,136,.25);
            border-left: 2px solid var(--ai-red);

            background:
                rgba(237,125,136,.06);

            color: #f0a9b0;
        }


        /* =========================================================
           TOOL EXECUTION BADGES
        ========================================================= */

        .sm-ai-tool {
            display: inline-flex;
            align-items: center;

            margin: 0 4px 7px 0;

            padding: 3px 7px;

            border: 1px solid #303642;
            border-radius: 9px;

            background: #11141a;

            color: #929aa8;

            font-size: 8px;
        }


        .sm-ai-tool.is-ok {
            border-color: rgba(114,212,154,.28);

            background: rgba(114,212,154,.05);

            color: var(--ai-green);
        }


        .sm-ai-tool.is-error {
            border-color: rgba(237,125,136,.28);

            background: rgba(237,125,136,.05);

            color: #ed8b95;
        }


        /* =========================================================
           COMPOSER
        ========================================================= */

        .sm-ai-composer {
            padding: 9px;

            background:
                linear-gradient(
                    180deg,
                    #161920,
                    #13161c
                );

            border-top: 1px solid var(--ai-line);
        }


        .sm-ai-composer-box {
            display: grid;

            grid-template-columns: 1fr 32px;

            align-items: end;

            gap: 5px;

            padding: 5px;

            border: 1px solid #303744;
            border-radius: 6px;

            background: #0f1217;

            transition:
                border-color .16s ease,
                box-shadow .16s ease,
                background .16s ease;
        }


        .sm-ai-composer-box:hover {
            border-color: #3c4452;
        }


        .sm-ai-composer-box:focus-within {
            border-color: rgba(139,124,255,.72);

            background: #11141a;

            box-shadow:
                0 0 0 1px rgba(139,124,255,.08),
                0 0 20px rgba(139,124,255,.035);
        }


        .sm-ai-composer textarea {
            display: block;

            width: 100%;

            min-height: 54px;
            max-height: 130px;

            resize: none;

            padding: 6px;

            border: 0;

            background: transparent;

            color: #e1e5ec;

            line-height: 1.5;
        }


        /* send */

        .sm-ai-composer button {
            cursor: pointer;
        }


        .sm-ai-composer button.primary {
            width: 32px;
            height: 32px;

            border: 1px solid rgba(139,124,255,.55);
            border-radius: 5px;

            background:
                linear-gradient(
                    145deg,
                    #6256c4,
                    #49409b
                );

            color: #fff;

            font-size: 15px;

            box-shadow:
                inset 0 1px rgba(255,255,255,.12),
                0 3px 8px rgba(0,0,0,.18);

            transition:
                transform .15s ease,
                background .15s ease,
                border-color .15s ease;
        }


        .sm-ai-composer button.primary:hover {
            border-color: #a99fff;

            background:
                linear-gradient(
                    145deg,
                    #7467d7,
                    #564bb2
                );

            transform: translateY(-1px);
        }


        .sm-ai-composer button.primary:active {
            transform: translateY(0);
        }


        .sm-ai-composer button:disabled {
            opacity: .45;

            cursor: default;

            transform: none !important;
        }


        /* =========================================================
           COMPOSER META
        ========================================================= */

        .sm-ai-composer-meta {
            display: flex;

            align-items: center;
            justify-content: space-between;

            margin-top: 6px;

            color: #555e6c;

            font-size: 7px;
        }


        .sm-ai-composer-meta button {
            height: 19px;

            padding: 0;

            border: 0;

            background: transparent;

            color: #697281;

            font-size: 7px;
            font-weight: 650;

            letter-spacing: .4px;
        }


        .sm-ai-composer-meta button:hover {
            color: #a99fff;
        }


        /* =========================================================
           SELECTION
        ========================================================= */

        .sm-ai-panel ::selection {
            background: rgba(139,124,255,.34);
            color: #fff;
        }
    `;

            document.head.appendChild(style);
        }
    };

    window.openAIAssistant = () => window.AIAssistantPanel.open();
}());
