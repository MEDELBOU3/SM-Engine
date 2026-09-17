// engine/audio/SMAudioBus.js
// Audio routing bus: Music / SFX / Dialogue / UI / Ambience / Master.

(() => {
    "use strict";

    class SMAudioBus {
        constructor(
            context,
            {
                id,
                name = null,
                volume = 1,
                muted = false,
                parentInput = null
            } = {}
        ) {
            if (!context) {
                throw new Error(
                    "SMAudioBus requires an AudioContext."
                );
            }

            this.context = context;
            this.id = id || `bus-${Date.now()}`;
            this.name = name || this.id;

            this.gainNode = context.createGain();
            this.input = this.gainNode;
            this.output = this.gainNode;

            this.volume =
                Math.max(0, Number(volume) || 0);

            this.muted = !!muted;

            this.parentInput = null;

            this.applyGain();

            if (parentInput) {
                this.connect(parentInput);
            }
        }

        connect(target) {
            if (!target) return false;

            try {
                this.output.disconnect();
            } catch (_) {}

            this.output.connect(target);

            this.parentInput = target;

            return true;
        }

        disconnect() {
            try {
                this.output.disconnect();
            } catch (_) {}

            this.parentInput = null;
        }

        setVolume(value) {
            this.volume =
                Math.max(
                    0,
                    Number(value) || 0
                );

            this.applyGain();

            return this.volume;
        }

        setMuted(muted) {
            this.muted = !!muted;
            this.applyGain();

            return this.muted;
        }

        toggleMute() {
            return this.setMuted(
                !this.muted
            );
        }

        applyGain() {
            const value =
                this.muted
                    ? 0
                    : this.volume;

            const now =
                Number(
                    this.context.currentTime ||
                    0
                );

            try {
                this.gainNode.gain
                    .cancelScheduledValues(now);

                this.gainNode.gain
                    .setTargetAtTime(
                        value,
                        now,
                        0.012
                    );
            } catch (_) {
                this.gainNode.gain.value =
                    value;
            }
        }

        serialize() {
            return {
                id: this.id,
                name: this.name,
                volume: this.volume,
                muted: this.muted
            };
        }
    }

    window.SMAudioBus = SMAudioBus;
})();