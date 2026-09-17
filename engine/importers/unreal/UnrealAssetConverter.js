/**
 * SM ENGINE — UNREAL ASSET CONVERTER
 *
 * Converts normalized Unreal parser output
 * into SM Engine friendly asset data.
 */
(function () {
    'use strict';

    class UnrealAssetConverter {

        constructor(options = {}) {
            this.options = options;
        }

        async convert(
            parsed,
            options = {}
        ) {
            if (!parsed) {
                throw new Error(
                    'UnrealAssetConverter: parsed data is required.'
                );
            }

            if (parsed.ok === false) {
                return {
                    ok: false,
                    status:
                        parsed.status ||
                        'invalid-parsed-data',

                    source:
                        parsed
                };
            }

            const type =
                parsed.type ||
                parsed.assetType ||
                'unknown';

            switch (type) {

                case 'static-mesh':
                    return this.convertStaticMesh(
                        parsed,
                        options
                    );

                case 'skeletal-mesh':
                    return this.convertSkeletalMesh(
                        parsed,
                        options
                    );

                case 'material':
                    return this.convertMaterial(
                        parsed,
                        options
                    );

                case 'texture':
                    return this.convertTexture(
                        parsed,
                        options
                    );

                case 'animation':
                    return this.convertAnimation(
                        parsed,
                        options
                    );

                case 'scene':
                case 'level':
                    return this.convertScene(
                        parsed,
                        options
                    );

                default:
                    return this.convertGeneric(
                        parsed,
                        options
                    );
            }
        }

        _base(parsed, type) {
            return {
                ok: true,

                format: 'unreal',

                type,

                name:
                    parsed.name ||
                    'UnrealAsset',

                metadata: {
                    ...(parsed.metadata || {}),

                    sourceEngine:
                        'Unreal Engine'
                },

                userData: {
                    smSourceFormat:
                        parsed.extension ||
                        'uasset',

                    smUnrealSource:
                        true,

                    smUnrealConverted:
                        true
                }
            };
        }

        convertStaticMesh(parsed) {
            return {
                ...this._base(
                    parsed,
                    'static-mesh'
                ),

                mesh:
                    parsed.mesh || null,

                materials:
                    parsed.materials || [],

                textures:
                    parsed.textures || []
            };
        }

        convertSkeletalMesh(parsed) {
            return {
                ...this._base(
                    parsed,
                    'skeletal-mesh'
                ),

                mesh:
                    parsed.mesh || null,

                skeleton:
                    parsed.skeleton || null,

                materials:
                    parsed.materials || [],

                animations:
                    parsed.animations || []
            };
        }

        convertMaterial(parsed) {
            return {
                ...this._base(
                    parsed,
                    'material'
                ),

                materials:
                    parsed.materials || [
                        parsed.material
                    ].filter(Boolean),

                textures:
                    parsed.textures || []
            };
        }

        convertTexture(parsed) {
            return {
                ...this._base(
                    parsed,
                    'texture'
                ),

                texture:
                    parsed.texture || null
            };
        }

        convertAnimation(parsed) {
            return {
                ...this._base(
                    parsed,
                    'animation'
                ),

                animations:
                    parsed.animations || []
            };
        }

        convertScene(parsed) {
            return {
                ...this._base(
                    parsed,
                    parsed.type || 'scene'
                ),

                nodes:
                    parsed.nodes || [],

                actors:
                    parsed.actors || [],

                materials:
                    parsed.materials || [],

                textures:
                    parsed.textures || []
            };
        }

        convertGeneric(parsed) {
            return {
                ...this._base(
                    parsed,
                    parsed.type || 'unknown'
                ),

                source:
                    parsed
            };
        }
    }

    window.SMUnrealAssetConverter =
        UnrealAssetConverter;

})();