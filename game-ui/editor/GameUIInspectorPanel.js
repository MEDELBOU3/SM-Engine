/**
 * GAME-UI/editor/GameUIInspectorPanel.js
 * ------------------------------------------------------------
 * Property inspector for selected Game UI widget.
 * Features live parallel updates to both the Editor Canvas and Runtime.
 */
(function () {
    'use strict';

    class GameUIInspectorPanel {
        constructor(options = {}) {
            this.container = options.container || null;
            this.document = options.document || null;

            this.selectionManager =
                options.selectionManager ||
                window.gameUISelectionManager ||
                null;

            this.manager =
                options.manager ||
                window.gameUIManager ||
                null;

            this.root = null;

            this._onSelectionChanged =
                this._onSelectionChanged.bind(this);
        }

        init(container = this.container) {
            if (container) this.container = container;

            if (!this.container) {
                throw new Error('GameUIInspectorPanel.init(): container is required.');
            }

            if (!this.root) {
                this.root = document.createElement('div');
                this.root.className = 'game-ui-inspector-panel';
                this.container.appendChild(this.root);
            }

            this.selectionManager?.on?.(
                'selection-changed',
                this._onSelectionChanged
            );

            this.render();

            return this;
        }

        setDocument(document) {
            this.document = document || null;
            this.render();
            return this;
        }

        render() {
            if (!this.root) return this;

            this.root.replaceChildren();

            const title = document.createElement('div');
            title.className = 'game-ui-panel-title';
            title.textContent = 'Inspector';
            this.root.appendChild(title);

            const widget =
                this.selectionManager?.getPrimaryWidget?.();

            if (!widget) {
                const empty = document.createElement('div');
                empty.className = 'game-ui-empty-state';
                empty.textContent = 'Select a UI widget';
                this.root.appendChild(empty);
                return this;
            }

            this._section('Widget', [
                this._textField('Name', widget.name, value => {
                    widget.name = value || widget.name;
                    this._changed(widget);
                }),
                this._readonlyField('Type', widget.type),
                this._readonlyField('ID', widget.id)
            ]);

            this._section('Transform', [
                this._numberField('X', widget.x, value => {
                    widget.x = value;
                    this._changed(widget);
                }),
                this._numberField('Y', widget.y, value => {
                    widget.y = value;
                    this._changed(widget);
                }),
                this._numberField('Width', widget.width, value => {
                    widget.width = Math.max(0, value);
                    this._changed(widget);
                }),
                this._numberField('Height', widget.height, value => {
                    widget.height = Math.max(0, value);
                    this._changed(widget);
                }),
                this._numberField('Rotation', widget.rotation, value => {
                    widget.rotation = value;
                    this._changed(widget);
                }),
                this._numberField('Opacity', widget.opacity, value => {
                    widget.opacity = Math.max(0, Math.min(1, value));
                    this._changed(widget);
                }, 0.01)
            ]);

            this._section('State', [
                this._checkboxField('Visible', widget.visible !== false, value => {
                    widget.visible = value;
                    this._changed(widget);
                }),
                this._checkboxField('Enabled', widget.enabled !== false, value => {
                    widget.enabled = value;
                    this._changed(widget);
                }),
                this._checkboxField('Interactable', widget.interactable === true, value => {
                    widget.interactable = value;
                    this._changed(widget);
                })
            ]);

            this._section('Anchor', [
                this._numberField('Min X', widget.anchor?.minX ?? 0, value => {
                    widget.anchor ||= {};
                    widget.anchor.minX = value;
                    this._changed(widget);
                }, 0.01),
                this._numberField('Min Y', widget.anchor?.minY ?? 0, value => {
                    widget.anchor ||= {};
                    widget.anchor.minY = value;
                    this._changed(widget);
                }, 0.01),
                this._numberField('Max X', widget.anchor?.maxX ?? 0, value => {
                    widget.anchor ||= {};
                    widget.anchor.maxX = value;
                    this._changed(widget);
                }, 0.01),
                this._numberField('Max Y', widget.anchor?.maxY ?? 0, value => {
                    widget.anchor ||= {};
                    widget.anchor.maxY = value;
                    this._changed(widget);
                }, 0.01)
            ]);

            if (widget.type === 'text') {
                this._section('Text', [
                    this._textField('Text', widget.text ?? '', value => {
                        widget.text = value;
                        this._changed(widget);
                    }),
                    this._numberField('Font Size', widget.fontSize ?? 24, value => {
                        widget.fontSize = Math.max(1, value);
                        this._changed(widget);
                    }),
                    this._colorField('Color', widget.color ?? '#ffffff', value => {
                        widget.color = value;
                        this._changed(widget);
                    })
                ]);
            }

            if (widget.type === 'button') {
                this._section('Button', [
                    this._textField('Text', widget.text ?? '', value => {
                        widget.text = value;
                        this._changed(widget);
                    }),
                    this._colorField('Background', widget.background ?? '#22c55e', value => {
                        widget.background = value;
                        this._changed(widget);
                    }),
                    this._colorField('Text Color', widget.textColor ?? '#000000', value => {
                        widget.textColor = value;
                        this._changed(widget);
                    })
                ]);
            }

            if (widget.type === 'progressBar') {
                this._section('Progress', [
                    this._numberField('Min', widget.min ?? 0, value => {
                        widget.min = value;
                        this._changed(widget);
                    }),
                    this._numberField('Max', widget.max ?? 100, value => {
                        widget.max = value;
                        this._changed(widget);
                    }),
                    this._numberField('Value', widget.value ?? 100, value => {
                        widget.value = value;
                        this._changed(widget);
                    }),
                    this._colorField('Fill', widget.fillColor ?? '#22c55e', value => {
                        widget.fillColor = value;
                        this._changed(widget);
                    })
                ]);
            }

            return this;
        }

        _section(name, fields) {
            const section = document.createElement('div');
            section.className = 'game-ui-inspector-section';

            const header = document.createElement('div');
            header.className = 'game-ui-inspector-section-title';
            header.textContent = name;

            section.appendChild(header);

            for (const field of fields) {
                section.appendChild(field);
            }

            this.root.appendChild(section);
        }

        _field(labelText, control) {
            const row = document.createElement('label');
            row.className = 'game-ui-inspector-row';

            const label = document.createElement('span');
            label.textContent = labelText;

            row.appendChild(label);
            row.appendChild(control);

            return row;
        }

        _textField(label, value, onChange) {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = value ?? '';

            input.addEventListener('change', () => {
                onChange(input.value);
            });

            return this._field(label, input);
        }

        _readonlyField(label, value) {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = value ?? '';
            input.readOnly = true;

            return this._field(label, input);
        }

        _numberField(label, value, onChange, step = 1) {
            const input = document.createElement('input');
            input.type = 'number';
            input.step = String(step);
            input.value = Number(value ?? 0);

            input.addEventListener('change', () => {
                const number = Number(input.value);
                if (Number.isFinite(number)) {
                    onChange(number);
                }
            });

            return this._field(label, input);
        }

        _checkboxField(label, checked, onChange) {
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = Boolean(checked);

            input.addEventListener('change', () => {
                onChange(input.checked);
            });

            return this._field(label, input);
        }

        _colorField(label, value, onChange) {
            const input = document.createElement('input');
            input.type = 'color';
            input.value =
                /^#[0-9a-f]{6}$/i.test(value)
                    ? value
                    : '#ffffff';

            input.addEventListener('input', () => {
                onChange(input.value);
            });

            return this._field(label, input);
        }

        _changed(widget) {
            widget.markDirty?.();
            widget.applyElementState?.(widget._element);

            this.document?.touch?.();

            // 1. Re-render authoring canvas under updated anchor bounds
            window.gameUIEditorManager?.canvasEditor?.render?.();
            window.gameUIEditorManager?.canvasEditor?.updateSelectionOverlay?.();
            window.gameUIEditorManager?.hierarchyPanel?.render?.();

            // 2. Parallel sync to Game UI Runtime and popup window
            if (window.gameUIRuntime?.running) {
                window.gameUIRuntime.refreshLayout?.(true);
                window.SMGameUIPIEBridge?.refresh?.();
            }

            // 3. Schedule auto-save
            window.GameUIMode?.scheduleSave?.();

            window.gameUIManager?.emit?.(
                'widget-updated',
                {
                    document: this.document,
                    widget,
                    source: 'inspector'
                }
            );
        }

        _onSelectionChanged() {
            this.render();
        }

        destroy() {
            this.selectionManager?.off?.(
                'selection-changed',
                this._onSelectionChanged
            );

            this.root?.remove();
            this.root = null;
        }
    }

    window.GameUIInspectorPanel = GameUIInspectorPanel;
})();