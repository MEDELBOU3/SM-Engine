(function () {
    'use strict';
    const registry = window.smAIToolRegistry;
    if (!registry) return;
    const describe = () => ({ type: window.camera?.type, position: window.camera?.position?.toArray(), rotationDegrees: window.camera?.rotation?.toArray().slice(0, 3).map(THREE.MathUtils.radToDeg), fov: window.camera?.fov });
    const find = (id) => !id || id === 'selected' ? window.selectedObject : window.scene?.getObjectByProperty?.('uuid', id) || window.scene?.getObjectByName?.(id);

    registry.registerMany([
        { name: 'inspect_camera', label: 'Inspect camera', permission: 'read', description: 'Read the active viewport camera transform and field of view.', parameters: { type: 'object', properties: {} }, execute: () => ({ camera: describe() }) },
        {
            name: 'set_camera_view', label: 'Move camera', permission: 'mutate', description: 'Set active camera position, rotation in degrees, field of view, or look-at target.',
            parameters: { type: 'object', properties: { position: { type: 'array', items: { type: 'number' } }, rotationDegrees: { type: 'array', items: { type: 'number' } }, fov: { type: 'number' }, lookAt: { type: 'array', items: { type: 'number' } } } },
            execute: ({ position, rotationDegrees, fov, lookAt }) => {
                const camera = window.camera;
                if (!camera) throw new Error('Active camera not found.');
                if (Array.isArray(position)) camera.position.fromArray(position.map(Number));
                if (Array.isArray(rotationDegrees)) camera.rotation.set(...rotationDegrees.map((value) => THREE.MathUtils.degToRad(Number(value))));
                if (Array.isArray(lookAt)) camera.lookAt(new THREE.Vector3().fromArray(lookAt.map(Number)));
                if (Number.isFinite(Number(fov)) && camera.isPerspectiveCamera) { camera.fov = THREE.MathUtils.clamp(Number(fov), 10, 150); camera.updateProjectionMatrix(); }
                window.controls?.update?.();
                return { camera: describe() };
            }
        },
        {
            name: 'focus_camera_on_object', label: 'Focus camera', permission: 'mutate', description: 'Frame an object in the viewport camera.',
            parameters: { type: 'object', properties: { objectId: { type: 'string' } } },
            execute: ({ objectId = 'selected' }) => {
                const object = find(objectId);
                if (!object) throw new Error('Object not found.');
                const box = new THREE.Box3().setFromObject(object);
                const sphere = box.getBoundingSphere(new THREE.Sphere());
                const distance = Math.max(2, sphere.radius * 3);
                const direction = new THREE.Vector3(1, 0.65, 1).normalize();
                window.camera.position.copy(sphere.center).addScaledVector(direction, distance);
                window.camera.lookAt(sphere.center);
                if (window.controls?.target) window.controls.target.copy(sphere.center);
                window.controls?.update?.();
                return { focusedObject: object.name, camera: describe() };
            }
        }
    ]);
}());
