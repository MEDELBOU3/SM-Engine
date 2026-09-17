(function (global) {
    'use strict';

    class SMExposureVolume {
        constructor(options = {}) {
            this.id = options.id || `exposure-volume-${SMExposureVolume._nextId++}`;
            this.enabled = options.enabled !== false;
            this.priority = Number(options.priority) || 0;
            this.blendDistance = Math.max(0, Number(options.blendDistance) || 0);
            this.center = new THREE.Vector3().fromArray(options.center || [0, 0, 0]);
            this.size = new THREE.Vector3().fromArray(options.size || [10, 10, 10]);
            this.settings = { ...(options.settings || {}) };
            this._box = new THREE.Box3();
            this._refreshBox();
        }

        _refreshBox() {
            const half = this.size.clone().multiplyScalar(0.5);
            this._box.set(this.center.clone().sub(half), this.center.clone().add(half));
        }

        setBounds(center, size) {
            if (center) this.center.copy(center.isVector3 ? center : new THREE.Vector3().fromArray(center));
            if (size) this.size.copy(size.isVector3 ? size : new THREE.Vector3().fromArray(size));
            this._refreshBox();
            return this;
        }

        getWeight(position) {
            if (!this.enabled || !position) return 0;
            if (this._box.containsPoint(position)) return 1;
            if (this.blendDistance <= 0) return 0;
            const closest = this._box.clampPoint(position, new THREE.Vector3());
            return Math.max(0, 1 - closest.distanceTo(position) / this.blendDistance);
        }
    }

    SMExposureVolume._nextId = 1;
    global.SMExposureVolume = SMExposureVolume;
})(window);
