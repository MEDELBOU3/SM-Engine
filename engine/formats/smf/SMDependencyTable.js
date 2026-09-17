// engine/formats/smf/SMDependencyTable.js
// Fixed-size dependency table using UUID references + string-table indices.
(function (global) {
    'use strict';

    const SMF = global.SMF = global.SMF || {};
    const C = global.SMFormatConstants;

    if (!C || !global.SMAssetUUID) {
        throw new Error('SMDependencyTable requires SMFormatConstants.js and SMAssetUUID.js');
    }

    class SMDependencyTable {
        constructor() {
            this.items = [];
        }

        add(dependency = {}) {
            const item = {
                uuid: global.SMAssetUUID.normalize(
                    dependency.uuid || global.SMAssetUUID.generate()
                ),
                type: Number(dependency.type ?? C.FileType.UNKNOWN) >>> 0,
                flags: Number(dependency.flags ?? C.DependencyFlags.REQUIRED) >>> 0,
                path: String(dependency.path || ''),
                name: String(dependency.name || ''),
                versionMin: Number(dependency.versionMin ?? 0) & 0xffff,
                versionMax: Number(dependency.versionMax ?? 0xffff) & 0xffff
            };

            const duplicate = this.items.find(d => d.uuid === item.uuid);

            if (duplicate) {
                Object.assign(duplicate, item);
                return duplicate;
            }

            this.items.push(item);
            return item;
        }

        get count() {
            return this.items.length;
        }

        registerStrings(stringTable) {
            for (const item of this.items) {
                stringTable.add(item.path);
                stringTable.add(item.name);
            }
        }

        encode(stringTable) {
            const size = this.count * C.DEPENDENCY_ENTRY_SIZE;
            const bytes = new Uint8Array(size);
            const view = new DataView(bytes.buffer);

            for (let i = 0; i < this.items.length; i++) {
                const item = this.items[i];
                const offset = i * C.DEPENDENCY_ENTRY_SIZE;

                bytes.set(global.SMAssetUUID.toBytes(item.uuid), offset);
                view.setUint32(offset + 16, item.type, true);
                view.setUint32(offset + 20, item.flags, true);
                view.setUint32(offset + 24, stringTable.add(item.path), true);
                view.setUint32(offset + 28, stringTable.add(item.name), true);
                view.setUint16(offset + 32, item.versionMin, true);
                view.setUint16(offset + 34, item.versionMax, true);
                view.setUint32(offset + 36, 0, true);
            }

            return bytes;
        }

        static decode(input, count, stringTable) {
            const bytes = input instanceof Uint8Array
                ? input
                : new Uint8Array(input);

            const required = count * C.DEPENDENCY_ENTRY_SIZE;

            if (bytes.byteLength < required) {
                throw new Error('Dependency table is truncated.');
            }

            const view = new DataView(
                bytes.buffer,
                bytes.byteOffset,
                bytes.byteLength
            );

            const table = new SMDependencyTable();

            for (let i = 0; i < count; i++) {
                const offset = i * C.DEPENDENCY_ENTRY_SIZE;

                table.add({
                    uuid: global.SMAssetUUID.fromBytes(bytes, offset),
                    type: view.getUint32(offset + 16, true),
                    flags: view.getUint32(offset + 20, true),
                    path: stringTable.get(view.getUint32(offset + 24, true)) || '',
                    name: stringTable.get(view.getUint32(offset + 28, true)) || '',
                    versionMin: view.getUint16(offset + 32, true),
                    versionMax: view.getUint16(offset + 34, true)
                });
            }

            return table;
        }
    }

    SMF.DependencyTable = SMDependencyTable;
    global.SMDependencyTable = SMDependencyTable;
})(typeof window !== 'undefined' ? window : globalThis);
