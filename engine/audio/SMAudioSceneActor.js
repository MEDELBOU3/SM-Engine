// engine/audio/SMAudioSceneActor.js
// Scene-visible Audio Actor used by AssetsPanel -> Viewport workflows.

(() => {
    "use strict";

    class SMAudioSceneActor {
        static create({
            name = "Audio Source",
            assetId = null,
            metaSoundAssetId = null,
            sourceType = "sound-wave",
            spatial = true,
            bus = "SFX",
            volume = 1,
            pitch = 1,
            loop = false,
            playOnStart = true,
            refDistance = 5,
            maxDistance = 250,
            rolloffFactor = 1,
            distanceModel = "inverse"
        } = {}) {
            if (!window.THREE) {
                throw new Error("SMAudioSceneActor requires THREE.");
            }

            const actor = new THREE.Group();

            actor.name = name;

            actor.userData ||= {};

            actor.userData.smAudioActor = true;
            actor.userData.audioActorVersion = 1;

            actor.userData.audioComponent = {
                sourceType,
                assetId,
                metaSoundAssetId,

                spatial: spatial !== false,

                bus: bus || "SFX",

                volume:
                    Math.max(
                        0,
                        Number(volume) || 0
                    ),

                pitch:
                    Math.max(
                        0.01,
                        Number(pitch) || 1
                    ),

                loop: !!loop,
                playOnStart:
                    playOnStart !== false,

                refDistance:
                    Math.max(
                        0.001,
                        Number(refDistance) || 5
                    ),

                maxDistance:
                    Math.max(
                        Number(refDistance) || 5,
                        Number(maxDistance) || 250
                    ),

                rolloffFactor:
                    Math.max(
                        0,
                        Number(rolloffFactor) || 0
                    ),

                distanceModel:
                    ["linear", "inverse", "exponential"]
                        .includes(distanceModel)
                        ? distanceModel
                        : "inverse"
            };

            this._addEditorVisual(actor);

            return actor;
        }

        static _addEditorVisual(actor) {
            const helper =
                new THREE.Group();

            helper.name =
                "AudioSourceEditorVisual";

            helper.userData ||= {};

            Object.assign(
                helper.userData,
                {
                    isSystemObject: true,
                    editorOnly: true,
                    ignoreInHierarchy: true,
                    ignoreInTimeline: true,
                    ignoreSelection: true,
                    smAudioActorVisual: true
                }
            );

            /*
             * EDITOR ICON ONLY.
             *
             * Do NOT use geometry spheres/rings here. Audio attenuation is a
             * separate optional visualization managed by SMAudioViewportHelper.
             *
             * A Sprite always faces the camera and is much closer to the way
             * lights/cameras/audio sources are represented in professional
             * editors.
             */
            const canvas =
                document.createElement(
                    "canvas"
                );

            canvas.width = 128;
            canvas.height = 128;

            const ctx =
                canvas.getContext(
                    "2d"
                );

            if (ctx) {
                ctx.clearRect(
                    0,
                    0,
                    128,
                    128
                );

                // Subtle editor badge background.
                ctx.fillStyle =
                    "rgba(38,38,38,0.82)";

                ctx.beginPath();
                ctx.roundRect?.(
                    18,
                    18,
                    92,
                    92,
                    14
                );

                if (
                    typeof ctx.roundRect ===
                    "function"
                ) {
                    ctx.fill();
                } else {
                    ctx.fillRect(
                        18,
                        18,
                        92,
                        92
                    );
                }

                // Speaker body.
                ctx.fillStyle =
                    "rgba(222,222,222,0.96)";

                ctx.beginPath();

                ctx.moveTo(
                    35,
                    53
                );

                ctx.lineTo(
                    50,
                    53
                );

                ctx.lineTo(
                    69,
                    37
                );

                ctx.lineTo(
                    69,
                    91
                );

                ctx.lineTo(
                    50,
                    75
                );

                ctx.lineTo(
                    35,
                    75
                );

                ctx.closePath();
                ctx.fill();

                // Sound waves.
                ctx.strokeStyle =
                    "rgba(222,222,222,0.88)";

                ctx.lineWidth = 7;
                ctx.lineCap = "round";

                ctx.beginPath();

                ctx.arc(
                    68,
                    64,
                    19,
                    -0.72,
                    0.72
                );

                ctx.stroke();

                ctx.lineWidth = 6;

                ctx.beginPath();

                ctx.arc(
                    68,
                    64,
                    34,
                    -0.72,
                    0.72
                );

                ctx.stroke();
            }

            const texture =
                new THREE.CanvasTexture(
                    canvas
                );

            texture.colorSpace =
                THREE.SRGBColorSpace ||
                texture.colorSpace;

            texture.needsUpdate =
                true;

            const material =
                new THREE.SpriteMaterial({
                    map: texture,
                    transparent: true,
                    opacity: 0.96,
                    depthTest: false,
                    depthWrite: false,
                    sizeAttenuation: false
                });

            const icon =
                new THREE.Sprite(
                    material
                );

            icon.name =
                "AudioSourceIcon";

            icon.userData ||= {};

            Object.assign(
                icon.userData,
                {
                    isSystemObject: true,
                    editorOnly: true,
                    ignoreInHierarchy: true,
                    ignoreInTimeline: true,
                    ignoreSelection: true,
                    smAudioActorIcon: true
                }
            );

            /*
             * With sizeAttenuation=false this remains close to a constant
             * screen-space icon instead of becoming a giant 3D object.
             */
            icon.scale.set(
                0.055,
                0.055,
                1
            );

            icon.renderOrder =
                10000;

            helper.add(
                icon
            );

            actor.add(
                helper
            );

            actor.userData
                .audioEditorVisualUuid =
                helper.uuid;

            actor.userData
                .audioEditorIconUuid =
                icon.uuid;
        }

        static getComponent(actor) {
            return (
                actor?.userData
                    ?.audioComponent ||
                null
            );
        }

        static isAudioActor(object) {
            return !!(
                object?.userData
                    ?.smAudioActor
            );
        }

        static serialize(actor) {
            if (!this.isAudioActor(actor)) {
                return null;
            }

            return {
                type: "SMAudioSceneActor",
                version: 1,

                uuid: actor.uuid,
                name: actor.name,

                transform: {
                    position: {
                        x: actor.position.x,
                        y: actor.position.y,
                        z: actor.position.z
                    },

                    quaternion: {
                        x: actor.quaternion.x,
                        y: actor.quaternion.y,
                        z: actor.quaternion.z,
                        w: actor.quaternion.w
                    },

                    scale: {
                        x: actor.scale.x,
                        y: actor.scale.y,
                        z: actor.scale.z
                    }
                },

                audioComponent:
                    structuredClone(
                        actor.userData
                            .audioComponent
                    )
            };
        }
    }

    window.SMAudioSceneActor =
        SMAudioSceneActor;
})();