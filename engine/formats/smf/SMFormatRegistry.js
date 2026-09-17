// engine/formats/smf/SMFormatRegistry.js
// Registry for SMF native extensions, file types and custom format handlers.
(function (global) {
    'use strict';

    const SMF = global.SMF = global.SMF || {};
    const C = global.SMFormatConstants;

    if (!C || !global.SMFormatWriter || !global.SMFormatReader) {
        throw new Error(
            'SMFormatRegistry requires SMFormatConstants, SMFormatWriter and SMFormatReader.'
        );
    }

    class SMFormatRegistry {
        constructor() {
            this._byExtension = new Map();
            this._byType = new Map();
        }

        register({
            extension,
            fileType,
            name = '',
            reader = global.SMFormatReader,
            writer = global.SMFormatWriter,
            mimeType = 'application/x-smf'
        }) {
            const ext = String(extension || '').replace(/^\./, '').toLowerCase();
            const type = Number(fileType) >>> 0;

            if (!ext) {
                throw new TypeError('Format extension is required.');
            }

            const record = Object.freeze({
                extension: ext,
                fileType: type,
                name: name || C.FileTypeName[type] || ext.toUpperCase(),
                reader,
                writer,
                mimeType
            });

            this._byExtension.set(ext, record);
            this._byType.set(type, record);

            return record;
        }

        getByExtension(extensionOrFilename) {
            const value = String(extensionOrFilename || '').toLowerCase();
            const ext = value.includes('.')
                ? value.split('.').pop()
                : value.replace(/^\./, '');

            return this._byExtension.get(ext) || null;
        }

        getByType(fileType) {
            return this._byType.get(Number(fileType) >>> 0) || null;
        }

        supports(value) {
            return !!(
                typeof value === 'number'
                    ? this.getByType(value)
                    : this.getByExtension(value)
            );
        }

        createWriter(fileTypeOrExtension, options = {}) {
            const record = typeof fileTypeOrExtension === 'number'
                ? this.getByType(fileTypeOrExtension)
                : this.getByExtension(fileTypeOrExtension);

            if (!record) {
                throw new Error(`No SMF format registered for ${fileTypeOrExtension}.`);
            }

            return new record.writer({
                ...options,
                fileType: record.fileType
            });
        }

        async open(input, options = {}) {
            return global.SMFormatReader.open(input, options);
        }

        list() {
            return Array.from(this._byExtension.values());
        }
    }

    const registry = new SMFormatRegistry();

    for (const [extension, fileType] of Object.entries(C.ExtensionToFileType)) {
        registry.register({
            extension,
            fileType,
            name: C.FileTypeName[fileType]
        });
    }

    SMF.FormatRegistry = SMFormatRegistry;
    SMF.registry = registry;

    global.SMFormatRegistry = SMFormatRegistry;
    global.smFormatRegistry = global.smFormatRegistry || registry;

    try {
        global.dispatchEvent?.(
            new CustomEvent('sm:format-registry-ready', {
                detail: { registry: global.smFormatRegistry }
            })
        );
    } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);
