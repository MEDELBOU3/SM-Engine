(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};

    class DeltaCompressor {
        /**
         * Computes sparse delta between two typed arrays.
         * If more than 40% of vertices changed, falls back to full array.
         */
        static computeDelta(beforeArr, afterArr, tolerance = 1e-6) {
            if (!beforeArr || !afterArr || beforeArr.length !== afterArr.length) {
                return { isDelta: false, data: new Float32Array(afterArr) };
            }

            const changedIndices = [];
            const changedValues = [];
            const len = beforeArr.length;

            for (let i = 0; i < len; i++) {
                if (Math.abs(beforeArr[i] - afterArr[i]) > tolerance) {
                    changedIndices.push(i);
                    changedValues.push(afterArr[i]);
                }
            }

            // Fallback to full array if too many changes
            if (changedIndices.length > (len * 0.4)) {
                return {
                    isDelta: false,
                    data: new Float32Array(afterArr)
                };
            }

            return {
                isDelta: true,
                indices: new Uint32Array(changedIndices),
                values: new Float32Array(changedValues),
                length: len
            };
        }

        /**
         * Applies a delta or full array onto a target Float32Array.
         */
        static apply(targetArr, snapshot) {
            if (!targetArr || !snapshot) return;

            if (!snapshot.isDelta && snapshot.data) {
                targetArr.set(snapshot.data);
                return;
            }

            if (snapshot.isDelta && snapshot.indices && snapshot.values) {
                const indices = snapshot.indices;
                const values = snapshot.values;
                const count = indices.length;

                for (let i = 0; i < count; i++) {
                    targetArr[indices[i]] = values[i];
                }
            }
        }
    }

    H.DeltaCompressor = DeltaCompressor;
})();