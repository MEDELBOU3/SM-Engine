/**
 * SequencerSnap.js
 * SnapManager for the SM Engine video sequencer.
 * Snap targets: playhead, markers, and all clip start/end boundaries.
 * Threshold is defined in pixels and converted to time via the current
 * pixelsPerSecond, so snapping feels identical at every zoom level.
 */

class SequencerSnapManager {
    constructor(state) {
        this.state = state;
        this.thresholdPx = 6;
    }

    get thresholdTime() {
        return this.thresholdPx / this.state.pixelsPerSecond;
    }

    get enabled() {
        return this.state.snapEnabled;
    }

    targets(excludeClipId, edges) {
        const s = this.state;
        const out = [s.playhead];
        for (const m of s.markers) out.push(m.time);
        for (const c of s.clips) {
            if (excludeClipId && c.id === excludeClipId) continue;
            if (c.visible === false) continue;
            if (!edges || edges.left) out.push(c.start);
            if (!edges || edges.right) out.push(c.start + c.duration);
        }
        return out;
    }

    /**
     * Snap a raw time value to the nearest target within threshold.
     * opts: { excludeClipId, edges: {left, right}, force: true|false|undefined }
     * Returns { time, snapped, target, delta }.
     */
    snap(time, opts) {
        const s = this.state;
        opts = opts || {};
        const enabled = opts.force === true ? true : opts.force === false ? false : this.enabled;
        if (!enabled) {
            return { time: time, snapped: false, target: null, delta: 0 };
        }
        const threshold = this.thresholdTime;
        const targets = this.targets(opts.excludeClipId || null, opts.edges);
        let best = null;
        let bestD = threshold;
        for (const t of targets) {
            const d = Math.abs(t - time);
            if (d <= bestD) {
                bestD = d;
                best = t;
            }
        }
        if (best === null) {
            return { time: time, snapped: false, target: null, delta: 0 };
        }
        return { time: best, snapped: best !== time, target: best, delta: best - time };
    }

    /**
     * Snap a proposed delta-time for a group drag. The left-most edge of the
     * dragged group is used as the reference edge, and the group keeps its
     * internal spacing intact.
     */
    snapGroupDelta(deltaTime, groupClips, opts) {
        const refOriginal = Math.min.apply(null, groupClips.map(c => c.start));
        const proposed = refOriginal + deltaTime;
        const result = this.snap(proposed, {
            excludeClipId: opts && opts.excludeClipId ? opts.excludeClipId : null,
            edges: { left: true, right: true }
        });
        return {
            delta: result.snapped ? result.time - refOriginal : deltaTime,
            snapped: result.snapped,
            target: result.target
        };
    }
}

window.SequencerSnapManager = SequencerSnapManager;
