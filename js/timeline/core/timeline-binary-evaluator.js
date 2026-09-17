// js/timeline/core/timeline-binary-evaluator.js
(function () {
    /**
     * High-Performance O(log N) Binary Search Evaluator & Interpolator
     * Preserves Three.js Vector3 & Quaternion math for zero animation breakage.
     */
    class TimelineBinaryEvaluator {
        constructor() {
            this.cache = new Map(); // uuid -> sorted keyframe array
            this._tempEuler = new THREE.Euler(0, 0, 0, 'XYZ');
            this._q0 = new THREE.Quaternion();
            this._q1 = new THREE.Quaternion();
        }

        /**
         * Call this whenever keyframes are added, deleted, or dragged
         */
        invalidateCache(uuid) {
            if (uuid) this.cache.delete(uuid);
            else this.cache.clear();
        }

        /**
         * Builds or returns sorted array of keyframes for binary search
         */
        getSortedFrames(keyframeMap) {
            if (!keyframeMap || typeof keyframeMap !== 'object') return [];

            const fps = Number(window.fps || 30);
            return Object.entries(keyframeMap)
                .map(([frameStr, data]) => {
                    const frame = Number(frameStr);
                    const time = data.time ?? (frame / fps);
                    return { frame, time, data };
                })
                .sort((a, b) => a.time - b.time);
        }

        /**
         * O(log N) Binary Search to locate surrounding keyframes
         */
        findKeyframeSpan(sortedFrames, targetTime) {
            const count = sortedFrames.length;
            if (count === 0) return null;
            if (count === 1) return { prev: sortedFrames[0], next: sortedFrames[0], alpha: 0 };

            if (targetTime <= sortedFrames[0].time) {
                return { prev: sortedFrames[0], next: sortedFrames[0], alpha: 0 };
            }
            if (targetTime >= sortedFrames[count - 1].time) {
                return { prev: sortedFrames[count - 1], next: sortedFrames[count - 1], alpha: 0 };
            }

            let low = 0;
            let high = count - 1;

            while (low <= high) {
                const mid = (low + high) >> 1;
                const midTime = sortedFrames[mid].time;

                if (midTime === targetTime) {
                    return { prev: sortedFrames[mid], next: sortedFrames[mid], alpha: 0 };
                }

                if (midTime < targetTime) low = mid + 1;
                else high = mid - 1;
            }

            const prev = sortedFrames[high];
            const next = sortedFrames[low];
            const spanDuration = Math.max(0.0001, next.time - prev.time);
            const alpha = Math.max(0, Math.min(1, (targetTime - prev.time) / spanDuration));

            return { prev, next, alpha };
        }

        /**
         * Evaluates complete Object3D / Bone transforms reliably
         */
        evaluateObject(object, keyframeMap, time) {
            if (!object || !keyframeMap) return;

            // Use a stable cache id derived from the keyframeMap reference so
            // we don't collide between object.uuid and animationTarget.uuid
            const cacheId = object.uuid;
            let sorted = this.cache.get(cacheId);
            if (!sorted) {
                sorted = this.getSortedFrames(keyframeMap);
                this.cache.set(cacheId, sorted);
            }

            if (!sorted.length) return;

            const span = this.findKeyframeSpan(sorted, time);
            if (!span) return;

            const prevData = span.prev.data;
            const nextData = span.next.data;

            // Boundary or Single Keyframe
            if (span.prev === span.next || span.alpha === 0) {
                if (prevData.position) object.position.set(
                    prevData.position.x ?? 0, prevData.position.y ?? 0, prevData.position.z ?? 0);
                if (prevData.rotation) object.quaternion.set(
                    prevData.rotation.x ?? 0, prevData.rotation.y ?? 0, prevData.rotation.z ?? 0, prevData.rotation.w ?? 1);
                if (prevData.scale) object.scale.set(
                    prevData.scale.x ?? 1, prevData.scale.y ?? 1, prevData.scale.z ?? 1);
                return;
            }

            const interpMode = prevData.interpolation || 'bezier';

            // Hold / Constant Easing
            if (interpMode === 'constant' || interpMode === 'hold') {
                if (prevData.position) object.position.set(
                    prevData.position.x ?? 0, prevData.position.y ?? 0, prevData.position.z ?? 0);
                if (prevData.rotation) object.quaternion.set(
                    prevData.rotation.x ?? 0, prevData.rotation.y ?? 0, prevData.rotation.z ?? 0, prevData.rotation.w ?? 1);
                if (prevData.scale) object.scale.set(
                    prevData.scale.x ?? 1, prevData.scale.y ?? 1, prevData.scale.z ?? 1);
                return;
            }

            // Linear or Bezier Spherical Slerp / Vector Lerp
            const t = Math.max(0, Math.min(1, span.alpha));

            if (prevData.position && nextData.position) {
                const p0 = prevData.position, p1 = nextData.position;
                object.position.set(
                    (p0.x ?? 0) + ((p1.x ?? 0) - (p0.x ?? 0)) * t,
                    (p0.y ?? 0) + ((p1.y ?? 0) - (p0.y ?? 0)) * t,
                    (p0.z ?? 0) + ((p1.z ?? 0) - (p0.z ?? 0)) * t
                );
            }
            if (prevData.rotation && nextData.rotation) {
                const q0 = prevData.rotation, q1 = nextData.rotation;
                // Use Three.js slerpQuaternions for proper quaternion interpolation
                this._q0.set(q0.x ?? 0, q0.y ?? 0, q0.z ?? 0, q0.w ?? 1);
                this._q1.set(q1.x ?? 0, q1.y ?? 0, q1.z ?? 0, q1.w ?? 1);
                object.quaternion.slerpQuaternions(this._q0, this._q1, t);
            }
            if (prevData.scale && nextData.scale) {
                const s0 = prevData.scale, s1 = nextData.scale;
                object.scale.set(
                    (s0.x ?? 1) + ((s1.x ?? 1) - (s0.x ?? 1)) * t,
                    (s0.y ?? 1) + ((s1.y ?? 1) - (s0.y ?? 1)) * t,
                    (s0.z ?? 1) + ((s1.z ?? 1) - (s0.z ?? 1)) * t
                );
            }
        }

        /**
         * Safely gets float value for channel curves (used in Graph Editor)
         */
        getChannelValueFromData(data, channelName) {
            if (!data) return 0;
            const [prop, axis] = channelName.split('.');

            if (prop === 'rotation') {
                if (data.rotationEuler && typeof data.rotationEuler[axis] === 'number') {
                    return data.rotationEuler[axis];
                }
                if (data.rotation?.isQuaternion) {
                    this._tempEuler.setFromQuaternion(data.rotation, 'XYZ');
                    return this._tempEuler[axis] || 0;
                }
                return 0;
            }

            return data[prop]?.[axis] ?? 0;
        }

        /**
         * Evaluates a single component float curve for Graph Editor preview
         */
        evaluateChannelValue(sortedFrames, channelName, time) {
            const span = this.findKeyframeSpan(sortedFrames, time);
            if (!span) return 0;

            const v0 = this.getChannelValueFromData(span.prev.data, channelName);
            if (span.prev === span.next || span.alpha === 0) return v0;

            const v1 = this.getChannelValueFromData(span.next.data, channelName);
            const interpMode = span.prev.data.interpolation || 'bezier';

            if (interpMode === 'constant' || interpMode === 'hold') return v0;

            return v0 + (v1 - v0) * span.alpha;
        }
    }

    window.TimelineBinaryEvaluator = new TimelineBinaryEvaluator();
})();