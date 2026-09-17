// engine/architecture/materials/SMBuildingMaterialResolver.js
(function (global) {
    'use strict';

    class SMBuildingMaterialResolver {
        constructor(options = {}) {
            this.THREE = options.THREE || global.THREE;
            if (!this.THREE) throw new Error('THREE is required by SMBuildingMaterialResolver.');

            this.cache = new Map();
            this.customResolver = options.resolveMaterial || null;
            this.materialLibrary = options.materialLibrary || global.SMMaterialLibrary || null;

            this.palette = {
                wall:      { color: 0xd9d5cc, roughness: 0.78, metalness: 0.0 },
                floor:     { color: 0xb6a890, roughness: 0.72, metalness: 0.0 },
                ceiling:   { color: 0xf0eee8, roughness: 0.86, metalness: 0.0 },
                roof:      { color: 0x6f4f3f, roughness: 0.8, metalness: 0.0 },
                door:      { color: 0x6f4932, roughness: 0.65, metalness: 0.0 },
                doorFrame: { color: 0x45372d, roughness: 0.62, metalness: 0.0 },
                window:    { color: 0xb7d8ea, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.36 },
                windowFrame:{ color: 0x4f5357, roughness: 0.42, metalness: 0.55 },
                column:    { color: 0xc9c3b8, roughness: 0.72, metalness: 0.0 },
                stairs:    { color: 0xb8afa3, roughness: 0.74, metalness: 0.0 },
                default:   { color: 0xbfbfbf, roughness: 0.7, metalness: 0.0 }
            };
        }

        _libraryMaterial(name) {
            if (!name || !this.materialLibrary) return null;

            try {
                const record =
                    this.materialLibrary.get?.(name) ||
                    this.materialLibrary.find?.(name) ||
                    null;

                const material =
                    record?.material ||
                    record?.threeMaterial ||
                    record?.instance?.material ||
                    null;

                return material?.isMaterial ? material : null;
            } catch (_) {
                return null;
            }
        }

        _fromDefinition(name, definition) {
            const THREE = this.THREE;
            const def = {
                ...(this.palette.default || {}),
                ...(definition || {})
            };

            const material = new THREE.MeshStandardMaterial({
                name: `SMArchitecture:${name}`,
                color: def.color ?? 0xbfbfbf,
                roughness: def.roughness ?? 0.7,
                metalness: def.metalness ?? 0,
                transparent: def.transparent === true,
                opacity: def.opacity ?? 1,
                side: def.side ?? THREE.DoubleSide
            });

            if (def.emissive !== undefined) material.emissive.set(def.emissive);
            if (def.emissiveIntensity !== undefined) material.emissiveIntensity = def.emissiveIntensity;
            material.userData.smArchitectureMaterial = true;
            material.userData.smMaterialSemantic = name;
            return material;
        }

        resolve(name, mapMaterials = {}) {
            const key = String(name || 'default');

            if (typeof this.customResolver === 'function') {
                const resolved = this.customResolver(key, mapMaterials[key], this);
                if (resolved?.isMaterial) return resolved;
            }

            const fromLibrary = this._libraryMaterial(key);
            if (fromLibrary) return fromLibrary;

            if (this.cache.has(key)) return this.cache.get(key);

            const material = this._fromDefinition(
                key,
                mapMaterials[key] || this.palette[key] || this.palette.default
            );

            this.cache.set(key, material);
            return material;
        }

        dispose() {
            for (const material of this.cache.values()) {
                material.dispose?.();
            }
            this.cache.clear();
        }
    }

    global.SMBuildingMaterialResolver = SMBuildingMaterialResolver;
})(typeof window !== 'undefined' ? window : globalThis);
