// AssetsPanelMaterialApplication.js
// AssetsPanel -> viewport material application and Material Paint routing
// Extracted from AssetsPanel_FULL_9483_PBR_FIXED without rewriting method bodies.
(function(global){
"use strict";
const AssetsPanel=global.AssetsPanel;
if(!AssetsPanel){
throw new Error("[SMAssetsPanelMaterialApplicationMixin] AssetsPanelCore must load first.");
}
class SMAssetsPanelMaterialApplicationMixin {
    static _isMaterialPaintPanelOpen() {
        return !!(
            document.body?.classList?.contains(
                "sm-material-paint-open"
            ) ||
            document
                .getElementById(
                    "sm-material-paint-dock"
                )
                ?.classList?.contains(
                    "is-open"
                )
        );
    }

    static _objectContainsMesh(
        root,
        mesh
    ) {
        if (!root || !mesh) return false;
        if (root === mesh) return true;

        let current = mesh.parent;

        while (current) {
            if (current === root) {
                return true;
            }

            current = current.parent;
        }

        return false;
    }

    static async _routeMaterialDropToPainter(
        asset,
        mesh
    ) {
        const painter =
            window.SMUniversalMaterialPainter;

        if (
            !painter ||
            !this._isMaterialPaintPanelOpen()
        ) {
            return false;
        }

        if (
            !asset?.id ||
            asset.type !== "material" ||
            !mesh?.isMesh
        ) {
            return false;
        }

        const currentTarget =
            painter.target;

        const paintTarget =
            currentTarget &&
            this._objectContainsMesh(
                currentTarget,
                mesh
            )
                ? currentTarget
                : mesh;

        await painter.setTarget(
            paintTarget
        );

        await painter.setLayerAsset(
            painter.state?.activeLayer ??
                0,
            asset.id,
            paintTarget
        );

        window.dispatchEvent(
            new CustomEvent(
                "sm:assets-material-routed-to-painter",
                {
                    detail: {
                        asset,
                        mesh,
                        target:
                            paintTarget,
                        layer:
                            painter.state
                                ?.activeLayer ??
                            0
                    }
                }
            )
        );

        console.log(
            `[AssetsPanel] Routed '${asset.name}' to Material Paint layer ${(painter.state?.activeLayer ?? 0) + 1}.`
        );

        return true;
    }

    static async _applyMaterialToMesh(
        asset,
        mesh,
        options = {}
    ) {
        if (!mesh || !mesh.isMesh) {
            console.warn(
                "AssetsPanel: target is not a mesh"
            );
            return null;
        }

        if (!asset?.definition) {
            console.warn(
                "AssetsPanel: material asset missing definition"
            );
            return null;
        }

        if (
            options.forceDirect !== true &&
            await this._routeMaterialDropToPainter(
                asset,
                mesh
            )
        ) {
            return mesh.material;
        }

        const def =
            asset.definition;

        const MaterialType =
            def.type ===
            "MeshPhysicalMaterial"
                ? THREE.MeshPhysicalMaterial
                : THREE.MeshStandardMaterial;

        const previousMaterial =
            Array.isArray(mesh.material)
                ? mesh.material[0]
                : mesh.material;

        const mat =
            new MaterialType({
                color:
                    def.color
                        ? new THREE.Color(
                              def.color
                          )
                        : 0xffffff,
                roughness:
                    def.roughness ??
                    0.5,
                metalness:
                    def.metalness ??
                    0.0,
                emissive:
                    def.emissive
                        ? new THREE.Color(
                              def.emissive
                          )
                        : 0x000000,
                emissiveIntensity:
                    def.emissiveIntensity ??
                    1,
                opacity:
                    def.opacity ?? 1,
                transparent:
                    Boolean(
                        def.transparent
                    ) ||
                    (def.opacity ?? 1) <
                        1,
                alphaTest:
                    def.alphaTest ?? 0,
                transmission:
                    def.transmission ??
                    0,
                ior:
                    def.ior ?? 1.5,
                clearcoat:
                    def.clearcoat ?? 0,
                clearcoatRoughness:
                    def.clearcoatRoughness ??
                    0,
                thickness:
                    def.thickness ?? 0,
                side:
                    def.doubleSided === true
                        ? THREE.DoubleSide
                        : def.side ??
                            previousMaterial?.side ??
                            THREE.FrontSide,
                depthWrite:
                    def.depthWrite !== false
            });

        for (const key of [
            "envMapIntensity", "reflectivity", "specularIntensity",
            "sheen", "sheenRoughness", "anisotropy", "iridescence"
        ]) {
            if (def[key] !== undefined && key in mat) {
                mat[key] = Number(def[key]);
            }
        }
        for (const key of ["specularColor", "sheenColor", "attenuationColor"]) {
            if (def[key] && mat[key]?.set) mat[key].set(def[key]);
        }

        mat.name =
            def.displayName ||
            asset.name ||
            "SM Material";

        mat.userData.smMaterialAssetId =
            asset.id;

        mat.userData.smMaterialDefinition =
            { ...def };

        const loadSlot = async (
            key,
            slot,
            loadOptions = {}
        ) => {
            const textureAssetId =
                def[key];

            if (!textureAssetId) {
                return null;
            }

            const textureAsset =
                this._findById(
                    textureAssetId
                );

            if (
                !this._isMaterialTextureCompatibleAsset(
                    textureAsset
                )
            ) {
                return null;
            }

            const texture =
                await this._loadMaterialTextureAsset(
                    textureAsset,
                    {
                        tiling:
                            def.tiling ??
                            1,
                        binding:
                            def.textureBindings?.[key] ||
                            null,
                        ...loadOptions
                    }
                );

            if (texture) {
                mat[slot] =
                    texture;
            }

            return texture;
        };

        await Promise.all([
            loadSlot(
                "map",
                "map",
                { color: true }
            ),
            loadSlot(
                "normalMap",
                "normalMap"
            ),
            loadSlot(
                "roughnessMap",
                "roughnessMap"
            ),
            loadSlot(
                "metalnessMap",
                "metalnessMap"
            ),
            loadSlot(
                "aoMap",
                "aoMap"
            ),
            loadSlot(
                "emissiveMap",
                "emissiveMap",
                { color: true }
            ),
            loadSlot(
                "displacementMap",
                "displacementMap"
            ),
            loadSlot(
                "opacityMap",
                "alphaMap"
            ),
            loadSlot(
                "clearcoatMap",
                "clearcoatMap"
            ),
            loadSlot(
                "clearcoatRoughnessMap",
                "clearcoatRoughnessMap"
            ),
            loadSlot(
                "clearcoatNormalMap",
                "clearcoatNormalMap"
            ),
            loadSlot(
                "transmissionMap",
                "transmissionMap"
            ),
            loadSlot(
                "thicknessMap",
                "thicknessMap"
            ),
            loadSlot(
                "specularIntensityMap",
                "specularIntensityMap"
            ),
            loadSlot(
                "specularColorMap",
                "specularColorMap",
                { color: true }
            )
        ]);

        if (
            mat.normalMap &&
            mat.normalScale
        ) {
            const strength =
                Number(
                    def.normalStrength
                ) || 1;

            mat.normalScale.set(
                strength,
                String(
                    def.normalConvention ||
                    "gl"
                ).toLowerCase() ===
                    "dx"
                    ? -strength
                    : strength
            );
        }

        if (
            mat.displacementMap
        ) {
            mat.displacementScale =
                Number(
                    def.displacementScale
                ) || 0;

            mat.displacementBias =
                Number(
                    def.displacementBias
                ) || 0;
        }

        if (
            mat.aoMap &&
            mesh.geometry
                ?.attributes?.uv &&
            !mesh.geometry
                ?.attributes?.uv2
        ) {
            mesh.geometry.setAttribute(
                "uv2",
                mesh.geometry.attributes
                    .uv.clone()
            );
        }

        mesh.material = mat;
        mesh.visible = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        mesh.userData =
            mesh.userData || {};

        mesh.userData.smMaterialAssetId =
            asset.id;

        mat.needsUpdate = true;

        if (
            this.renderer?.shadowMap
        ) {
            this.renderer.shadowMap
                .needsUpdate = true;
        }

        window.dispatchEvent(
            new CustomEvent(
                "sm:assets-material-applied",
                {
                    detail: {
                        asset,
                        mesh,
                        material: mat
                    }
                }
            )
        );

        console.log(
            `Applied material '${asset.name}' to ${mesh.name || mesh.uuid}`
        );

        return mat;
    }

    static _shortName(src) {
        try {
            return src.split("/").pop();
        } catch (e) {
            return src;
        }
    }

    // ==================================================================
}
for(const key of Reflect.ownKeys(SMAssetsPanelMaterialApplicationMixin)){
if(key==="length"||key==="name"||key==="prototype")continue;
const descriptor=Object.getOwnPropertyDescriptor(SMAssetsPanelMaterialApplicationMixin,key);
if(!descriptor)continue;
Object.defineProperty(AssetsPanel,key,descriptor);
}
global.__SMAssetsPanelLoadedModules=global.__SMAssetsPanelLoadedModules||[];
global.__SMAssetsPanelLoadedModules.push("AssetsPanelMaterialApplication");
})(window);
