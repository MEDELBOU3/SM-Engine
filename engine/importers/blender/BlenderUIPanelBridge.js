// engine/importers/blender/BlenderUIPanelBridge.js
// Declarative, sandboxed Blender UI metadata -> SM Engine viewport controls.
// No Python, HTML, or JavaScript from a .blend file is ever executed.
(function (global) {
    'use strict';

    if (global.smBlenderUIPanelBridge) return;

    const MAX_PANELS = 24;
    const MAX_CONTROLS = 96;
    const NUMBER_MATERIAL_KEYS = new Set([
        'roughness', 'metalness', 'opacity', 'alphaTest',
        'emissiveIntensity', 'envMapIntensity', 'normalScale',
        'clearcoat', 'clearcoatRoughness', 'transmission',
        'thickness', 'ior', 'reflectivity', 'specularIntensity',
        'sheen', 'sheenRoughness', 'anisotropy', 'iridescence'
    ]);
    const COLOR_MATERIAL_KEYS = new Set(['color', 'emissive', 'specularColor', 'sheenColor']);
    const ACTIONS = new Set([
        'toggleVisibility', 'resetTransform', 'playAnimation', 'stopAnimation'
    ]);

    function parseJSON(value) {
        if (typeof value !== 'string') return value;
        try { return JSON.parse(value); } catch (_) { return null; }
    }

    function list(value) {
        const parsed = parseJSON(value);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.panels)) return parsed.panels;
        return parsed && typeof parsed === 'object' ? [parsed] : [];
    }

    function text(value, fallback = '', max = 160) {
        return String(value ?? fallback).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max) || fallback;
    }

    function id(value, fallback) {
        return text(value, fallback, 80)
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '') || fallback;
    }

    function finite(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function normalizeOptions(value) {
        return (Array.isArray(value) ? value : [])
            .slice(0, 128)
            .map((option, index) => {
                if (option && typeof option === 'object') {
                    return {
                        label: text(option.label ?? option.name ?? option.value, `Option ${index + 1}`),
                        value: option.value ?? option.id ?? option.name ?? index
                    };
                }
                return { label: text(option, `Option ${index + 1}`), value: option };
            });
    }

    function safeBinding(value) {
        const path = text(value, '', 180);
        if (!path || /(?:__proto__|prototype|constructor)/i.test(path)) return null;
        if (/^(visible|position\.[xyz]|rotation\.[xyz]|scale\.[xyz])$/.test(path)) return path;
        if (/^material(?:\[\d+\])?\.[A-Za-z][A-Za-z0-9]*$/.test(path)) {
            const key = path.split('.').pop();
            return NUMBER_MATERIAL_KEYS.has(key) || COLOR_MATERIAL_KEYS.has(key) ? path : null;
        }
        if (/^userData\.sm(?:Controls|Blender\.customProperties)\.[A-Za-z0-9_.-]+$/.test(path)) {
            return path;
        }
        return null;
    }

    function inferType(raw) {
        const requested = text(raw.type || raw.kind, '').toLowerCase();
        const aliases = {
            range: 'slider', float: 'number', int: 'number', integer: 'number',
            bool: 'toggle', boolean: 'toggle', checkbox: 'toggle', colour: 'color',
            dropdown: 'select', enum: 'select'
        };
        const type = aliases[requested] || requested;
        if (['slider', 'number', 'toggle', 'color', 'select', 'text', 'button', 'label'].includes(type)) {
            return type;
        }
        if (Array.isArray(raw.options)) return 'select';
        if (typeof raw.value === 'boolean') return 'toggle';
        if (typeof raw.value === 'number') return 'slider';
        return 'text';
    }

    function normalizeControl(raw, index, panel) {
        if (!raw || typeof raw !== 'object') return null;
        const type = inferType(raw);
        const binding = safeBinding(raw.bind || raw.binding || raw.path || raw.property);
        const minimum = finite(raw.min, 0);
        const maximum = finite(raw.max, type === 'slider' ? 1 : 100);
        const min = Math.min(minimum, maximum);
        const max = Math.max(minimum, maximum);
        const step = Math.max(Number.EPSILON, finite(raw.step, type === 'slider' ? 0.01 : 1));
        const action = ACTIONS.has(raw.action) ? raw.action : null;

        return {
            id: id(raw.id || raw.name, `${panel.id}-control-${index + 1}`),
            label: text(raw.label || raw.title || raw.name, `Control ${index + 1}`),
            description: text(raw.description || raw.tooltip, '', 320),
            type,
            bind: binding,
            target: text(raw.target, panel.target || '', 160) || null,
            materialIndex: Math.max(0, Math.floor(finite(raw.materialIndex, 0))),
            value: raw.value,
            min,
            max,
            step,
            options: normalizeOptions(raw.options || raw.items),
            action,
            animation: text(raw.animation || raw.clip, '', 160) || null,
            disabled: raw.disabled === true || (type !== 'button' && type !== 'label' && !binding)
        };
    }

    function normalizePanel(raw, index) {
        if (!raw || typeof raw !== 'object') return null;
        const panel = {
            id: id(raw.id || raw.name || raw.title, `blender-panel-${index + 1}`),
            title: text(raw.title || raw.label || raw.name, `Blender Panel ${index + 1}`),
            category: text(raw.category, 'Blender', 80),
            source: text(raw.source, 'blend', 160),
            target: text(raw.target || raw.object, '', 160) || null,
            placement: ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(raw.placement)
                ? raw.placement
                : 'top-right',
            autoOpen: raw.autoOpen !== false,
            collapsed: raw.collapsed === true,
            controls: []
        };
        panel.controls = (raw.controls || raw.items || raw.fields || [])
            .slice(0, MAX_CONTROLS)
            .map((control, controlIndex) => normalizeControl(control, controlIndex, panel))
            .filter(Boolean);
        return panel.controls.length || raw.allowEmpty === true ? panel : null;
    }

    function objectByName(root, name) {
        if (!root || !name || root.name === name) return root;
        return root.getObjectByName?.(name) || (() => {
            let result = null;
            root.traverse?.(object => { if (!result && object.name === name) result = object; });
            return result;
        })();
    }

    function getMaterial(target, path, fallbackIndex) {
        const match = /^material(?:\[(\d+)\])?\./.exec(path || '');
        if (!match) return null;
        const index = match[1] === undefined ? fallbackIndex : Number(match[1]);
        return Array.isArray(target?.material) ? target.material[index] : target?.material;
    }

    class BlenderUIPanelBridge {
        constructor() {
            this.version = 1;
            this.activeRoot = null;
            this.host = null;
            this.registry = new Map();
        }

        extract(metadata) {
            if (!metadata || typeof metadata !== 'object') return [];
            const candidates = [];
            candidates.push(...list(metadata.uiPanels));

            const sceneProperties = metadata.scene?.customProperties || {};
            for (const key of ['sm_ui_panels', 'sm_engine_ui', 'sm_ui_panel']) {
                candidates.push(...list(sceneProperties[key]));
            }
            for (const object of Array.isArray(metadata.objects) ? metadata.objects : []) {
                const properties = object?.customProperties || {};
                for (const key of ['sm_ui_panels', 'sm_engine_ui', 'sm_ui_panel']) {
                    for (const panel of list(properties[key])) {
                        candidates.push({ ...panel, target: panel.target || object.name, source: panel.source || 'object' });
                    }
                }
            }

            const normalized = candidates
                .slice(0, MAX_PANELS)
                .map(normalizePanel)
                .filter(Boolean);
            const seen = new Set();
            return normalized.filter(panel => {
                if (seen.has(panel.id)) return false;
                seen.add(panel.id);
                return true;
            });
        }

        attach(root, metadata, options = {}) {
            if (!root) return [];
            const panels = this.extract(metadata);
            root.userData ||= {};
            root.userData.smBlenderUIPanels = panels;
            if (root.uuid) this.registry.set(root.uuid, { root, panels, assetId: options.asset?.id || null });
            if (options.mount === true && panels.some(panel => panel.autoOpen)) {
                this.mount(root, { ...options, panels });
            }
            return panels;
        }

        detach(root) {
            if (!root) return false;
            if (this.activeRoot === root) this.unmount();
            if (root.uuid) this.registry.delete(root.uuid);
            return true;
        }

        _target(root, panel, control) {
            return objectByName(root, control.target || panel.target) || root;
        }

        _read(root, panel, control) {
            const target = this._target(root, panel, control);
            const path = control.bind;
            if (!target || !path) return control.value;
            if (path.startsWith('material')) {
                const material = getMaterial(target, path, control.materialIndex);
                const key = path.split('.').pop();
                const value = material?.[key];
                if (value?.isColor) return `#${value.getHexString()}`;
                return value ?? control.value;
            }
            let cursor = target;
            for (const segment of path.split('.')) cursor = cursor?.[segment];
            return cursor ?? control.value;
        }

        _write(root, panel, control, value) {
            const target = this._target(root, panel, control);
            const path = control.bind;
            if (!target || !path) return false;

            if (path.startsWith('material')) {
                const material = getMaterial(target, path, control.materialIndex);
                const key = path.split('.').pop();
                if (!material) return false;
                if (COLOR_MATERIAL_KEYS.has(key) && material[key]?.set) material[key].set(value);
                else material[key] = NUMBER_MATERIAL_KEYS.has(key) ? finite(value, material[key] ?? 0) : value;
                if (key === 'opacity') material.transparent = material.opacity < 1;
                material.needsUpdate = true;
            } else {
                const parts = path.split('.');
                const key = parts.pop();
                let cursor = target;
                for (const segment of parts) {
                    if (!cursor[segment] || typeof cursor[segment] !== 'object') cursor[segment] = {};
                    cursor = cursor[segment];
                }
                if (path === 'visible') cursor[key] = Boolean(value);
                else if (/^(?:position|rotation|scale)\./.test(path)) cursor[key] = finite(value, cursor[key] || 0);
                else cursor[key] = value;
                target.updateMatrixWorld?.(true);
            }

            global.dispatchEvent?.(new CustomEvent('sm:blender-ui-change', {
                detail: { root, target, panel, control, value }
            }));
            return true;
        }

        _action(root, panel, control) {
            const target = this._target(root, panel, control);
            switch (control.action) {
                case 'toggleVisibility':
                    target.visible = !target.visible;
                    break;
                case 'resetTransform':
                    target.position?.set?.(0, 0, 0);
                    target.rotation?.set?.(0, 0, 0);
                    target.scale?.set?.(1, 1, 1);
                    target.updateMatrixWorld?.(true);
                    break;
                case 'playAnimation': {
                    const clips = root.animations || [];
                    const clip = clips.find(item => item.name === control.animation) || clips[0];
                    if (clip && global.THREE?.AnimationMixer) {
                        root.userData ||= {};
                        root.userData.mixer ||= new global.THREE.AnimationMixer(root);
                        root.userData.mixer.clipAction(clip).reset().play();
                    }
                    break;
                }
                case 'stopAnimation':
                    root.userData?.mixer?.stopAllAction?.();
                    break;
                default:
                    return false;
            }
            global.dispatchEvent?.(new CustomEvent('sm:blender-ui-action', {
                detail: { root, target, panel, control, action: control.action }
            }));
            return true;
        }

        _ensureStyles() {
            if (!global.document || document.getElementById('sm-blender-ui-styles')) return;
            const style = document.createElement('style');
            style.id = 'sm-blender-ui-styles';
            style.textContent = `
.sm-blender-ui-host{position:absolute;z-index:38;width:min(320px,calc(100% - 24px));max-height:calc(100% - 76px);display:flex;flex-direction:column;pointer-events:none;font:12px/1.35 Inter,Segoe UI,sans-serif;color:#e8edf3}
.sm-blender-ui-host.top-right{top:50px;right:12px}.sm-blender-ui-host.top-left{top:50px;left:12px}.sm-blender-ui-host.bottom-right{bottom:12px;right:12px}.sm-blender-ui-host.bottom-left{bottom:12px;left:12px}
.sm-blender-ui-card{pointer-events:auto;overflow:hidden;border:1px solid rgba(139,160,183,.26);border-radius:10px;background:rgba(18,22,28,.94);box-shadow:0 16px 40px rgba(0,0,0,.35);backdrop-filter:blur(12px)}
.sm-blender-ui-head{height:38px;display:flex;align-items:center;gap:8px;padding:0 8px 0 12px;border-bottom:1px solid rgba(255,255,255,.08)}
.sm-blender-ui-title{min-width:0;flex:1;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm-blender-ui-source{font-size:10px;color:#8ba0b7}
.sm-blender-ui-icon{width:25px;height:25px;border:0;border-radius:6px;background:transparent;color:#aebccc;cursor:pointer}.sm-blender-ui-icon:hover{background:#29323d;color:#fff}
.sm-blender-ui-tabs{display:flex;gap:4px;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.07);overflow:auto}.sm-blender-ui-tab{border:0;border-radius:6px;padding:5px 8px;background:transparent;color:#91a0b1;white-space:nowrap;cursor:pointer}.sm-blender-ui-tab.active{background:#2675da;color:#fff}
.sm-blender-ui-body{max-height:calc(100vh - 180px);overflow:auto;padding:8px}.sm-blender-ui-card.collapsed .sm-blender-ui-tabs,.sm-blender-ui-card.collapsed .sm-blender-ui-body{display:none}
.sm-blender-ui-row{display:grid;grid-template-columns:minmax(88px,1fr) minmax(110px,1.15fr);align-items:center;gap:9px;min-height:34px;padding:4px 3px}.sm-blender-ui-row>label{color:#b9c5d2;overflow:hidden;text-overflow:ellipsis}
.sm-blender-ui-row input,.sm-blender-ui-row select,.sm-blender-ui-row button{min-width:0;height:27px;border:1px solid #394554;border-radius:6px;background:#11161c;color:#e8edf3;padding:0 7px}.sm-blender-ui-row input[type=range]{padding:0;border:0;background:transparent}.sm-blender-ui-row input[type=checkbox]{justify-self:start;width:17px;height:17px}.sm-blender-ui-row button{background:#253142;cursor:pointer}.sm-blender-ui-row button:hover{background:#2f78d1}.sm-blender-ui-row.disabled{opacity:.48}.sm-blender-ui-label{grid-column:1/-1;color:#91a0b1;padding:5px 3px}
`;
            document.head?.appendChild(style);
        }

        _container(options = {}) {
            return options.container
                || global.SMViewportSystem?.getActivePanel?.()?.dom
                || global.renderer?.domElement?.parentElement
                || document.getElementById('editor-scene')
                || document.getElementById('viewport-container')
                || document.body;
        }

        _renderControl(root, panel, control) {
            const row = document.createElement('div');
            row.className = `sm-blender-ui-row${control.disabled ? ' disabled' : ''}`;
            if (control.description) row.title = control.description;
            if (control.type === 'label') {
                row.className = 'sm-blender-ui-label';
                row.textContent = control.label;
                return row;
            }

            const label = document.createElement('label');
            label.textContent = control.label;
            row.appendChild(label);

            let input;
            const current = this._read(root, panel, control);
            if (control.type === 'select') {
                input = document.createElement('select');
                for (const option of control.options) {
                    const element = document.createElement('option');
                    element.textContent = option.label;
                    element.value = String(option.value);
                    element.__smValue = option.value;
                    if (Object.is(option.value, current) || String(option.value) === String(current)) element.selected = true;
                    input.appendChild(element);
                }
                input.addEventListener('change', () => this._write(root, panel, control, input.selectedOptions[0]?.__smValue ?? input.value));
            } else if (control.type === 'toggle') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = Boolean(current);
                input.addEventListener('change', () => this._write(root, panel, control, input.checked));
            } else if (control.type === 'button') {
                input = document.createElement('button');
                input.type = 'button';
                input.textContent = control.label;
                label.textContent = '';
                input.disabled = !control.action;
                input.addEventListener('click', () => this._action(root, panel, control));
            } else {
                input = document.createElement('input');
                input.type = control.type === 'slider' ? 'range' : control.type === 'color' ? 'color' : control.type === 'number' ? 'number' : 'text';
                if (control.type === 'slider' || control.type === 'number') {
                    input.min = String(control.min);
                    input.max = String(control.max);
                    input.step = String(control.step);
                }
                input.value = current ?? control.value ?? '';
                const eventName = control.type === 'slider' || control.type === 'color' ? 'input' : 'change';
                input.addEventListener(eventName, () => {
                    const value = control.type === 'slider' || control.type === 'number' ? Number(input.value) : input.value;
                    this._write(root, panel, control, value);
                });
            }
            input.disabled ||= control.disabled;
            input.id = `sm-blender-control-${panel.id}-${control.id}`;
            label.htmlFor = input.id;
            row.appendChild(input);
            return row;
        }

        mount(root, options = {}) {
            if (!global.document || !root) return null;
            const panels = options.panels || root.userData?.smBlenderUIPanels || [];
            if (!panels.length) return null;
            this.unmount();
            this._ensureStyles();

            const container = this._container(options);
            if (!container) return null;
            if (global.getComputedStyle?.(container)?.position === 'static') container.style.position = 'relative';

            const host = document.createElement('section');
            host.className = `sm-blender-ui-host ${panels[0].placement}`;
            host.dataset.rootUuid = root.uuid || '';
            const card = document.createElement('div');
            card.className = `sm-blender-ui-card${panels[0].collapsed ? ' collapsed' : ''}`;

            const head = document.createElement('div');
            head.className = 'sm-blender-ui-head';
            const title = document.createElement('div');
            title.className = 'sm-blender-ui-title';
            title.textContent = panels[0].title;
            const source = document.createElement('span');
            source.className = 'sm-blender-ui-source';
            source.textContent = 'BLENDER';
            const collapse = document.createElement('button');
            collapse.className = 'sm-blender-ui-icon';
            collapse.type = 'button';
            collapse.textContent = '−';
            collapse.title = 'Collapse';
            const close = document.createElement('button');
            close.className = 'sm-blender-ui-icon';
            close.type = 'button';
            close.textContent = '×';
            close.title = 'Close';
            head.append(title, source, collapse, close);
            card.appendChild(head);

            const tabs = document.createElement('div');
            tabs.className = 'sm-blender-ui-tabs';
            const body = document.createElement('div');
            body.className = 'sm-blender-ui-body';

            const activate = index => {
                const panel = panels[index];
                title.textContent = panel.title;
                [...tabs.children].forEach((tab, tabIndex) => tab.classList.toggle('active', tabIndex === index));
                body.replaceChildren(...panel.controls.map(control => this._renderControl(root, panel, control)));
            };
            panels.forEach((panel, index) => {
                const tab = document.createElement('button');
                tab.className = 'sm-blender-ui-tab';
                tab.type = 'button';
                tab.textContent = panel.title;
                tab.addEventListener('click', () => activate(index));
                tabs.appendChild(tab);
            });
            if (panels.length > 1) card.appendChild(tabs);
            card.appendChild(body);
            host.appendChild(card);
            container.appendChild(host);
            activate(0);

            collapse.addEventListener('click', () => {
                const collapsed = card.classList.toggle('collapsed');
                collapse.textContent = collapsed ? '+' : '−';
            });
            close.addEventListener('click', () => this.unmount());

            this.activeRoot = root;
            this.host = host;
            global.dispatchEvent?.(new CustomEvent('sm:blender-ui-mounted', { detail: { root, panels, host } }));
            return host;
        }

        unmount() {
            if (!this.host) return false;
            const host = this.host;
            const root = this.activeRoot;
            this.host = null;
            this.activeRoot = null;
            host.remove?.();
            global.dispatchEvent?.(new CustomEvent('sm:blender-ui-unmounted', { detail: { root } }));
            return true;
        }
    }

    global.SMBlenderUIPanelBridge = BlenderUIPanelBridge;
    global.smBlenderUIPanelBridge = new BlenderUIPanelBridge();
    console.log('[BlenderUIPanelBridge] Declarative viewport UI ready.');
})(window);
