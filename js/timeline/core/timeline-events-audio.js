// js/timeline/core/timeline-events-audio.js
(function () {
    /**
     * Web Audio Sync & Frame Event Trigger Engine
     */
    class TimelineEventsAudio {
        constructor() {
            this.audioCtx = null;
            this.audioBuffer = null;
            this.audioSource = null;
            this.eventsMap = new Map(); // frame -> array of { name, action }
            this.lastTriggeredFrame = -1;
            this.isAudioPlaying = false;
        }

        initAudioContext() {
            if (!this.audioCtx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.audioCtx = new AudioCtx();
            }
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
        }

        /**
         * Load audio file for timeline lip-sync & music
         */
        async loadAudioTrack(fileOrUrl) {
            this.initAudioContext();
            if (!this.audioCtx) return;

            try {
                let arrayBuffer;
                if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
                    arrayBuffer = await fileOrUrl.arrayBuffer();
                } else {
                    const response = await fetch(fileOrUrl);
                    arrayBuffer = await response.arrayBuffer();
                }

                this.audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
                console.log('[TimelineAudio] Audio loaded successfully.');
                this.renderAudioWaveform();
            } catch (err) {
                console.error('[TimelineAudio] Failed to load audio:', err);
            }
        }

        playAudioFrom(time) {
            if (!this.audioBuffer || !this.audioCtx) return;
            this.stopAudio();

            this.initAudioContext();
            this.audioSource = this.audioCtx.createBufferSource();
            this.audioSource.buffer = this.audioBuffer;
            this.audioSource.connect(this.audioCtx.destination);

            const offset = Math.max(0, Math.min(time, this.audioBuffer.duration));
            this.audioSource.start(0, offset);
            this.isAudioPlaying = true;
        }

        stopAudio() {
            if (this.audioSource && this.isAudioPlaying) {
                try { this.audioSource.stop(); } catch (e) {}
                this.audioSource.disconnect();
                this.audioSource = null;
            }
            this.isAudioPlaying = false;
        }

        addEventNotify(frame, eventName, callback) {
            if (!this.eventsMap.has(frame)) {
                this.eventsMap.set(frame, []);
            }
            this.eventsMap.get(frame).push({ name: eventName, action: callback });
        }

        checkFrameEvents(currentFrame) {
            if (currentFrame === this.lastTriggeredFrame) return;
            this.lastTriggeredFrame = currentFrame;

            const events = this.eventsMap.get(currentFrame);
            if (events && events.length > 0) {
                events.forEach(evt => {
                    console.log(`[TimelineEvent] Triggered event "${evt.name}" at frame ${currentFrame}`);
                    if (typeof evt.action === 'function') evt.action(currentFrame);
                    window.dispatchEvent(new CustomEvent('timelineEventTrigger', {
                        detail: { frame: currentFrame, name: evt.name }
                    }));
                });
            }
        }

        renderAudioWaveform() {
            const canvas = document.getElementById('timeline-audio-waveform-canvas');
            if (!canvas || !this.audioBuffer) return;

            const ctx = canvas.getContext('2d');
            const width = canvas.width = canvas.parentElement.clientWidth || 900;
            const height = canvas.height = 36;
            const rawData = this.audioBuffer.getChannelData(0);
            const step = Math.ceil(rawData.length / width);

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = 'rgba(66, 165, 245, 0.25)';
            ctx.strokeStyle = '#42a5f5';
            ctx.lineWidth = 1;

            ctx.beginPath();
            for (let i = 0; i < width; i++) {
                const min = rawData[i * step] || 0;
                const y = ((min + 1) / 2) * height;
                if (i === 0) ctx.moveTo(i, y);
                else ctx.lineTo(i, y);
            }
            ctx.stroke();
        }
    }

    window.TimelineEventsAudio = new TimelineEventsAudio();
})();