/**
 * GAME-UI/editor/GameUICanvasEditor.js
 * ------------------------------------------------------------
 * Visual canvas used to author Game UI.
 *
 * Supports:
 * - Dynamic Game Window viewport simulation (default 1280x720 / active popup)
 * - True Anchor layout computation (Center, Top, Stretch, Offset) matching runtime
 * - Zoom, pan, and visual guides
 * - Widget rendering with live style application
 * - Multi-widget drag and 8-point resize handles
 * - Grid snapping and parallel runtime notification
 */
(function () {
    'use strict';

    class GameUICanvasEditor {
        constructor(options = {}) {
            this.container = options.container || null;
            this.document = options.document || null;

            this.selectionManager =
                options.selectionManager ||
                window.gameUISelectionManager ||
                null;

            this.layoutEngine =
                options.layoutEngine ||
                window.uiLayoutEngine ||
                null;

            this.root = null;
            this.viewport = null;
            this.canvas = null;
            this.overlay = null;

            this.zoom = Number(options.zoom ?? 0.7);
            this.minZoom = Number(options.minZoom ?? 0.15);
            this.maxZoom = Number(options.maxZoom ?? 3);

            this.panX = 0;
            this.panY = 0;

            this.gridSize = Number(options.gridSize ?? 10);
            this.snapEnabled = options.snapEnabled ?? true;
            this.showGrid = options.showGrid ?? true;

            this.interactive = options.interactive ?? true;

            this._drag = null;
            this._resize = null;
            this._selectionBoxes = new Map();
            this._resizeObserver = null;
            this._layoutRaf = 0;
            this._simulatedViewportSize = null;

            this._onPointerDown = this._onPointerDown.bind(this);
            this._onPointerMove = this._onPointerMove.bind(this);
            this._onPointerUp = this._onPointerUp.bind(this);
            this._onWheel = this._onWheel.bind(this);
            this._onSelectionChanged = this._onSelectionChanged.bind(this);
            this._onLayoutResized = this._onLayoutResized.bind(this);
            this._onGameWindowResized = this._onGameWindowResized.bind(this);
        }

        init(container = this.container) {
            if (container) this.container = container;
            if (!this.container) {
                throw new Error('GameUICanvasEditor.init(): container is required.');
            }

            if (this.root) return this;

            this.root = document.createElement('div');
            this.root.className = 'game-ui-canvas-editor';

            this.viewport = document.createElement('div');
            this.viewport.className = 'game-ui-canvas-viewport';

            this.canvas = document.createElement('div');
            this.canvas.className = 'game-ui-authoring-canvas';

            this.overlay = document.createElement('div');
            this.overlay.className = 'game-ui-canvas-overlay';

            this.viewport.appendChild(this.canvas);
            this.viewport.appendChild(this.overlay);
            this.root.appendChild(this.viewport);
            this.container.appendChild(this.root);

            this.root.addEventListener('pointerdown', this._onPointerDown);
            window.addEventListener('pointermove', this._onPointerMove);
            window.addEventListener('pointerup', this._onPointerUp);
            this.root.addEventListener('wheel', this._onWheel, { passive: false });

            this.selectionManager?.on?.(
                'selection-changed',
                this._onSelectionChanged
            );

            window.addEventListener('sm:game-window-resized', this._onGameWindowResized);
            window.addEventListener('sm:game-window-ready', this._onGameWindowResized);

            this.applyViewTransform();
            this.render();

            if (typeof ResizeObserver !== 'undefined') {
                this._resizeObserver = new ResizeObserver(this._onLayoutResized);
                this._resizeObserver.observe(this.root);
            }
            window.addEventListener('sm:layout-resized', this._onLayoutResized);

            return this;
        }

        setDocument(document) {
            this.document = document || null;
            this.selectionManager?.setDocument?.(document);
            this.render();
            return this;
        }

        setInteractive(state) {
            this.interactive = Boolean(state);

            if (this.root) {
                this.root.classList.toggle(
                    'is-disabled',
                    !this.interactive
                );
            }

            return this;
        }

        getSimulatedViewportSize() {
            // The authoring canvas represents the exact client viewport that the
            // standalone Game Window is using. Prefer the live popup dimensions.
            const orchestrator =
                window.PlayOrchestrator ||
                window.gamePlayOrchestrator ||
                window.__smPlayOrchestrator ||
                null;

            const gameWin =
                orchestrator?._gameWindow ||
                window.__smGameWindow ||
                null;

            if (gameWin && !gameWin.closed) {
                const width = Math.max(1, Math.floor(gameWin.innerWidth || 0));
                const height = Math.max(1, Math.floor(gameWin.innerHeight || 0));
                if (width > 100 && height > 100) {
                    return { width, height };
                }
            }

            // No Game Window yet: use the document's authored design resolution.
            const width = Math.max(1, Number(this.document?.canvas?.width ?? 1280));
            const height = Math.max(1, Number(this.document?.canvas?.height ?? 720));
            return { width, height };
        }

        syncToGameWindow(options = {}) {
            if (!this.root || !this.document) return this;

            // The editor simulation is a direct mirror of the live Game Viewport.
            // No reference-resolution conversion is performed here.
            const { width, height } = this.getSimulatedViewportSize();

            const previous = this._simulatedViewportSize || null;
            this._simulatedViewportSize = { width, height };

            this.canvas.style.width = `${width}px`;
            this.canvas.style.height = `${height}px`;

            if (
                options.fit === true ||
                !previous ||
                previous.width !== width ||
                previous.height !== height
            ) {
                this.fitToView();
            } else {
                this.applyViewTransform();
                this.updateSelectionOverlay();
            }

            return this;
        }

        computeWidgetBounds(widget, parentBounds) {
            const anchor = widget.anchor || { minX: 0, maxX: 0, minY: 0, maxY: 0 };
            const minX = Number(anchor.minX ?? 0);
            const maxX = Number(anchor.maxX ?? 0);
            const minY = Number(anchor.minY ?? 0);
            const maxY = Number(anchor.maxY ?? 0);

            const pw = parentBounds.width;
            const ph = parentBounds.height;

            let x, y, width, height;

            if (minX === maxX) {
                // Point Anchor (Left, Center, or Right)
                x = minX * pw + Number(widget.x ?? 0);
                width = Math.max(1, Number(widget.width ?? 100));
            } else {
                // Horizontal Stretch
                x = minX * pw + Number(widget.x ?? 0);
                width = Math.max(1, (maxX - minX) * pw + Number(widget.width ?? 0));
            }

            if (minY === maxY) {
                // Point Anchor (Top, Center, or Bottom)
                y = minY * ph + Number(widget.y ?? 0);
                height = Math.max(1, Number(widget.height ?? 40));
            } else {
                // Vertical Stretch
                y = minY * ph + Number(widget.y ?? 0);
                height = Math.max(1, (maxY - minY) * ph + Number(widget.height ?? 0));
            }

            return { x, y, width, height };
        }

        setZoom(value, focalPoint = null) {
            const previous = this.zoom;

            this.zoom = Math.max(
                this.minZoom,
                Math.min(this.maxZoom, Number(value) || 1)
            );

            if (focalPoint && previous !== this.zoom) {
                const ratio = this.zoom / previous;

                this.panX =
                    focalPoint.x -
                    (focalPoint.x - this.panX) * ratio;

                this.panY =
                    focalPoint.y -
                    (focalPoint.y - this.panY) * ratio;
            }

            this.applyViewTransform();
            this.updateSelectionOverlay();

            return this;
        }

        zoomIn() {
            return this.setZoom(this.zoom * 1.1);
        }

        zoomOut() {
            return this.setZoom(this.zoom / 1.1);
        }

        resetView() {
            this.zoom = 0.7;
            this.panX = 0;
            this.panY = 0;
            this.fitToView();
            return this;
        }

        fitToView() {
            if (!this.root || !this.document) return this;

            const { width, height } = this.getSimulatedViewportSize();
            const rect = this.root.getBoundingClientRect();

            const availableW = Math.max(1, rect.width - 80);
            const availableH = Math.max(1, rect.height - 80);

            this.zoom = Math.max(
                this.minZoom,
                Math.min(
                    this.maxZoom,
                    Math.min(availableW / width, availableH / height)
                )
            );

            this.panX = (rect.width - width * this.zoom) * 0.5;
            this.panY = (rect.height - height * this.zoom) * 0.5;

            this.applyViewTransform();
            this.updateSelectionOverlay();

            return this;
        }

        setGridSize(size) {
            this.gridSize = Math.max(1, Number(size) || 10);
            this.updateGrid();
            return this;
        }

        setSnapEnabled(state) {
            this.snapEnabled = Boolean(state);
            return this;
        }

        setGridVisible(state) {
            this.showGrid = Boolean(state);
            this.updateGrid();
            return this;
        }

        render() {
            if (!this.canvas) return this;

            this.canvas.replaceChildren();

            if (!this.document) {
                this.updateSelectionOverlay();
                return this;
            }

            // 1. Enforce active viewport simulation dimensions
            const { width: canvasWidth, height: canvasHeight } = this.getSimulatedViewportSize();
            this._simulatedViewportSize = { width: canvasWidth, height: canvasHeight };
            this.canvas.style.width = `${canvasWidth}px`;
            this.canvas.style.height = `${canvasHeight}px`;

            const canvasBounds = { x: 0, y: 0, width: canvasWidth, height: canvasHeight };

            // 2. Render widgets under computed anchor geometry
            for (const widget of this.document.rootWidgets || []) {
                this._renderWidget(widget, this.canvas, canvasBounds);
            }

            this.updateGrid();
            this.updateSelectionOverlay();

            // 3. Parallel sync to Game UI runtime layout engine
            if (window.gameUIRuntime?.running) {
                window.gameUIRuntime?.layoutEngine?.setViewportSize?.(canvasWidth, canvasHeight);
                window.gameUIRuntime?.layoutEngine?.setRuntimeViewportExact?.(true);
                window.gameUIRuntime?.refreshLayout?.(true);
            }

            return this;
        }

        refresh() {
            return this.render();
        }

        _renderWidget(widget, parentElement, parentBounds) {
            if (!widget || !parentElement) return;

            let element;

            if (typeof widget.createElement === 'function') {
                element = widget.createElement();
                // _element belongs to the authoring canvas. Runtime uses
                // _runtimeElement so both representations can coexist safely.
                widget._element = element;
                widget.applyElementState?.(element);
            } else {
                element = document.createElement('div');
                element.className = 'game-ui-widget';
            }

            element.dataset.widgetId = widget.id;
            element.dataset.widgetType = widget.type || 'widget';
            element.classList.add('game-ui-editor-widget');
            element.style.pointerEvents = 'auto';

            // Calculate anchor-based geometry
            const bounds = this.computeWidgetBounds(widget, parentBounds);
            element.style.position = 'absolute';
            element.style.left = `${bounds.x}px`;
            element.style.top = `${bounds.y}px`;
            element.style.width = `${bounds.width}px`;
            element.style.height = `${bounds.height}px`;

            parentElement.appendChild(element);

            for (const child of widget.children || []) {
                this._renderWidget(child, element, bounds);
            }
        }

        applyViewTransform() {
            if (!this.canvas || !this.overlay) return;

            const transform =
                `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;

            this.canvas.style.transformOrigin = 'top left';
            this.overlay.style.transformOrigin = 'top left';

            this.canvas.style.transform = transform;
            this.overlay.style.transform = transform;
        }

        updateGrid() {
            if (!this.canvas) return;

            if (!this.showGrid) {
                this.canvas.style.backgroundImage = 'none';
                return;
            }

            const size = Math.max(2, this.gridSize);

            this.canvas.style.backgroundImage = `
                linear-gradient(to right, var(--game-ui-grid-line, rgba(255,255,255,0.055)) 1px, transparent 1px),
                linear-gradient(to bottom, var(--game-ui-grid-line, rgba(255,255,255,0.055)) 1px, transparent 1px)
            `;

            this.canvas.style.backgroundSize = `${size}px ${size}px`;
        }

        updateSelectionOverlay() {
            if (!this.overlay) return;

            this.overlay.replaceChildren();
            this._selectionBoxes.clear();

            const selected =
                this.selectionManager?.getSelectedWidgets?.() || [];

            for (const widget of selected) {
                const box = document.createElement('div');
                box.className = 'game-ui-selection-box';
                box.dataset.widgetId = widget.id;

                const visualRect = this._getWidgetCanvasRect(widget);
                box.style.left = `${visualRect.x}px`;
                box.style.top = `${visualRect.y}px`;
                box.style.width = `${visualRect.width}px`;
                box.style.height = `${visualRect.height}px`;

                const handles = [
                    ['nw', 'resize-nw'],
                    ['n', 'resize-n'],
                    ['ne', 'resize-ne'],
                    ['e', 'resize-e'],
                    ['se', 'resize-se'],
                    ['s', 'resize-s'],
                    ['sw', 'resize-sw'],
                    ['w', 'resize-w']
                ];

                for (const [direction, className] of handles) {
                    const handle = document.createElement('span');
                    handle.className = `game-ui-resize-handle ${className}`;
                    handle.dataset.resize = direction;
                    handle.dataset.widgetId = widget.id;
                    box.appendChild(handle);
                }

                this.overlay.appendChild(box);
                this._selectionBoxes.set(widget.id, box);
            }
        }

        _getWidgetCanvasRect(widget) {
            const element = widget?._element;
            if (element && this.canvas?.contains(element) && element.style.display !== 'none') {
                const canvasRect = this.canvas.getBoundingClientRect();
                const elementRect = element.getBoundingClientRect();
                const scale = Math.max(0.000001, this.zoom);
                return {
                    x: (elementRect.left - canvasRect.left) / scale,
                    y: (elementRect.top - canvasRect.top) / scale,
                    width: elementRect.width / scale,
                    height: elementRect.height / scale
                };
            }

            const { width: cw, height: ch } = this.getSimulatedViewportSize();
            return this.computeWidgetBounds(widget, { width: cw, height: ch });
        }

        _onLayoutResized() {
            if (this._layoutRaf) cancelAnimationFrame(this._layoutRaf);
            this._layoutRaf = requestAnimationFrame(() => {
                this._layoutRaf = 0;
                this.applyViewTransform();
                this.updateSelectionOverlay();
            });
        }

        _onGameWindowResized() {
            this.syncToGameWindow({ fit: true });
            this.render();
        }

        handleContainerResize(options = {}) {
            if (options.fit === true) this.fitToView();
            else this._onLayoutResized();
            return this;
        }

        _onSelectionChanged() {
            this.updateSelectionOverlay();
        }

        _onPointerDown(event) {
            if (!this.interactive || !this.document) return;

            const handle = event.target.closest?.('[data-resize]');
            if (handle) {
                const widget = this.document.getWidget?.(handle.dataset.widgetId);
                if (widget) {
                    this._beginResize(widget, handle.dataset.resize, event);
                    event.preventDefault();
                    event.stopPropagation();
                }
                return;
            }

            const widgetElement = event.target.closest?.('[data-widget-id]');
            if (widgetElement && this.canvas.contains(widgetElement)) {
                const widget = this.document.getWidget?.(widgetElement.dataset.widgetId);
                if (!widget) return;

                this.selectionManager?.select?.(widget, {
                    additive: event.shiftKey || event.ctrlKey || event.metaKey,
                    toggle: event.ctrlKey || event.metaKey,
                    source: 'canvas'
                });

                this._beginDrag(widget, event);
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            if (event.target === this.root || event.target === this.viewport) {
                this.selectionManager?.clear?.({ source: 'canvas-background' });
                this._beginPan(event);
            }
        }

        _beginDrag(widget, event) {
            const selected =
                this.selectionManager?.getSelectedWidgets?.() || [widget];

            this._drag = {
                mode: 'widgets',
                startX: event.clientX,
                startY: event.clientY,
                widgets: selected.map(item => ({
                    widget: item,
                    x: Number(item.x ?? 0),
                    y: Number(item.y ?? 0)
                }))
            };
        }

        _beginResize(widget, direction, event) {
            this._resize = {
                widget,
                direction,
                startX: event.clientX,
                startY: event.clientY,
                x: Number(widget.x ?? 0),
                y: Number(widget.y ?? 0),
                width: Number(widget.width ?? 0),
                height: Number(widget.height ?? 0)
            };
        }

        _beginPan(event) {
            this._drag = {
                mode: 'pan',
                startX: event.clientX,
                startY: event.clientY,
                panX: this.panX,
                panY: this.panY
            };
        }

        _onPointerMove(event) {
            if (!this.interactive) return;

            if (this._resize) {
                this._updateResize(event);
                return;
            }

            if (!this._drag) return;

            if (this._drag.mode === 'pan') {
                this.panX = this._drag.panX + (event.clientX - this._drag.startX);
                this.panY = this._drag.panY + (event.clientY - this._drag.startY);
                this.applyViewTransform();
                return;
            }

            const dx = (event.clientX - this._drag.startX) / this.zoom;
            const dy = (event.clientY - this._drag.startY) / this.zoom;

            for (const item of this._drag.widgets) {
                let x = item.x + dx;
                let y = item.y + dy;

                if (this.snapEnabled) {
                    x = this._snap(x);
                    y = this._snap(y);
                }

                item.widget.x = x;
                item.widget.y = y;

                const parent = item.widget.parent;
                const bounds = parent
                    ? this.computeWidgetBounds(parent, this.getSimulatedViewportSize())
                    : this.getSimulatedViewportSize();

                const widgetBounds = this.computeWidgetBounds(item.widget, bounds);
                if (item.widget._element) {
                    item.widget._element.style.left = `${widgetBounds.x}px`;
                    item.widget._element.style.top = `${widgetBounds.y}px`;
                }
            }

            this.updateSelectionOverlay();
        }

        _updateResize(event) {
            const data = this._resize;
            const widget = data.widget;

            const dx = (event.clientX - data.startX) / this.zoom;
            const dy = (event.clientY - data.startY) / this.zoom;

            let x = data.x;
            let y = data.y;
            let width = data.width;
            let height = data.height;

            if (data.direction.includes('e')) width = data.width + dx;
            if (data.direction.includes('s')) height = data.height + dy;
            if (data.direction.includes('w')) {
                x = data.x + dx;
                width = data.width - dx;
            }
            if (data.direction.includes('n')) {
                y = data.y + dy;
                height = data.height - dy;
            }

            width = Math.max(8, width);
            height = Math.max(8, height);

            if (this.snapEnabled) {
                x = this._snap(x);
                y = this._snap(y);
                width = this._snap(width);
                height = this._snap(height);
            }

            widget.x = x;
            widget.y = y;
            widget.width = width;
            widget.height = height;

            const parent = widget.parent;
            const bounds = parent
                ? this.computeWidgetBounds(parent, this.getSimulatedViewportSize())
                : this.getSimulatedViewportSize();

            const widgetBounds = this.computeWidgetBounds(widget, bounds);
            if (widget._element) {
                widget._element.style.left = `${widgetBounds.x}px`;
                widget._element.style.top = `${widgetBounds.y}px`;
                widget._element.style.width = `${widgetBounds.width}px`;
                widget._element.style.height = `${widgetBounds.height}px`;
            }

            this.updateSelectionOverlay();
        }

        _onPointerUp() {
            const changed = Boolean(this._drag || this._resize);

            this._drag = null;
            this._resize = null;

            if (changed) {
                this.render();
                this.document?.touch?.();

                window.gameUIManager?.emit?.('editor-transform-complete', {
                    document: this.document,
                    selected: this.selectionManager?.getSelectedWidgets?.() || []
                });

                if (window.gameUIRuntime?.running) {
                    window.gameUIRuntime.refreshLayout?.(true);
                    window.SMGameUIPIEBridge?.refresh?.();
                }
            }
        }

        _onWheel(event) {
            if (!this.interactive) return;

            event.preventDefault();

            const rect = this.root.getBoundingClientRect();
            const focal = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            };

            const factor = event.deltaY > 0 ? 0.9 : 1.1;
            this.setZoom(this.zoom * factor, focal);
        }

        _snap(value) {
            return Math.round(value / this.gridSize) * this.gridSize;
        }

        destroy() {
            this.selectionManager?.off?.('selection-changed', this._onSelectionChanged);

            window.removeEventListener('pointermove', this._onPointerMove);
            window.removeEventListener('pointerup', this._onPointerUp);
            window.removeEventListener('sm:layout-resized', this._onLayoutResized);
            window.removeEventListener('sm:game-window-resized', this._onGameWindowResized);
            window.removeEventListener('sm:game-window-ready', this._onGameWindowResized);

            this._resizeObserver?.disconnect?.();
            this._resizeObserver = null;
            if (this._layoutRaf) cancelAnimationFrame(this._layoutRaf);
            this._layoutRaf = 0;

            this.root?.remove();
            this.root = null;
            this.viewport = null;
            this.canvas = null;
            this.overlay = null;
        }
    }

    window.GameUICanvasEditor = GameUICanvasEditor;
})();