// engine/audio/SMAudioZone.js
// Listener-based ambience/effect zone.
// v1 supports master gain + global low-pass shaping.

(() => {
    "use strict";

    class SMAudioZone {
        constructor({
            id = null,
            name = "Audio Zone",
            shape = "box",

            center = null,
            size = null,
            radius = 10,

            priority = 0,
            enabled = true,

            lowpassHz = 22000,
            masterGain = 1,
            transitionSpeed = 5,

            metadata = {}
        } = {}) {
            this.id =
                id ||
                `audio-zone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

            this.name = name;

            this.shape =
                shape === "sphere"
                    ? "sphere"
                    : "box";

            this.center =
                center?.isVector3
                    ? center.clone()
                    : new THREE.Vector3(
                        center?.x || 0,
                        center?.y || 0,
                        center?.z || 0
                    );

            this.size =
                size?.isVector3
                    ? size.clone()
                    : new THREE.Vector3(
                        size?.x || 10,
                        size?.y || 10,
                        size?.z || 10
                    );

            this.radius =
                Math.max(
                    0.001,
                    Number(radius) || 10
                );

            this.priority =
                Number(priority) || 0;

            this.enabled =
                enabled !== false;

            this.lowpassHz =
                Math.max(
                    40,
                    Number(lowpassHz) || 22000
                );

            this.masterGain =
                Math.max(
                    0,
                    Number(masterGain) || 0
                );

            this.transitionSpeed =
                Math.max(
                    0.01,
                    Number(transitionSpeed) || 5
                );

            this.metadata =
                structuredClone(
                    metadata || {}
                );

            this.inside = false;
        }

        contains(point) {
            if (
                !this.enabled ||
                !point
            ) {
                return false;
            }

            if (this.shape === "sphere") {
                return (
                    point.distanceToSquared(
                        this.center
                    ) <=
                    this.radius *
                        this.radius
                );
            }

            const halfX =
                Math.abs(this.size.x) * 0.5;

            const halfY =
                Math.abs(this.size.y) * 0.5;

            const halfZ =
                Math.abs(this.size.z) * 0.5;

            return (
                Math.abs(
                    point.x -
                    this.center.x
                ) <= halfX &&
                Math.abs(
                    point.y -
                    this.center.y
                ) <= halfY &&
                Math.abs(
                    point.z -
                    this.center.z
                ) <= halfZ
            );
        }

        serialize() {
            return {
                id: this.id,
                name: this.name,
                shape: this.shape,
                center: {
                    x: this.center.x,
                    y: this.center.y,
                    z: this.center.z
                },
                size: {
                    x: this.size.x,
                    y: this.size.y,
                    z: this.size.z
                },
                radius: this.radius,
                priority: this.priority,
                enabled: this.enabled,
                lowpassHz: this.lowpassHz,
                masterGain: this.masterGain,
                transitionSpeed: this.transitionSpeed,
                metadata:
                    structuredClone(
                        this.metadata
                    )
            };
        }
    }

    window.SMAudioZone =
        SMAudioZone;
})();