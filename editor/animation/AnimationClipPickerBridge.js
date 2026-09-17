// SM Engine - AnimationClipPickerBridge
(function () {
    const ClipPickerBridge = {
        installed: false,
        registry: null,
        install() {
            if (this.installed) return true;
            this.registry = window.playerAnimationClipRegistry || null;
            if (!this.registry) {
                console.warn('[AnimationClipPickerBridge] PlayerAnimationClipRegistry is not available yet.');
                return false;
            }
            this._patchAnimationGraphEditor();
            this._patchStateMachineEditor();
            this._patchBlendSpaceEditor();
            this._bindEvents();
            this.installed = true;
            console.log('[AnimationClipPickerBridge] installed');
            this.refreshCurrentDetails();
            return true;
        },
        _getClips() {
            const registry = this.registry || window.playerAnimationClipRegistry;
            if (!registry?.list) return [];
            return registry.list().filter(item => item?.key && item?.clip);
        },
        _getDefaultClip(preferred = 'Idle') {
            const registry = this.registry || window.playerAnimationClipRegistry;
            const preferredKey = registry?.resolveKey?.(preferred);
            if (preferredKey && registry?.has?.(preferredKey)) return preferredKey;
            const first = this._getClips()[0];
            return first?.key || preferredKey || preferred;
        },
        _createSelect(currentValue, onChange, options = {}) {
            const select = document.createElement('select');
            select.className = 'sm-animation-clip-picker';
            select.title = options.title || 'Select animation clip';
            const clips = this._getClips();
            const registry = this.registry || window.playerAnimationClipRegistry;
            if (!clips.length) {
                const option = document.createElement('option');
                option.value = currentValue || '';
                option.textContent = currentValue || 'No clips loaded';
                select.appendChild(option);
                select.disabled = true;
                return select;
            }
            let hasCurrent = false;
            clips.forEach(item => {
                const option = document.createElement('option');
                option.value = item.key;
                const graphName = registry?.getGraphNameForKey?.(item.key) || item.key;
                const duration = Number(item.duration) || 0;
                option.textContent = `${graphName}  [${item.key}]  ${duration.toFixed(2)}s`;
                if (item.key === currentValue) {
                    option.selected = true;
                    hasCurrent = true;
                }
                select.appendChild(option);
            });
            if (currentValue && !hasCurrent) {
                const option = document.createElement('option');
                option.value = currentValue;
                option.textContent = `${currentValue}  (missing)`;
                option.selected = true;
                select.insertBefore(option, select.firstChild);
            }
            select.addEventListener('change', () => {
                onChange?.(select.value);
            });
            return select;
        },
        _replaceFieldControl(host, labelText, currentValue, onChange) {
            if (!host) return false;
            const rows = [...host.querySelectorAll('label,.sm-anim-detail-row,.sm-sm-detail-row,.sm-bs-detail-row')];
            const row = rows.find(item => {
                const label = item.querySelector('span')?.textContent?.trim()?.toLowerCase();
                return label === String(labelText).trim().toLowerCase();
            });
            if (!row) return false;
            const old = row.querySelector('input,select');
            const select = this._createSelect(currentValue, onChange, { title: `Select ${labelText}` });
            if (old) old.replaceWith(select);
            else row.appendChild(select);
            return true;
        },
        _patchAnimationGraphEditor() {
            const editor = window.AnimationGraphEditor;
            if (!editor || editor.__smClipPickerPatched) return false;
            editor.__smClipPickerPatched = true;
            const bridge = this;
            const originalShow = typeof editor._showNodeDetails === 'function' ? editor._showNodeDetails.bind(editor) : null;
            editor._showNodeDetails = function (node) {
                originalShow?.(node);
                if (!node || node.type !== 'clip') return;
                const host = document.getElementById('anim-node-details');
                const current = bridge.registry?.resolveKey?.(node.data?.clip) || node.data?.clip || bridge._getDefaultClip('Idle');
                bridge._replaceFieldControl(host, 'Clip', current, value => {
                    node.setData?.('clip', value);
                    node.setTitle?.(bridge.registry?.getGraphNameForKey?.(value) || node.title);
                    editor.markDirty?.();
                });
            };
            const originalDefaults = typeof editor._defaultDataForType === 'function' ? editor._defaultDataForType.bind(editor) : null;
            editor._defaultDataForType = function (type) {
                const data = originalDefaults ? originalDefaults(type) : {};
                if (type === 'clip') {
                    data.clip = bridge._getDefaultClip('Idle');
                    data.loop = data.loop !== false;
                    data.playRate = Number(data.playRate) || 1;
                }
                return data;
            };
            console.log('[AnimationClipPickerBridge] AnimationGraphEditor patched');
            return true;
        },
        _patchStateMachineEditor() {
            const editor = window.AnimationStateMachineEditor;
            if (!editor || editor.__smClipPickerPatched) return false;
            editor.__smClipPickerPatched = true;
            const bridge = this;
            const originalShow = typeof editor._showStateDetails === 'function' ? editor._showStateDetails.bind(editor) : null;
            editor._showStateDetails = function (state) {
                originalShow?.(state);
                if (!state || state.type === 'entry') return;
                const motionType = state.data?.motionType || 'clip';
                if (motionType !== 'clip') return;
                const host = document.getElementById('anim-node-details');
                const current = bridge.registry?.resolveKey?.(state.data?.clip) || state.data?.clip || bridge._getDefaultClip(state.name);
                bridge._replaceFieldControl(host, 'Clip', current, value => {
                    state.setData?.('clip', value);
                    editor.markDirty?.();
                });
            };
            const originalAdd = typeof editor.addState === 'function' ? editor.addState.bind(editor) : null;
            editor.addState = function (config = {}) {
                const next = { ...config, data: { ...(config.data || {}) } };
                const motionType = next.data.motionType || 'clip';
                if (motionType === 'clip' && !next.data.clip) {
                    next.data.clip = bridge._getDefaultClip(next.name || 'Idle');
                }
                return originalAdd ? originalAdd(next) : null;
            };
            console.log('[AnimationClipPickerBridge] AnimationStateMachineEditor patched');
            return true;
        },
        _patchBlendSpaceEditor() {
            const editor = window.AnimationBlendSpaceEditor;
            if (!editor || editor.__smClipPickerPatched) return false;
            editor.__smClipPickerPatched = true;
            const bridge = this;
            const originalDetails = typeof editor._showSampleDetails === 'function' ? editor._showSampleDetails.bind(editor) : null;
            editor._showSampleDetails = function (sample) {
                originalDetails?.(sample);
                if (!sample) return;
                const host = this.canvas?.querySelector?.('#sm-bs-sample-details');
                if (!host) return;
                const current = bridge.registry?.resolveKey?.(sample.clip) || sample.clip || bridge._getDefaultClip('Idle');
                bridge._replaceFieldControl(host, 'Animation', current, value => {
                    sample.clip = value;
                    this._renderSamples?.();
                    this.selectSample?.(this.samples.indexOf(sample));
                    this._renderPreview?.();
                    this.markDirty?.();
                });
            };
            const originalNormalize = typeof editor._normalizeSample === 'function' ? editor._normalizeSample.bind(editor) : null;
            editor._normalizeSample = function (sample, index) {
                const normalized = originalNormalize ? originalNormalize(sample, index) : { ...(sample || {}) };
                normalized.clip = bridge.registry?.resolveKey?.(normalized.clip) || normalized.clip || bridge._getDefaultClip('Idle');
                return normalized;
            };
            const originalAdd = typeof editor.addSample === 'function' ? editor.addSample.bind(editor) : null;
            editor.addSample = function (config = {}) {
                const next = { ...config };
                next.clip = bridge.registry?.resolveKey?.(next.clip) || next.clip || bridge._getDefaultClip('Idle');
                return originalAdd ? originalAdd(next) : null;
            };
            console.log('[AnimationClipPickerBridge] AnimationBlendSpaceEditor patched');
            return true;
        },
        _bindEvents() {
            if (this.__eventsBound) return;
            this.__eventsBound = true;
            window.addEventListener('sm:player-animation-clips-changed', () => {
                this.registry = window.playerAnimationClipRegistry || this.registry;
                this.refreshCurrentDetails();
            });
            window.addEventListener('sm:node-editor-tab-changed', event => {
                if (event.detail?.target === 'animation-graph-wrapper') {
                    setTimeout(() => this.refreshCurrentDetails(), 0);
                }
            });
            window.addEventListener('sm:animation-state-machine-open', () => {
                setTimeout(() => this.refreshCurrentDetails(), 50);
            });
            window.addEventListener('sm:animation-blend-space-open', () => {
                setTimeout(() => this.refreshCurrentDetails(), 50);
            });
        },
        refreshCurrentDetails() {
            this.registry = window.playerAnimationClipRegistry || this.registry;
            const graph = window.AnimationGraphEditor;
            if (graph?.initialized && graph.selectedNodes?.size === 1) {
                const id = [...graph.selectedNodes][0];
                const node = graph.nodes?.get?.(id);
                if (node) graph._showNodeDetails?.(node);
                return;
            }
            const machine = window.AnimationStateMachineEditor;
            if (machine?.initialized) {
                if (machine.selectedTransition) {
                    machine._showTransitionDetails?.(machine.selectedTransition);
                    return;
                }
                if (machine.selectedStates?.size === 1) {
                    const id = [...machine.selectedStates][0];
                    const state = machine.states?.get?.(id);
                    if (state) machine._showStateDetails?.(state);
                }
                return;
            }
            const blend = window.AnimationBlendSpaceEditor;
            if (blend?.initialized && blend.selectedSampleIndex >= 0) {
                const sample = blend.samples?.[blend.selectedSampleIndex];
                if (sample) blend._showSampleDetails?.(sample);
            }
        },
        _injectStyles() {
            if (document.getElementById('sm-animation-clip-picker-styles')) return;
            const style = document.createElement('style');
            style.id = 'sm-animation-clip-picker-styles';
            style.textContent = `.sm-animation-clip-picker{width:100%;min-width:0;height:23px;padding:0 5px;border:1px solid #4a4a4a;border-radius:0;background:#292929;color:#e5e5e5;outline:none;font-size:10px}.sm-animation-clip-picker:focus{border-color:#737373}.sm-animation-clip-picker:disabled{color:#777;background:#252525}`;
            document.head.appendChild(style);
        }
    };
    window.AnimationClipPickerBridge = ClipPickerBridge;
    function boot() {
        ClipPickerBridge._injectStyles();
        if (ClipPickerBridge.install()) return;
        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;
            if (ClipPickerBridge.install() || attempts > 120) {
                clearInterval(timer);
                if (attempts > 120) console.warn('[AnimationClipPickerBridge] Could not install after startup retries.');
            }
        }, 100);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();