window.SMPlayerUtils = {
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },
    damp(current, target, speed, delta) {
        return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * delta));
    },
    dampVector3(current, target, speed, delta) {
        const alpha = 1 - Math.exp(-speed * delta);
        current.lerp(target, alpha);
        return current;
    },
    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    },
    dampAngle(current, target, speed, delta) {
        const diff = this.normalizeAngle(target - current);
        return current + diff * (1 - Math.exp(-speed * delta));
    },
    getCameraForward(camera, target = new THREE.Vector3()) {
        if (!camera) return target.set(0, 0, -1);
        camera.getWorldDirection(target);
        target.y = 0;
        if (target.lengthSq() < 0.000001) return target.set(0, 0, -1);
        return target.normalize();
    },
    getCameraRight(camera, target = new THREE.Vector3()) {
        const forward = this.getCameraForward(camera, target);
        target.set(-forward.z, 0, forward.x);
        return target.normalize();
    },
    findBone(root, names = []) {
        if (!root) return null;
        const wanted = names.map(name => String(name).toLowerCase());
        let result = null;
        root.traverse(obj => {
            if (result || !obj.isBone) return;
            const objectName = String(obj.name || '').toLowerCase();
            if (wanted.some(name => objectName === name || objectName.includes(name))) {
                result = obj;
            }
        });
        return result;
    }
};