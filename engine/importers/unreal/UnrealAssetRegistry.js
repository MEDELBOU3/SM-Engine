/**
 * SM ENGINE — UNREAL ASSET REGISTRY
 *
 * Tracks Unreal-origin assets
 * and their SM runtime objects.
 */
(function () {
    'use strict';

    class UnrealAssetRegistry {
        constructor() {
            this.assets =
                new Map();

            this.runtimeObjects =
                new Map();
        }

        _key(fileOrName) {
            if (
                typeof fileOrName === 'string'
            ) {
                return fileOrName;
            }

            if (fileOrName) {
                if (fileOrName.name) {
                    return fileOrName.name;
                }

                if (fileOrName.path) {
                    return fileOrName.path;
                }
            }

            return (
                'unreal-' +
                Date.now() +
                '-' +
                Math.random()
                    .toString(36)
                    .slice(2)
            );
        }

        register(
            fileOrName,
            metadata = {}
        ) {
            const key =
                this._key(fileOrName);

            const record = {
                id: key,

                name:
                    metadata.name ||
                    key,

                format:
                    metadata.format ||
                    'unreal',

                metadata: {
                    ...metadata
                },

                registeredAt:
                    Date.now()
            };

            this.assets.set(
                key,
                record
            );

            return record;
        }

        registerRuntimeObject(
            fileOrName,
            object
        ) {
            const key =
                this._key(fileOrName);

            this.runtimeObjects.set(
                key,
                object
            );

            return object;
        }

        get(id) {
            return (
                this.assets.get(id) ||
                null
            );
        }

        getRuntimeObject(id) {
            return (
                this.runtimeObjects.get(id) ||
                null
            );
        }

        remove(id) {
            this.assets.delete(id);

            this.runtimeObjects.delete(id);
        }

        clear() {
            this.assets.clear();

            this.runtimeObjects.clear();
        }

        list() {
            return Array.from(
                this.assets.values()
            );
        }
    }

    window.SMUnrealAssetRegistry =
        window.SMUnrealAssetRegistry ||
        new UnrealAssetRegistry();

    window.UnrealAssetRegistry =
        UnrealAssetRegistry;
})();