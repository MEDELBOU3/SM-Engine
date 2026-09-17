/**
 * GAME-UI/input/UINavigationSystem.js
 * ------------------------------------------------------------
 * Keyboard + gamepad spatial navigation for Game UI.
 *
 * Supports:
 * - Arrow keys / WASD
 * - Tab / Shift+Tab
 * - Enter / Space submit through UIEventSystem
 * - Gamepad D-pad / analog stick
 * - Explicit navigation links per widget
 */
(function () {
    'use strict';

    class UINavigationSystem {
        constructor(options = {}) {
            this.document = options.document || null;
            this.focusManager = options.focusManager || window.uiFocusManager || null;
            this.eventSystem = options.eventSystem || window.uiEventSystem || null;

            this.enabled = options.enabled ?? true;
            this.wrap = options.wrap ?? true;

            this.gamepadEnabled = options.gamepadEnabled ?? true;
            this.gamepadIndex = options.gamepadIndex ?? null;
            this.axisThreshold = Number(options.axisThreshold ?? 0.6);
            this.repeatDelay = Number(options.repeatDelay ?? 260);
            this.repeatRate = Number(options.repeatRate ?? 120);

            this._bound = false;
            this._raf = 0;

            this._heldDirection = null;
            this._nextRepeatTime = 0;

            this._buttonState = {
                up: false,
                down: false,
                left: false,
                right: false,
                submit: false,
                cancel: false
            };

            this._onKeyDown = this._onKeyDown.bind(this);
            this._gamepadLoop = this._gamepadLoop.bind(this);
        }

        init() {
            if (this._bound) return this;

            window.addEventListener('keydown', this._onKeyDown, true);
            this._bound = true;

            if (this.gamepadEnabled) {
                this._raf = requestAnimationFrame(this._gamepadLoop);
            }

            return this;
        }

        destroy() {
            if (!this._bound) return;

            window.removeEventListener('keydown', this._onKeyDown, true);

            if (this._raf) {
                cancelAnimationFrame(this._raf);
                this._raf = 0;
            }

            this._bound = false;
        }

        setDocument(document) {
            this.document = document || null;
            this.focusManager?.setDocument?.(document);
            this.eventSystem?.setDocument?.(document);

            return this;
        }

        setEnabled(state) {
            this.enabled = Boolean(state);
            return this;
        }

        move(direction) {
            if (!this.enabled) return false;

            const current = this.focusManager?.getFocusedWidget?.();

            if (!current) {
                return this.focusManager?.focusFirst?.({
                    source: 'navigation'
                }) || false;
            }

            const explicit = this._getExplicitNavigationTarget(current, direction);

            if (explicit) {
                return this.focusManager.focus(explicit, {
                    source: 'explicit-navigation'
                });
            }

            const candidate = this.findBestCandidate(current, direction);

            if (candidate) {
                return this.focusManager.focus(candidate, {
                    source: 'spatial-navigation'
                });
            }

            if (this.wrap) {
                return this._wrap(direction);
            }

            return false;
        }

        next() {
            const widgets = this.focusManager?.getFocusableWidgets?.() || [];
            if (!widgets.length) return false;

            const current = this.focusManager.getFocusedWidget();
            const index = widgets.indexOf(current);

            const nextIndex = index === -1
                ? 0
                : (index + 1) % widgets.length;

            return this.focusManager.focus(widgets[nextIndex], {
                source: 'next-navigation'
            });
        }

        previous() {
            const widgets = this.focusManager?.getFocusableWidgets?.() || [];
            if (!widgets.length) return false;

            const current = this.focusManager.getFocusedWidget();
            const index = widgets.indexOf(current);

            const previousIndex = index === -1
                ? widgets.length - 1
                : (index - 1 + widgets.length) % widgets.length;

            return this.focusManager.focus(widgets[previousIndex], {
                source: 'previous-navigation'
            });
        }

        findBestCandidate(current, direction) {
            const widgets = this.focusManager?.getFocusableWidgets?.() || [];

            if (!current || widgets.length <= 1) return null;

            const currentCenter = this._getCenter(current);

            let best = null;
            let bestScore = Infinity;

            for (const candidate of widgets) {
                if (candidate === current) continue;

                const center = this._getCenter(candidate);

                const dx = center.x - currentCenter.x;
                const dy = center.y - currentCenter.y;

                if (!this._isInDirection(dx, dy, direction)) {
                    continue;
                }

                const distance = Math.hypot(dx, dy);
                if (distance <= 0.0001) continue;

                const primary = this._primaryDistance(dx, dy, direction);
                const secondary = this._secondaryDistance(dx, dy, direction);

                const score =
                    primary +
                    secondary * 2.25 +
                    distance * 0.05;

                if (score < bestScore) {
                    bestScore = score;
                    best = candidate;
                }
            }

            return best;
        }

        submit() {
            return this.eventSystem?.submitFocused?.() || false;
        }

        cancel() {
            return this.eventSystem?.cancelFocused?.() || false;
        }

        _getExplicitNavigationTarget(widget, direction) {
            const navigation = widget?.navigation;
            if (!navigation) return null;

            const targetId = navigation[direction];
            if (!targetId) return null;

            return this.document?.getWidget?.(targetId) || null;
        }

        _wrap(direction) {
            const widgets = this.focusManager?.getFocusableWidgets?.() || [];
            if (!widgets.length) return false;

            let candidate = null;

            if (direction === 'up') {
                candidate = widgets.reduce((best, widget) => {
                    const y = this._getCenter(widget).y;
                    const bestY = best ? this._getCenter(best).y : -Infinity;
                    return y > bestY ? widget : best;
                }, null);
            }

            if (direction === 'down') {
                candidate = widgets.reduce((best, widget) => {
                    const y = this._getCenter(widget).y;
                    const bestY = best ? this._getCenter(best).y : Infinity;
                    return y < bestY ? widget : best;
                }, null);
            }

            if (direction === 'left') {
                candidate = widgets.reduce((best, widget) => {
                    const x = this._getCenter(widget).x;
                    const bestX = best ? this._getCenter(best).x : -Infinity;
                    return x > bestX ? widget : best;
                }, null);
            }

            if (direction === 'right') {
                candidate = widgets.reduce((best, widget) => {
                    const x = this._getCenter(widget).x;
                    const bestX = best ? this._getCenter(best).x : Infinity;
                    return x < bestX ? widget : best;
                }, null);
            }

            return candidate
                ? this.focusManager.focus(candidate, {
                    source: 'wrapped-navigation'
                })
                : false;
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

            const key = event.key.toLowerCase();

            let handled = true;

            if (key === 'arrowup' || key === 'w') {
                this.move('up');
            } else if (key === 'arrowdown' || key === 's') {
                this.move('down');
            } else if (key === 'arrowleft' || key === 'a') {
                this.move('left');
            } else if (key === 'arrowright' || key === 'd') {
                this.move('right');
            } else if (key === 'tab') {
                if (event.shiftKey) this.previous();
                else this.next();
            } else {
                handled = false;
            }

            if (handled) {
                event.preventDefault();
            }
        }

        _gamepadLoop(now) {
            if (this.enabled && this.gamepadEnabled) {
                this._pollGamepad(now);
            }

            this._raf = requestAnimationFrame(this._gamepadLoop);
        }

        _pollGamepad(now) {
            const gamepads = navigator.getGamepads?.();
            if (!gamepads) return;

            let gamepad = null;

            if (this.gamepadIndex != null) {
                gamepad = gamepads[this.gamepadIndex] || null;
            } else {
                gamepad = [...gamepads].find(Boolean) || null;
            }

            if (!gamepad) return;

            const axisX = gamepad.axes?.[0] || 0;
            const axisY = gamepad.axes?.[1] || 0;

            const up =
                Boolean(gamepad.buttons?.[12]?.pressed) ||
                axisY < -this.axisThreshold;

            const down =
                Boolean(gamepad.buttons?.[13]?.pressed) ||
                axisY > this.axisThreshold;

            const left =
                Boolean(gamepad.buttons?.[14]?.pressed) ||
                axisX < -this.axisThreshold;

            const right =
                Boolean(gamepad.buttons?.[15]?.pressed) ||
                axisX > this.axisThreshold;

            const submit =
                Boolean(gamepad.buttons?.[0]?.pressed);

            const cancel =
                Boolean(gamepad.buttons?.[1]?.pressed);

            const direction =
                up ? 'up' :
                down ? 'down' :
                left ? 'left' :
                right ? 'right' :
                null;

            if (direction) {
                if (this._heldDirection !== direction) {
                    this._heldDirection = direction;
                    this._nextRepeatTime = now + this.repeatDelay;
                    this.move(direction);
                } else if (now >= this._nextRepeatTime) {
                    this._nextRepeatTime = now + this.repeatRate;
                    this.move(direction);
                }
            } else {
                this._heldDirection = null;
                this._nextRepeatTime = 0;
            }

            if (submit && !this._buttonState.submit) {
                this.submit();
            }

            if (cancel && !this._buttonState.cancel) {
                this.cancel();
            }

            this._buttonState = {
                up,
                down,
                left,
                right,
                submit,
                cancel
            };
        }

        _getCenter(widget) {
            const rect = widget._layoutRect || {
                x: Number(widget.x ?? 0),
                y: Number(widget.y ?? 0),
                width: Number(widget.width ?? 0),
                height: Number(widget.height ?? 0)
            };

            return {
                x: rect.x + rect.width * 0.5,
                y: rect.y + rect.height * 0.5
            };
        }

        _isInDirection(dx, dy, direction) {
            if (direction === 'up') return dy < -1;
            if (direction === 'down') return dy > 1;
            if (direction === 'left') return dx < -1;
            if (direction === 'right') return dx > 1;

            return false;
        }

        _primaryDistance(dx, dy, direction) {
            if (direction === 'up' || direction === 'down') {
                return Math.abs(dy);
            }

            return Math.abs(dx);
        }

        _secondaryDistance(dx, dy, direction) {
            if (direction === 'up' || direction === 'down') {
                return Math.abs(dx);
            }

            return Math.abs(dy);
        }
    }

    window.UINavigationSystem = UINavigationSystem;

    if (!window.uiNavigationSystem) {
        window.uiNavigationSystem = new UINavigationSystem();
        window.uiNavigationSystem.init();
    }
})();