/**
 * GAME-UI/editor/GameUIHierarchyPanel.js
 * ------------------------------------------------------------
 * Widget hierarchy tree for Game UI editor.
 */
(function () {
    'use strict';

    class GameUIHierarchyPanel {
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
                throw new Error('GameUIHierarchyPanel.init(): container is required.');
            }

            if (!this.root) {
                this.root = document.createElement('div');
                this.root.className = 'game-ui-hierarchy-panel';
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

            const header = document.createElement('div');
            header.className = 'game-ui-panel-title';
            header.textContent = 'Hierarchy';
            this.root.appendChild(header);

            const tree = document.createElement('div');
            tree.className = 'game-ui-hierarchy-tree';
            this.root.appendChild(tree);

            if (!this.document) {
                const empty = document.createElement('div');
                empty.className = 'game-ui-empty-state';
                empty.textContent = 'No UI document';
                tree.appendChild(empty);
                return this;
            }

            for (const widget of this.document.rootWidgets || []) {
                tree.appendChild(
                    this._createNode(widget, 0)
                );
            }

            return this;
        }

        _createNode(widget, depth) {
            const wrapper = document.createElement('div');
            wrapper.className = 'game-ui-hierarchy-node-wrap';

            const row = document.createElement('div');
            row.className = 'game-ui-hierarchy-node';
            row.dataset.widgetId = widget.id;
            row.style.paddingLeft = `${8 + depth * 14}px`;

            if (this.selectionManager?.isSelected?.(widget.id)) {
                row.classList.add('is-selected');
            }

            const arrow = document.createElement('span');
            arrow.className = 'game-ui-hierarchy-arrow';
            arrow.textContent =
                widget.children?.length
                    ? '▾'
                    : '';

            const icon = document.createElement('span');
            icon.className = 'game-ui-hierarchy-icon';
            icon.textContent = this._getIcon(widget.type);

            const label = document.createElement('span');
            label.className = 'game-ui-hierarchy-label';
            label.textContent =
                widget.name ||
                widget.type ||
                'Widget';

            row.appendChild(arrow);
            row.appendChild(icon);
            row.appendChild(label);

            row.addEventListener('click', event => {
                this.selectionManager?.select?.(
                    widget,
                    {
                        additive:
                            event.shiftKey ||
                            event.ctrlKey ||
                            event.metaKey,

                        toggle:
                            event.ctrlKey ||
                            event.metaKey,

                        source: 'hierarchy'
                    }
                );
            });

            row.addEventListener('dblclick', () => {
                label.contentEditable = 'true';
                label.focus();

                const range = document.createRange();
                range.selectNodeContents(label);

                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            });

            label.addEventListener('blur', () => {
                label.contentEditable = 'false';

                const name = label.textContent.trim();

                if (name) {
                    widget.name = name;
                    this.document?.touch?.();
                } else {
                    label.textContent =
                        widget.name ||
                        widget.type ||
                        'Widget';
                }
            });

            wrapper.appendChild(row);

            for (const child of widget.children || []) {
                wrapper.appendChild(
                    this._createNode(child, depth + 1)
                );
            }

            return wrapper;
        }

        _getIcon(type) {
            const icons = {
                panel: '▣',
                text: 'T',
                image: '▧',
                button: '▤',
                progressBar: '▬',
                widget: '◇'
            };

            return icons[type] || '◇';
        }

        _onSelectionChanged() {
            if (!this.root) return;

            this.root
                .querySelectorAll('[data-widget-id]')
                .forEach(row => {
                    row.classList.toggle(
                        'is-selected',
                        this.selectionManager?.isSelected?.(
                            row.dataset.widgetId
                        )
                    );
                });
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

    window.GameUIHierarchyPanel =
        GameUIHierarchyPanel;
})();