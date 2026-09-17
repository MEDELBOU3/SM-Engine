/**
 * GAME-UI/input/UIEventSystem.js
 * ------------------------------------------------------------
 * Central event system for runtime Game UI interaction.
 *
 * Responsibilities:
 * - Pointer/mouse/touch event routing
 * - Click / hover / press / release events
 * - Keyboard submit / cancel actions
 * - Widget event descriptor dispatch
 * - Integration with UIFocusManager
 */
(function () {
    'use strict';

    class UIEventSystem {
        constructor(options = {}) {
            this.rootElement = options.rootElement || null;
            this.document = options.document || null;
            this.focusManager = options.focusManager || window.uiFocusManager || null;

            this.enabled = options.enabled ?? true;
            this.capturePointer = options.capturePointer ?? true;

            this.hoveredWidget = null;
            this.pressedWidget = null;
            this.pointerId = null;

            this._listeners = new Map();
            this._bound = false;

            this._onPointerDown = this._onPointerDown.bind(this);
            this._onPointerUp = this._onPointerUp.bind(this);
            this._onPointerMove = this._onPointerMove.bind(this);
            this._onPointerLeave = this._onPointerLeave.bind(this);
            this._onClick = this._onClick.bind(this);
            this._onKeyDown = this._onKeyDown.bind(this);
            this._onContextMenu = this._onContextMenu.bind(this);
        }

        init(rootElement = this.rootElement) {
            if (rootElement) {
                this.setRootElement(rootElement);
            }

            if (!this.rootElement || this._bound) {
                return this;
            }

            this.rootElement.addEventListener('pointerdown', this._onPointerDown, true);
            this.rootElement.addEventListener('pointerup', this._onPointerUp, true);
            this.rootElement.addEventListener('pointermove', this._onPointerMove, true);
            this.rootElement.addEventListener('pointerleave', this._onPointerLeave, true);
            this.rootElement.addEventListener('click', this._onClick, true);
            this.rootElement.addEventListener('contextmenu', this._onContextMenu, true);

            window.addEventListener('keydown', this._onKeyDown, true);

            this._bound = true;
            return this;
        }

        destroy() {
            if (!this._bound) return;

            this.rootElement?.removeEventListener('pointerdown', this._onPointerDown, true);
            this.rootElement?.removeEventListener('pointerup', this._onPointerUp, true);
            this.rootElement?.removeEventListener('pointermove', this._onPointerMove, true);
            this.rootElement?.removeEventListener('pointerleave', this._onPointerLeave, true);
            this.rootElement?.removeEventListener('click', this._onClick, true);
            this.rootElement?.removeEventListener('contextmenu', this._onContextMenu, true);

            window.removeEventListener('keydown', this._onKeyDown, true);

            this._bound = false;
            this.hoveredWidget = null;
            this.pressedWidget = null;
            this.pointerId = null;
        }

        setRootElement(element) {
            if (this.rootElement === element) return this;

            if (this._bound) {
                this.destroy();
            }

            this.rootElement = element || null;

            if (this.rootElement) {
                this.init();
            }

            return this;
        }

        setDocument(document) {
            this.document = document || null;
            return this;
        }

        setEnabled(state) {
            this.enabled = Boolean(state);

            if (!this.enabled) {
                this.hoveredWidget = null;
                this.pressedWidget = null;
            }

            return this;
        }

        resolveWidgetFromElement(element) {
            if (!element) return null;

            const widgetElement = element.closest?.('[data-widget-id]');
            if (!widgetElement) return null;

            const widgetId = widgetElement.dataset.widgetId;
            if (!widgetId) return null;

            return this.document?.getWidget?.(widgetId) || null;
        }

        emitToWidget(widget, eventName, nativeEvent = null, extra = {}) {
            if (!widget || !eventName) return false;
            if (widget.enabled === false) return false;

            const payload = {
                type: eventName,
                widget,
                widgetId: widget.id,
                nativeEvent,
                eventSystem: this,
                timestamp: performance?.now?.() ?? Date.now(),
                ...extra
            };

            this.emit(eventName, payload);

            const descriptor = widget.events?.[eventName];

            if (descriptor) {
                this.executeDescriptor(widget, eventName, descriptor, payload);
            }

            const methodName = this._eventToMethod(eventName);
            if (methodName && typeof widget[methodName] === 'function') {
                try {
                    widget[methodName](payload);
                } catch (error) {
                    console.error(
                        `[UIEventSystem] Widget method "${methodName}" failed.`,
                        error
                    );
                }
            }

            return true;
        }

        executeDescriptor(widget, eventName, descriptor, payload = {}) {
            if (!descriptor) return false;

            if (typeof descriptor === 'function') {
                descriptor(payload);
                return true;
            }

            if (typeof descriptor === 'string') {
                const fn = this._resolveGlobalFunction(descriptor);

                if (typeof fn === 'function') {
                    fn(payload, widget);
                    return true;
                }

                return false;
            }

            if (typeof descriptor !== 'object') return false;

            const action = descriptor.action || descriptor.type;

            if (action === 'call') {
                const fn = this._resolveGlobalFunction(descriptor.target || descriptor.function);

                if (typeof fn === 'function') {
                    fn(
                        ...(Array.isArray(descriptor.args) ? descriptor.args : []),
                        payload,
                        widget
                    );
                    return true;
                }
            }

            if (action === 'set') {
                const target = this._resolveGlobalObject(descriptor.target);
                const property = descriptor.property;

                if (target && property) {
                    target[property] = descriptor.value;
                    return true;
                }
            }

            if (action === 'toggle') {
                const target = this._resolveGlobalObject(descriptor.target);
                const property = descriptor.property;

                if (target && property) {
                    target[property] = !target[property];
                    return true;
                }
            }

            if (action === 'emit') {
                const event = descriptor.event || descriptor.name;

                if (event) {
                    window.dispatchEvent(new CustomEvent(event, {
                        detail: {
                            widget,
                            payload,
                            data: descriptor.data
                        }
                    }));
                    return true;
                }
            }

            console.warn(
                `[UIEventSystem] Unsupported event descriptor for "${eventName}".`,
                descriptor
            );

            return false;
        }

        submitFocused(nativeEvent = null) {
            const widget = this.focusManager?.getFocusedWidget?.();
            if (!widget) return false;

            this.emitToWidget(widget, 'submit', nativeEvent);

            const element = widget._element;
            if (element?.click && widget.enabled !== false) {
                element.click();
            }

            return true;
        }

        cancelFocused(nativeEvent = null) {
            const widget = this.focusManager?.getFocusedWidget?.();

            if (widget) {
                this.emitToWidget(widget, 'cancel', nativeEvent);
            }

            this.emit('cancel', {
                widget,
                nativeEvent,
                eventSystem: this
            });

            return true;
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

            if (group) {
                for (const callback of [...group]) {
                    try {
                        callback(payload);
                    } catch (error) {
                        console.error(
                            `[UIEventSystem] Listener error for "${eventName}".`,
                            error
                        );
                    }
                }
            }

            return payload;
        }

        _onPointerDown(event) {
            if (!this.enabled) return;

            const widget = this.resolveWidgetFromElement(event.target);
            if (!widget || widget.enabled === false || widget.interactable === false) return;

            this.pressedWidget = widget;
            this.pointerId = event.pointerId;

            if (this.capturePointer && event.target?.setPointerCapture) {
                try {
                    event.target.setPointerCapture(event.pointerId);
                } catch (_) {}
            }

            this.focusManager?.focus?.(widget, {
                source: 'pointer',
                nativeEvent: event
            });

            this.emitToWidget(widget, 'pointerdown', event, {
                x: event.clientX,
                y: event.clientY,
                button: event.button
            });
        }

        _onPointerUp(event) {
            if (!this.enabled) return;

            const widget = this.resolveWidgetFromElement(event.target) || this.pressedWidget;

            if (widget) {
                this.emitToWidget(widget, 'pointerup', event, {
                    x: event.clientX,
                    y: event.clientY,
                    button: event.button
                });
            }

            this.pressedWidget = null;
            this.pointerId = null;
        }

        _onPointerMove(event) {
            if (!this.enabled) return;

            const widget = this.resolveWidgetFromElement(event.target);

            if (widget !== this.hoveredWidget) {
                if (this.hoveredWidget) {
                    this.emitToWidget(this.hoveredWidget, 'pointerleave', event);
                }

                this.hoveredWidget = widget;

                if (widget) {
                    this.emitToWidget(widget, 'pointerenter', event);
                }
            }

            if (widget) {
                this.emitToWidget(widget, 'pointermove', event, {
                    x: event.clientX,
                    y: event.clientY
                });
            }
        }

        _onPointerLeave(event) {
            if (!this.enabled) return;

            if (this.hoveredWidget) {
                this.emitToWidget(this.hoveredWidget, 'pointerleave', event);
                this.hoveredWidget = null;
            }
        }

        _onClick(event) {
            if (!this.enabled) return;

            const widget = this.resolveWidgetFromElement(event.target);
            if (!widget || widget.enabled === false || widget.interactable === false) return;

            this.emitToWidget(widget, 'click', event, {
                x: event.clientX,
                y: event.clientY,
                button: event.button
            });
        }

        _onContextMenu(event) {
            if (!this.enabled) return;

            const widget = this.resolveWidgetFromElement(event.target);
            if (!widget) return;

            this.emitToWidget(widget, 'contextmenu', event, {
                x: event.clientX,
                y: event.clientY
            });
        }

        _onKeyDown(event) {
            if (!this.enabled) return;

            const active = document.activeElement;
            const isTextInput =
                active &&
                (
                    active.tagName === 'INPUT' ||
                    active.tagName === 'TEXTAREA' ||
                    active.isContentEditable
                );

            if (isTextInput) return;

            if (event.key === 'Enter' || event.key === ' ') {
                if (this.submitFocused(event)) {
                    event.preventDefault();
                }
            }

            if (event.key === 'Escape') {
                this.cancelFocused(event);
            }
        }

        _eventToMethod(eventName) {
            const map = {
                click: 'onClick',
                submit: 'onSubmit',
                cancel: 'onCancel',
                pointerdown: 'onPointerDown',
                pointerup: 'onPointerUp',
                pointerenter: 'onPointerEnter',
                pointerleave: 'onPointerLeave',
                pointermove: 'onPointerMove',
                contextmenu: 'onContextMenu'
            };

            return map[eventName] || null;
        }

        _resolveGlobalFunction(path) {
            if (!path || typeof path !== 'string') return null;

            const parts = path.split('.');
            let current = window;

            for (const part of parts) {
                if (current == null) return null;
                current = current[part];
            }

            return typeof current === 'function' ? current : null;
        }

        _resolveGlobalObject(path) {
            if (!path || typeof path !== 'string') return null;

            const parts = path.split('.');
            let current = window;

            for (const part of parts) {
                if (current == null) return null;
                current = current[part];
            }

            return current;
        }
    }

    window.UIEventSystem = UIEventSystem;

    if (!window.uiEventSystem) {
        window.uiEventSystem = new UIEventSystem();
    }
})();