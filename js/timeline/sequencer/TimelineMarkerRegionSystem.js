// js/timeline/sequencer/TimelineMarkerRegionSystem.js
// Professional named markers + editor regions / shot ranges.

(() => {
    "use strict";

    class TimelineMarkerRegionSystem {
        constructor() {
            this.markers = [];
            this.regions = [];
            this.events = new EventTarget();

            this._bound = false;
            this._renderRaf = 0;
        }

        init() {
            if (this._bound) return;

            this._bound = true;

            const rerender = () => this.scheduleRender();

            window.addEventListener("timeUpdate", rerender);
            window.addEventListener("resize", rerender);
            window.addEventListener("sm:timeline-panel-ready", rerender);
            window.addEventListener("sm:sequencer-model-change", rerender);
            window.addEventListener("sm:timeline-history-change", rerender);

            document
                .getElementById("timeline-content")
                ?.addEventListener(
                    "scroll",
                    rerender,
                    { passive: true }
                );

            this.scheduleRender();
        }

        addMarker({
            time = Number(window.currentTime || 0),
            name = "Marker",
            note = "",
            colorTag = "amber"
        } = {}) {
            const marker = {
                id: this._id("marker"),
                time: this._clampTime(time),
                name,
                note,
                colorTag
            };

            this.markers.push(marker);
            this.markers.sort((a, b) => a.time - b.time);

            this._changed("marker-add", marker);

            return marker;
        }

        updateMarker(id, patch = {}) {
            const marker =
                this.markers.find(item => item.id === id);

            if (!marker) return null;

            Object.assign(marker, patch);

            if ("time" in patch) {
                marker.time =
                    this._clampTime(patch.time);
            }

            this.markers.sort((a, b) => a.time - b.time);
            this._changed("marker-update", marker);

            return marker;
        }

        removeMarker(id) {
            const index =
                this.markers.findIndex(item => item.id === id);

            if (index < 0) return false;

            const [marker] = this.markers.splice(index, 1);
            this._changed("marker-remove", marker);

            return true;
        }

        addRegion({
            start = Number(window.currentTime || 0),
            end = null,
            name = "Region",
            colorTag = "slate"
        } = {}) {
            const duration = this.getDuration();
            const regionStart = this._clampTime(start);

            const regionEnd =
                this._clampTime(
                    end == null
                        ? regionStart + Math.max(1, duration * 0.08)
                        : end
                );

            const region = {
                id: this._id("region"),
                start: Math.min(regionStart, regionEnd),
                end: Math.max(regionStart + 0.001, regionEnd),
                name,
                colorTag
            };

            this.regions.push(region);
            this._changed("region-add", region);

            return region;
        }

        updateRegion(id, patch = {}) {
            const region =
                this.regions.find(item => item.id === id);

            if (!region) return null;

            const next = {
                ...region,
                ...patch
            };

            next.start = this._clampTime(next.start);
            next.end = this._clampTime(next.end);

            if (next.end <= next.start) {
                next.end = Math.min(
                    this.getDuration(),
                    next.start + 0.001
                );
            }

            Object.assign(region, next);
            this._changed("region-update", region);

            return region;
        }

        removeRegion(id) {
            const index =
                this.regions.findIndex(item => item.id === id);

            if (index < 0) return false;

            const [region] = this.regions.splice(index, 1);
            this._changed("region-remove", region);

            return true;
        }

        clear() {
            this.markers.length = 0;
            this.regions.length = 0;
            this._changed("clear", null);
        }

        serialize() {
            return {
                markers: structuredClone(this.markers),
                regions: structuredClone(this.regions)
            };
        }

        deserialize(data = {}) {
            this.markers =
                Array.isArray(data.markers)
                    ? structuredClone(data.markers)
                    : [];

            this.regions =
                Array.isArray(data.regions)
                    ? structuredClone(data.regions)
                    : [];

            this._changed("deserialize", null);
        }

        setCurrentTime(time) {
            const value = this._clampTime(time);

            window.currentTime = value;

            try {
                window.updatePlayhead?.();
                window.updateSceneFromTimeline?.();
            } catch (error) {
                console.warn("[TimelineMarkers] Unable to update timeline:", error);
            }

            window.dispatchEvent(
                new CustomEvent("timeUpdate", {
                    detail: {
                        time: value,
                        frame: Math.round(
                            value *
                            Math.max(1, Number(window.fps || 30))
                        )
                    }
                })
            );
        }

        scheduleRender() {
            if (this._renderRaf) {
                cancelAnimationFrame(this._renderRaf);
            }

            this._renderRaf =
                requestAnimationFrame(() => {
                    this._renderRaf = 0;
                    this.render();
                });
        }

        render() {
            const content =
                document.getElementById("timeline-content");

            const keyContainer =
                document.getElementById("keyframes-container");

            if (!content || !keyContainer) return;

            let layer =
                content.querySelector(".sm-marker-region-layer");

            if (!layer) {
                layer = document.createElement("div");
                layer.className = "sm-marker-region-layer";
                content.appendChild(layer);
            }

            layer.innerHTML = "";
            layer.style.width =
                `${Math.max(
                    keyContainer.scrollWidth,
                    keyContainer.offsetWidth,
                    content.scrollWidth
                )}px`;

            this.regions.forEach(region => {
                const el = document.createElement("div");
                el.className = "sm-sequencer-region";
                el.dataset.regionId = region.id;

                const startX = this.timeToX(region.start);
                const endX = this.timeToX(region.end);

                el.style.left = `${startX}px`;
                el.style.width =
                    `${Math.max(2, endX - startX)}px`;

                el.innerHTML = `
                    <span class="sm-sequencer-region-label">
                        ${this._escape(region.name)}
                    </span>
                `;

                layer.appendChild(el);
            });

            this.markers.forEach((marker, index) => {
                const el = document.createElement("button");

                el.type = "button";
                el.className = "sm-sequencer-marker";
                el.dataset.markerId = marker.id;
                el.style.left = `${this.timeToX(marker.time)}px`;
                el.title =
                    `${marker.name} · ${this._formatTime(marker.time)}`;

                el.innerHTML = `
                    <span class="sm-sequencer-marker-head">
                        ${index + 1}
                    </span>
                    <span class="sm-sequencer-marker-label">
                        ${this._escape(marker.name)}
                    </span>
                `;

                el.addEventListener("click", event => {
                    event.stopPropagation();
                    this.setCurrentTime(marker.time);
                });

                layer.appendChild(el);
            });
        }

        timeToX(time) {
            const content =
                document.getElementById("timeline-content");

            const container =
                document.getElementById("keyframes-container");

            const width = Math.max(
                Number(container?.scrollWidth || container?.offsetWidth || 0),
                Number(content?.scrollWidth || content?.clientWidth || 900),
                1
            );

            return this._clampTime(time) / this.getDuration() * width;
        }

        getDuration() {
            return Math.max(
                0.001,
                Number(window.timelineDuration || 30)
            );
        }

        _clampTime(time) {
            return Math.max(
                0,
                Math.min(
                    this.getDuration(),
                    Number(time) || 0
                )
            );
        }

        _id(prefix) {
            return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        }

        _formatTime(time) {
            const fps = Math.max(1, Number(window.fps || 30));
            return `${Math.round(time * fps)}f`;
        }

        _escape(value) {
            return String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        _changed(type, payload) {
            const detail = {
                type,
                payload,
                markers: this.markers,
                regions: this.regions
            };

            this.events.dispatchEvent(
                new CustomEvent("change", { detail })
            );

            window.dispatchEvent(
                new CustomEvent("sm:timeline-marker-region-change", { detail })
            );

            this.scheduleRender();
        }
    }

    window.TimelineMarkerRegionSystem =
        TimelineMarkerRegionSystem;

    window.timelineMarkerRegionSystem =
        window.timelineMarkerRegionSystem ||
        new TimelineMarkerRegionSystem();
})();