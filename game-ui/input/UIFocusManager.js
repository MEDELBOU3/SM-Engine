/**
 * GAME-UI/input/UIFocusManager.js
 * ------------------------------------------------------------
 * Tracks focused Game UI widget and visual focus state.
 */
(function () {
    'use strict';

    class UIFocusManager {
        constructor(options = {}) {
            this.document = options.document || null;
            this.focusedWidget = null;
            this.enabled = options.enabled ?? true;
            this.focusClass = options.focusClass || 'game-ui-focused';

            this._listeners = new Map();
        }

        setDocument(document) {
            if (this.document === document) return this;

            this.blur({
                reason: 'document-changed'
            });

            this.document = document || null;
            return this;
        }

        setEnabled(state) {
            this.enabled = Boolean(state);

            if (!this.enabled) {
                this.blur({
                    reason: 'disabled'
                });
            }

            return this;
        }

        focus(widgetOrId, options = {}) {
            if (!this.enabled) return false;

            const widget = this.resolveWidget(widgetOrId);

            if (!widget) return false;
            if (widget.visible === false) return false;
            if (widget.enabled === false) return false;
            if (widget.interactable === false && options.force !== true) return false;

            if (this.focusedWidget === widget) return true;

            const previous = this.focusedWidget;

            if (previous) {
                this._applyFocusVisual(previous, false);
                this.emit('blur', {
                    widget: previous,
                    nextWidget: widget,
                    reason: options.reason || 'focus-changed'
                });
            }

            this.focusedWidget = widget;
            this._applyFocusVisual(widget, true);

            if (widget._element && typeof widget._element.focus === 'function') {
                try {
                    widget._element.focus({
                        preventScroll: true
                    });
                } catch (_) {
                    try {
                        widget._element.focus();
                    } catch (_) {}
                }
            }

            this.emit('focus', {
                widget,
                previousWidget: previous,
                source: options.source || 'system',
                nativeEvent: options.nativeEvent || null
            });

            return true;
        }

        blur(options = {}) {
            if (!this.focusedWidget) return false;

            const previous = this.focusedWidget;

            this._applyFocusVisual(previous, false);
            this.focusedWidget = null;

            if (
                previous._element &&
                document.activeElement === previous._element &&
                typeof previous._element.blur === 'function'
            ) {
                try {
                    previous._element.blur();
                } catch (_) {}
            }

            this.emit('blur', {
                widget: previous,
                nextWidget: null,
                reason: options.reason || 'manual'
            });

            return true;
        }

        getFocusedWidget() {
            return this.focusedWidget;
        }

        getFocusedWidgetId() {
            return this.focusedWidget?.id || null;
        }

        isFocused(widgetOrId) {
            const widget = this.resolveWidget(widgetOrId);
            return Boolean(widget && widget === this.focusedWidget);
        }

        resolveWidget(widgetOrId) {
            if (!widgetOrId) return null;

            if (typeof widgetOrId === 'string') {
                return this.document?.getWidget?.(widgetOrId) || null;
            }

            return widgetOrId;
        }

        focusFirst(options = {}) {
            const widgets = this.getFocusableWidgets();

            if (!widgets.length) return false;

            return this.focus(widgets[0], {
                ...options,
                source: options.source || 'focus-first'
            });
        }

        focusLast(options = {}) {
            const widgets = this.getFocusableWidgets();

            if (!widgets.length) return false;

            return this.focus(widgets[widgets.length - 1], {
                ...options,
                source: options.source || 'focus-last'
            });
        }

        getFocusableWidgets() {
            if (!this.document) return [];

            const widgets = [];

            this.document.traverse?.((widget) => {
                if (
                    widget.visible !== false &&
                    widget.enabled !== false &&
                    widget.interactable === true
                ) {
                    widgets.push(widget);
                }
            });

            widgets.sort((a, b) => {
                const aOrder = Number(a.navigationOrder ?? a.tabIndex ?? a.zIndex ?? 0);
                const bOrder = Number(b.navigationOrder ?? b.tabIndex ?? b.zIndex ?? 0);

                if (aOrder !== bOrder) return aOrder - bOrder;

                const ay = a._layoutRect?.y ?? a.y ?? 0;
                const by = b._layoutRect?.y ?? b.y ?? 0;

                if (ay !== by) return ay - by;

                const ax = a._layoutRect?.x ?? a.x ?? 0;
                const bx = b._layoutRect?.x ?? b.x ?? 0;

                return ax - bx;
            });

            return widgets;
        }

        on(eventName, callback) {
            if (typeof callback !== 'function') return () => {};

            if (!this._listeners.has(eventName)) {
                this._listeners.set(eventName, new Set());
            }

            this._listeners.get(eventName).add(callback);

            return () => this.off(eventName, callback);
        }

        off(eventName, callback) {
            const group = this._listeners.get(eventName);

            if (!group) return false;

            const removed = group.delete(callback);

            if (!group.size) {
                this._listeners.delete(eventName);
            }

            return removed;
        }

        emit(eventName, payload = {}) {
            const group = this._listeners.get(eventName);

            if (!group) return payload;

            for (const callback of [...group]) {
                try {
                    callback(payload);
                } catch (error) {
                    console.error(
                        `[UIFocusManager] Listener error for "${eventName}".`,
                        error
                    );
                }
            }

            return payload;
        }

        _applyFocusVisual(widget, focused) {
            const element = widget?._element;

            if (!element) return;

            if (focused) {
                element.classList.add(this.focusClass);
                element.setAttribute('data-ui-focused', 'true');

                if (!element.hasAttribute('tabindex')) {
                    element.setAttribute('tabindex', '0');
                }
            } else {
                element.classList.remove(this.focusClass);
                element.removeAttribute('data-ui-focused');
            }
        }
    }

    window.UIFocusManager = UIFocusManager;

    if (!window.uiFocusManager) {
        window.uiFocusManager = new UIFocusManager();
    }
})();