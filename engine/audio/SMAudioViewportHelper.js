// engine/audio/SMAudioViewportHelper.js
// Neutral 3D viewport helpers for positional sound attenuation.

(() => {
    "use strict";

    class SMAudioViewportHelper {
        constructor(engine) {
            this.engine = engine;
            this.helpers = new Map();

            // Attenuation visualization is opt-in.
            // Normal editor state shows only the Audio Source icon.
            this.visible = false;
        }

        showForSource(
            sourceOrId,
            visible = true
        ) {
            const source =
                typeof sourceOrId === "string"
                    ? this.engine.sources.get(
                        sourceOrId
                    )
                    : sourceOrId;

            if (
                !source ||
                !source.spatial ||
                !source.object
            ) {
                return null;
            }

            let helper =
                this.helpers.get(
                    source.id
                );

            if (!helper) {
                helper =
                    this.createHelper(
                        source
                    );

                this.helpers.set(
                    source.id,
                    helper
                );
            }

            if (visible) {
                this.visible = true;
            }

            helper.group.visible =
                !!visible &&
                this.visible;

            this.updateSource(
                source
            );

            return helper;
        }

        createHelper(source) {
            const group =
                new THREE.Group();

            group.name =
                `SM_AUDIO_HELPER::${source.name}`;

            group.userData ||= {};

            Object.assign(
                group.userData,
                {
                    isSystemObject: true,
                    ignoreInHierarchy: true,
                    ignoreInTimeline: true,
                    ignoreSelection: true,
                    smAudioHelperFor:
                        source.id
                }
            );

            const geometry =
                new THREE.SphereGeometry(
                    1,
                    16,
                    10
                );

            const nearMaterial =
                new THREE.MeshBasicMaterial({
                    color: 0x8c8c8c,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.42,
                    depthTest: false
                });

            const farMaterial =
                new THREE.MeshBasicMaterial({
                    color: 0x626262,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.16,
                    depthTest: false
                });

            const refSphere =
                new THREE.Mesh(
                    geometry,
                    nearMaterial
                );

            refSphere.name =
                "Audio Ref Distance";

            refSphere.renderOrder = 999;

            const maxSphere =
                new THREE.Mesh(
                    geometry.clone(),
                    farMaterial
                );

            maxSphere.name =
                "Audio Max Distance";

            maxSphere.renderOrder = 998;

            group.add(
                refSphere,
                maxSphere
            );

            source.object.add(
                group
            );

            return {
                group,
                refSphere,
                maxSphere
            };
        }

        updateSource(source) {
            const helper =
                this.helpers.get(
                    source.id
                );

            if (!helper) return;

            helper.refSphere.scale.setScalar(
                Math.max(
                    0.001,
                    source.refDistance
                )
            );

            helper.maxSphere.scale.setScalar(
                Math.max(
                    source.refDistance,
                    source.maxDistance
                )
            );

            helper.group.visible =
                this.visible &&
                helper.group.visible;
        }

        setSourceVisible(
            sourceOrId,
            visible
        ) {
            const source =
                typeof sourceOrId ===
                "string"
                    ? this.engine.sources.get(
                        sourceOrId
                    )
                    : sourceOrId;

            if (!source) {
                return false;
            }

            if (!visible) {
                const helper =
                    this.helpers.get(
                        source.id
                    );

                if (helper) {
                    helper.group.visible =
                        false;
                }

                return true;
            }

            this.showForSource(
                source,
                true
            );

            return true;
        }

        hideAll() {
            this.visible = false;

            this.helpers.forEach(
                helper => {
                    helper.group.visible =
                        false;
                }
            );
        }

        showAll() {
            this.visible = true;

            this.helpers.forEach(
                (
                    helper,
                    sourceId
                ) => {
                    const source =
                        this.engine.sources.get(
                            sourceId
                        );

                    helper.group.visible =
                        !!(
                            source?.spatial &&
                            source?.object
                        );
                }
            );
        }

        removeSource(sourceId) {
            const helper =
                this.helpers.get(
                    sourceId
                );

            if (!helper) return false;

            helper.group.parent?.remove(
                helper.group
            );

            helper.group.traverse(
                object => {
                    object.geometry
                        ?.dispose?.();

                    if (
                        Array.isArray(
                            object.material
                        )
                    ) {
                        object.material
                            .forEach(
                                material =>
                                    material.dispose?.()
                            );
                    } else {
                        object.material
                            ?.dispose?.();
                    }
                }
            );

            this.helpers.delete(
                sourceId
            );

            return true;
        }

        dispose() {
            [
                ...this.helpers.keys()
            ].forEach(
                id =>
                    this.removeSource(id)
            );
        }
    }

    window.SMAudioViewportHelper =
        SMAudioViewportHelper;
})();