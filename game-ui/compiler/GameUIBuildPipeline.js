/**
 * game-ui/compiler/GameUIBuildPipeline.js
 * ------------------------------------------------------------
 * High-level Save / Build pipeline for Game UI assets.
 */
(function () {
    'use strict';

    class GameUIBuildPipeline {
        constructor(options = {}) {
            this.compiler =
                options.compiler ||
                window.gameUICompiler ||
                null;

            this.serializer =
                options.serializer ||
                window.gameUISerializer ||
                null;
        }

        saveEditorDocument(
            uiDocument,
            filename = null
        ) {
            if (!uiDocument) {
                throw new TypeError(
                    'saveEditorDocument(): uiDocument is required.'
                );
            }

            const name =
                filename ||
                this._makeFileName(
                    uiDocument.name ||
                    'main-game-ui',
                    '.gameui.json'
                );

            let text = null;

            if (this.serializer?.serialize) {
                text =
                    this.serializer.serialize(
                        uiDocument,
                        {
                            pretty: true
                        }
                    );
            } else {
                const data =
                    typeof uiDocument.toJSON ===
                    'function'
                        ? uiDocument.toJSON()
                        : uiDocument;

                text =
                    JSON.stringify(
                        data,
                        null,
                        2
                    );
            }

            this.downloadText(
                text,
                name,
                'application/json'
            );

            return {
                filename: name,
                text
            };
        }

        build(
            uiDocument,
            options = {}
        ) {
            if (!this.compiler) {
                throw new Error(
                    'GameUIBuildPipeline: GameUICompiler is unavailable.'
                );
            }

            const filename =
                options.filename ||
                this._makeFileName(
                    uiDocument?.name ||
                    'main-game-ui',
                    '.ui.json'
                );

            const text =
                this.compiler.compile(
                    uiDocument,
                    {
                        pretty:
                            options.pretty !== false,

                        minify:
                            options.minify === true,

                        target:
                            options.target ||
                            'game',

                        stripMetadata:
                            options.stripMetadata !==
                            false
                    }
                );

            if (
                options.download !== false
            ) {
                this.downloadText(
                    text,
                    filename,
                    'application/json'
                );
            }

            window.dispatchEvent(
                new CustomEvent(
                    'sm:game-ui-built',
                    {
                        detail: {
                            filename,
                            text,
                            document:
                                uiDocument
                        }
                    }
                )
            );

            return {
                filename,
                text
            };
        }

        buildActiveDocument(
            options = {}
        ) {
            const uiDocument =
                window.gameUIManager
                    ?.activeDocument;

            if (!uiDocument) {
                throw new Error(
                    'No active Game UI document.'
                );
            }

            return this.build(
                uiDocument,
                options
            );
        }

        downloadText(
            text,
            filename,
            mimeType =
                'text/plain'
        ) {
            const blob =
                new Blob(
                    [text],
                    {
                        type: mimeType
                    }
                );

            const url =
                URL.createObjectURL(blob);

            const anchor =
                window.document
                    .createElement('a');

            anchor.href = url;
            anchor.download = filename;
            anchor.style.display = 'none';

            window.document
                .body
                .appendChild(anchor);

            anchor.click();
            anchor.remove();

            setTimeout(
                () =>
                    URL.revokeObjectURL(
                        url
                    ),
                0
            );

            return true;
        }

        _makeFileName(
            value,
            suffix
        ) {
            const base =
                String(value || 'game-ui')
                    .trim()
                    .toLowerCase()
                    .replace(
                        /[^a-z0-9]+/g,
                        '-'
                    )
                    .replace(
                        /^-+|-+$/g,
                        ''
                    ) ||
                'game-ui';

            return `${base}${suffix}`;
        }
    }

    window.GameUIBuildPipeline =
        GameUIBuildPipeline;

    if (!window.gameUIBuildPipeline) {
        window.gameUIBuildPipeline =
            new GameUIBuildPipeline();
    }
})();