// ============================================================================
// engine/game-play/game-ui-system.js
// Unity-style Game UI Canvas & Designer System
// ============================================================================

(function () {
    'use strict';

    class GameUISystem {
        constructor() {
            this.canvas = null;
            this.elements = new Map(); // id -> ElementData
            this.isDesignerMode = true; // True = draggable/resizable, False = interactive game-mode
            this.selectedElementId = null;
            this.draggedElement = null;
            this.resizeElement = null;
            this.dragOffset = { x: 0, y: 0 };
            this.resizeStartSize = { w: 0, h: 0 };
            this.resizeStartMouse = { x: 0, y: 0 };

            this.initCanvas();
            this.setupDesignListeners();

            // Expose globally
            window.GameUI = this;
        }

        initCanvas() {
            const rendererContainer = document.getElementById('renderer-container');
            if (!rendererContainer) return;

            let canvas = document.getElementById('game-ui-canvas');
            if (!canvas) {
                canvas = document.createElement('div');
                canvas.id = 'game-ui-canvas';
                canvas.style.cssText = `
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    z-index: 9;
                    overflow: hidden;
                    user-select: none;
                `;
                rendererContainer.appendChild(canvas);
            }
            this.canvas = canvas;
        }

        setDesignerMode(active) {
            this.isDesignerMode = active;
            this.canvas.style.pointerEvents = active ? 'auto' : 'none';
            
            this.elements.forEach((elData, id) => {
                const el = elData.dom;
                const resizeHandle = el.querySelector('.ui-resize-handle');
                if (active) {
                    el.style.pointerEvents = 'auto';
                    el.style.border = '1px dashed #2196f3';
                    if (resizeHandle) resizeHandle.style.display = 'block';
                } else {
                    el.style.pointerEvents = elData.type === 'button' ? 'auto' : 'none';
                    el.style.border = 'none';
                    if (resizeHandle) resizeHandle.style.display = 'none';
                }
            });

            if (!active) this.deselectElement();
        }

        addElement(type, name = null) {
            const id = `ui_${type}_${Date.now()}`;
            const displayName = name || `${type.charAt(0).toUpperCase() + type.slice(1)}_${id.substring(12)}`;

            const el = document.createElement('div');
            el.id = id;
            el.className = 'game-ui-element';
            el.style.cssText = `
                position: absolute;
                left: 50px;
                top: 50px;
                width: 120px;
                height: 40px;
                background: ${type === 'button' ? '#2196f3' : type === 'progressbar' ? '#333' : 'transparent'};
                border: 1px dashed #2196f3;
                border-radius: 4px;
                color: #fff;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: move;
                pointer-events: auto;
                box-sizing: border-box;
            `;

            // Progress bar inner track
            if (type === 'progressbar') {
                el.innerHTML = `
                    <div class="ui-bar-fill" style="position:absolute; left:0; top:0; bottom:0; width:100%; background:#4caf50; border-radius:3px; transition: width 0.1s;"></div>
                    <span class="ui-text-label" style="z-index:2; font-size:11px; font-weight:bold;">100%</span>
                `;
                el.style.width = '180px';
                el.style.height = '24px';
            } else if (type === 'button') {
                el.innerHTML = `<span class="ui-text-label" style="font-size:12px; font-weight:bold;">Click Me</span>`;
                el.style.cursor = 'pointer';
            } else {
                // Label
                el.innerHTML = `<span class="ui-text-label" style="font-size:14px;">Text Label</span>`;
                el.style.width = '100px';
                el.style.height = '25px';
            }

            // Create resize handle
            const handle = document.createElement('div');
            handle.className = 'ui-resize-handle';
            handle.style.cssText = `
                position: absolute;
                right: 0;
                bottom: 0;
                width: 8px;
                height: 8px;
                background: #fff;
                border: 1px solid #2196f3;
                cursor: se-resize;
                z-index: 10;
            `;
            el.appendChild(handle);

            this.canvas.appendChild(el);

            const elData = {
                id,
                name: displayName,
                type,
                dom: el,
                value: 100, // Used for progress bars
                text: type === 'button' ? 'Click Me' : type === 'progressbar' ? '100%' : 'Text Label',
                styles: {
                    background: el.style.background,
                    color: el.style.color,
                    fontSize: '12px'
                },
                onClickCode: ""
            };

            this.elements.set(id, elData);
            this.selectElement(id);

            // Bind play-mode click behavior
            el.addEventListener('click', (e) => {
                if (this.isDesignerMode) return;
                if (type === 'button' && elData.onClickCode) {
                    try {
                        new Function(elData.onClickCode)();
                    } catch (err) {
                        console.error(`UI Script Execution Error on ${displayName}:`, err);
                    }
                }
            });

            return elData;
        }

        selectElement(id) {
            this.deselectElement();
            this.selectedElementId = id;
            const elData = this.elements.get(id);
            if (elData) {
                elData.dom.style.borderColor = '#00ff00';
                this.updateInspectorUI(elData);
            }
        }

        deselectElement() {
            if (this.selectedElementId) {
                const prev = this.elements.get(this.selectedElementId);
                if (prev) prev.dom.style.borderColor = '#2196f3';
            }
            this.selectedElementId = null;
            const container = document.getElementById('ui-element-properties');
            if (container) container.innerHTML = '<div style="font-size:10px; color:#666; font-style:italic;">Select a UI element to edit</div>';
        }

        setupDesignListeners() {
            // Drag and Resize Events
            this.canvas.addEventListener('mousedown', (e) => {
                if (!this.isDesignerMode) return;

                const targetEl = e.target.closest('.game-ui-element');
                if (!targetEl) {
                    this.deselectElement();
                    return;
                }

                const id = targetEl.id;
                this.selectElement(id);

                if (e.target.classList.contains('ui-resize-handle')) {
                    // Start resize
                    this.resizeElement = targetEl;
                    this.resizeStartSize = {
                        w: targetEl.offsetWidth,
                        h: targetEl.offsetHeight
                    };
                    this.resizeStartMouse = { x: e.clientX, y: e.clientY };
                } else {
                    // Start drag
                    this.draggedElement = targetEl;
                    const rect = targetEl.getBoundingClientRect();
                    const canvasRect = this.canvas.getBoundingClientRect();
                    this.dragOffset = {
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top
                    };
                }
                e.preventDefault();
            });

            window.addEventListener('mousemove', (e) => {
                if (this.draggedElement) {
                    const canvasRect = this.canvas.getBoundingClientRect();
                    const x = e.clientX - canvasRect.left - this.dragOffset.x;
                    const y = e.clientY - canvasRect.top - this.dragOffset.y;

                    this.draggedElement.style.left = `${x}px`;
                    this.draggedElement.style.top = `${y}px`;
                }

                if (this.resizeElement) {
                    const dx = e.clientX - this.resizeStartMouse.x;
                    const dy = e.clientY - this.resizeStartMouse.y;
                    
                    const w = Math.max(40, this.resizeStartSize.w + dx);
                    const h = Math.max(15, this.resizeStartSize.h + dy);

                    this.resizeElement.style.width = `${w}px`;
                    this.resizeElement.style.height = `${h}px`;
                }
            });

            window.addEventListener('mouseup', () => {
                this.draggedElement = null;
                this.resizeElement = null;
            });
        }

        // Scripting API methods (Callable by CodeMirror scripts)
        get(elementName) {
            let found = null;
            this.elements.forEach((data) => {
                if (data.name === elementName) found = data;
            });

            if (!found) return null;

            return {
                setText: (val) => {
                    found.text = val;
                    const label = found.dom.querySelector('.ui-text-label');
                    if (label) label.textContent = val;
                },
                setValue: (val) => {
                    // Progress bar filling calculation (0 - 100)
                    if (found.type === 'progressbar') {
                        found.value = Math.max(0, Math.min(100, val));
                        const fill = found.dom.querySelector('.ui-bar-fill');
                        const label = found.dom.querySelector('.ui-text-label');
                        if (fill) fill.style.width = `${found.value}%`;
                        if (label) label.textContent = `${Math.round(found.value)}%`;
                    }
                },
                setVisible: (visible) => {
                    found.dom.style.display = visible ? 'flex' : 'none';
                }
            };
        }

        updateInspectorUI(elData) {
            const container = document.getElementById('ui-element-properties');
            if (!container) return;

            container.innerHTML = `
                <div style="font-size:10px; font-weight:bold; color:#888; text-transform:uppercase; margin-bottom:8px;">UI Element Config</div>
                <div class="ph-prop-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:11px; color:#aaa;">Element Name</span>
                    <input type="text" id="ui-prop-name" value="${elData.name}" style="background:#000; border:1px solid #333; color:#eee; font-size:11px; padding:2px 4px; width:60%;">
                </div>
                <div class="ph-prop-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:11px; color:#aaa;">Label Text</span>
                    <input type="text" id="ui-prop-text" value="${elData.text}" style="background:#000; border:1px solid #333; color:#eee; font-size:11px; padding:2px 4px; width:60%;">
                </div>
                <div class="ph-prop-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:11px; color:#aaa;">BG Color</span>
                    <input type="color" id="ui-prop-bg" value="#2196f3" style="width:50px; height:20px; border:none; cursor:pointer;">
                </div>
                <div style="margin-top:10px;">
                    <span style="font-size:10px; font-weight:bold; color:#888; text-transform:uppercase; display:block; margin-bottom:4px;">OnClick Callback (JS)</span>
                    <textarea id="ui-prop-onclick" style="background:#000; border:1px solid #333; color:#00ffaa; font-family:monospace; font-size:11px; width:100%; height:80px; resize:vertical; outline:none; padding:4px;">${elData.onClickCode || '// Type game action here\n'}</textarea>
                </div>
                <button class="ph-btn" id="ui-delete-btn" style="width:100%; background:#4a1a1a; color:#f66; font-size:11px; margin-top:8px; padding:4px 0;">Delete Element</button>
            `;

            // Bind inspector settings to live DOM
            const nameIn = document.getElementById('ui-prop-name');
            const textIn = document.getElementById('ui-prop-text');
            const bgIn = document.getElementById('ui-prop-bg');
            const clickIn = document.getElementById('ui-prop-onclick');

            nameIn?.addEventListener('input', (e) => { elData.name = e.target.value; });
            textIn?.addEventListener('input', (e) => {
                elData.text = e.target.value;
                const label = elData.dom.querySelector('.ui-text-label');
                if (label) label.textContent = e.target.value;
            });
            bgIn?.addEventListener('input', (e) => {
                elData.dom.style.background = e.target.value;
                elData.styles.background = e.target.value;
            });
            clickIn?.addEventListener('input', (e) => {
                elData.onClickCode = e.target.value;
            });
            document.getElementById('ui-delete-btn')?.addEventListener('click', () => {
                elData.dom.remove();
                this.elements.delete(elData.id);
                this.deselectElement();
            });
        }
    }

    // Auto-bootstrap when file evaluates
    document.addEventListener('DOMContentLoaded', () => {
        new GameUISystem();
    });
})();