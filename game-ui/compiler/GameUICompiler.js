/**
 * game-ui/compiler/GameUICompiler.js
 * ------------------------------------------------------------
 * Compiles an editor GameUIDocument into a lightweight runtime asset.
 *
 * Output format:
 * {
 *   format: "SM-GAME-UI-RUNTIME",
 *   version: 1,
 *   build: {...},
 *   document: {...}
 * }
 */
(function () {
    'use strict';

    const EDITOR_ONLY_KEYS = new Set([
        '_element',
        '_dirty',
        '_listeners',
        '_selection',
        '_editorState',
        '_editorMetadata',
        '_previewElement',
        '_runtimeElement',
        'parent'
    ]);

    class GameUICompiler {
        constructor(options = {}) {
            this.format = 'SM-GAME-UI-RUNTIME';
            this.version = 1;
            this.widgetLibrary =
                options.widgetLibrary ||
                window.uiWidgetLibrary ||
                null;
        }

        compile(uiDocument, options = {}) {
            if (!uiDocument) {
                throw new TypeError(
                    'GameUICompiler.compile(): uiDocument is required.'
                );
            }

            const errors = this.validate(uiDocument);

            if (errors.length) {
                const error = new Error(
                    `Game UI build failed with ${errors.length} validation error(s).`
                );

                error.validationErrors = errors;
                throw error;
            }

            const source =
                typeof uiDocument.toJSON === 'function'
                    ? uiDocument.toJSON()
                    : this._clone(uiDocument);

            const compiledDocument =
                this._sanitizeValue(source);

            this._normalizeDocument(
                compiledDocument,
                options
            );

            const payload = {
                format: this.format,
                version: this.version,

                build: {
                    engine: 'SM Engine',
                    target: options.target || 'game',
                    generatedAt: new Date().toISOString(),
                    sourceDocumentId:
                        uiDocument.id ||
                        compiledDocument.id ||
                        null,

                    sourceDocumentName:
                        uiDocument.name ||
                        compiledDocument.name ||
                        'Game UI'
                },

                document: compiledDocument
            };

            if (options.minify === true) {
                return JSON.stringify(payload);
            }

            if (options.asObject === true) {
                return payload;
            }

            return JSON.stringify(
                payload,
                null,
                options.pretty === false ? 0 : 2
            );
        }

        validate(uiDocument) {
            const errors = [];
            const ids = new Set();

            const roots =
                Array.isArray(uiDocument.rootWidgets)
                    ? uiDocument.rootWidgets
                    : Array.isArray(uiDocument.widgets)
                        ? uiDocument.widgets
                        : [];

            const visit = (widget, path = 'root') => {
                if (!widget || typeof widget !== 'object') {
                    errors.push({
                        path,
                        message: 'Invalid widget object.'
                    });
                    return;
                }

                if (!widget.id) {
                    errors.push({
                        path,
                        message: 'Widget is missing an id.'
                    });
                } else if (ids.has(widget.id)) {
                    errors.push({
                        path,
                        message:
                            `Duplicate widget id "${widget.id}".`
                    });
                } else {
                    ids.add(widget.id);
                }

                if (!widget.type) {
                    errors.push({
                        path,
                        message: 'Widget is missing a type.'
                    });
                }

                if (
                    Number(widget.width) < 0 ||
                    Number(widget.height) < 0
                ) {
                    errors.push({
                        path,
                        message:
                            'Widget width/height cannot be negative.'
                    });
                }

                const children =
                    Array.isArray(widget.children)
                        ? widget.children
                        : [];

                children.forEach(
                    (child, index) => {
                        visit(
                            child,
                            `${path}.children[${index}]`
                        );
                    }
                );
            };

            roots.forEach(
                (widget, index) => {
                    visit(
                        widget,
                        `rootWidgets[${index}]`
                    );
                }
            );

            return errors;
        }

        _normalizeDocument(doc, options = {}) {
            doc.version =
                Number(doc.version) || 1;

            doc.name =
                doc.name ||
                'Main Game UI';

            doc.canvas =
                doc.canvas || {};

            doc.canvas.referenceWidth =
                Number(
                    doc.canvas.referenceWidth ??
                    doc.canvas.width ??
                    1920
                );

            doc.canvas.referenceHeight =
                Number(
                    doc.canvas.referenceHeight ??
                    doc.canvas.height ??
                    1080
                );

            doc.canvas.width =
                Number(
                    doc.canvas.width ??
                    doc.canvas.referenceWidth
                );

            doc.canvas.height =
                Number(
                    doc.canvas.height ??
                    doc.canvas.referenceHeight
                );

            doc.canvas.scaleMode =
                doc.canvas.scaleMode ||
                'scale-with-screen';

            doc.rootWidgets =
                Array.isArray(doc.rootWidgets)
                    ? doc.rootWidgets
                    : Array.isArray(doc.widgets)
                        ? doc.widgets
                        : [];

            delete doc.widgets;

            if (options.stripMetadata !== false) {
                if (doc.metadata) {
                    const safeMetadata = {
                        author:
                            doc.metadata.author ||
                            undefined,

                        description:
                            doc.metadata.description ||
                            undefined
                    };

                    doc.metadata =
                        Object.fromEntries(
                            Object.entries(
                                safeMetadata
                            ).filter(
                                ([, value]) =>
                                    value !== undefined
                            )
                        );
                }
            }

            this._normalizeWidgetTree(
                doc.rootWidgets,
                null
            );

            return doc;
        }

        _normalizeWidgetTree(widgets, parentId) {
            if (!Array.isArray(widgets)) return;

            for (const widget of widgets) {
                if (!widget || typeof widget !== 'object') {
                    continue;
                }

                widget.parentId =
                    parentId || null;

                if (
                    widget.visible === undefined
                ) {
                    widget.visible = true;
                }

                if (
                    widget.enabled === undefined
                ) {
                    widget.enabled = true;
                }

                if (
                    widget.opacity === undefined
                ) {
                    widget.opacity = 1;
                }

                if (
                    !Array.isArray(widget.children)
                ) {
                    widget.children = [];
                }

                this._normalizeWidgetTree(
                    widget.children,
                    widget.id || null
                );
            }
        }

        _sanitizeValue(value, seen = new WeakSet()) {
            if (
                value == null ||
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean'
            ) {
                return value;
            }

            if (typeof value === 'function') {
                return undefined;
            }

            if (Array.isArray(value)) {
                return value
                    .map(item =>
                        this._sanitizeValue(
                            item,
                            seen
                        )
                    )
                    .filter(
                        item =>
                            item !== undefined
                    );
            }

            if (typeof value !== 'object') {
                return undefined;
            }

            if (seen.has(value)) {
                return undefined;
            }

            seen.add(value);

            const result = {};

            for (
                const [key, child]
                of Object.entries(value)
            ) {
                if (
                    EDITOR_ONLY_KEYS.has(key) ||
                    key.startsWith('_editor')
                ) {
                    continue;
                }

                const sanitized =
                    this._sanitizeValue(
                        child,
                        seen
                    );

                if (
                    sanitized !== undefined
                ) {
                    result[key] =
                        sanitized;
                }
            }

            seen.delete(value);

            return result;
        }

        _clone(value) {
            if (
                typeof structuredClone ===
                'function'
            ) {
                try {
                    return structuredClone(
                        value
                    );
                } catch (_) {}
            }

            return JSON.parse(
                JSON.stringify(value)
            );
        }
    }

    window.GameUICompiler =
        GameUICompiler;

    if (!window.gameUICompiler) {
        window.gameUICompiler =
            new GameUICompiler();
    }
})();