// engine/formats/smf/SMChunkTypes.js
// Extensible chunk type registry.
(function (global) {
    'use strict';

    const SMF = global.SMF = global.SMF || {};
    const C = global.SMFormatConstants;

    if (!C) {
        throw new Error('SMChunkTypes requires SMFormatConstants.js');
    }

    class SMChunkTypes {
        static _byId = new Map();
        static _byName = new Map();

        static register(id, name, options = {}) {
            id = Number(id) >>> 0;
            name = String(name || '').trim().toUpperCase();

            if (!name) {
                throw new TypeError('Chunk type name is required.');
            }

            const existingById = this._byId.get(id);
            const existingByName = this._byName.get(name);

            if (
                (existingById && existingById.name !== name) ||
                (existingByName && existingByName.id !== id)
            ) {
                throw new Error(`Chunk type collision for ${name} (${id}).`);
            }

            const record = Object.freeze({
                id,
                name,
                streamable: !!options.streamable,
                editorOnly: !!options.editorOnly,
                description: options.description || ''
            });

            this._byId.set(id, record);
            this._byName.set(name, record);
            return record;
        }

        static get(value) {
            if (typeof value === 'number') {
                return this._byId.get(value >>> 0) || null;
            }

            return this._byName.get(String(value || '').trim().toUpperCase()) || null;
        }

        static resolve(value) {
            if (typeof value === 'number') return value >>> 0;

            const record = this.get(value);
            if (!record) {
                throw new Error(`Unknown chunk type: ${value}`);
            }

            return record.id;
        }

        static list() {
            return Array.from(this._byId.values()).sort((a, b) => a.id - b.id);
        }
    }

    for (const [name, id] of Object.entries(C.ChunkType)) {
        SMChunkTypes.register(id, name, {
            streamable: /LOD|TEXTURE|AUDIO|ANIMATION|SCENE_/.test(name),
            editorOnly: name === 'EDITOR_DATA'
        });
    }

    SMF.ChunkTypes = SMChunkTypes;
    global.SMChunkTypes = SMChunkTypes;
})(typeof window !== 'undefined' ? window : globalThis);
