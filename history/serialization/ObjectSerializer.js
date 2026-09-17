(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};

    class ObjectSerializer {
        static BAD_KEYS = [
            'mixer',
            'physicsBody',
            'bboxHelper',
            'helper',
            'originalMaterial',
            'selectionProxy',
            'origHighlight',
            'skeletonHelper'
        ];

        /**
         * Strips circular / heavy keys and serializes Three.js object to JSON.
         */
        static serialize(object) {
            if (!object || typeof object.toJSON !== 'function') return null;

            const originalUserData = object.userData;
            try {
                const safeUserData = {};
                for (const key in object.userData) {
                    if (!this.BAD_KEYS.includes(key)) {
                        safeUserData[key] = object.userData[key];
                    }
                }

                object.userData = safeUserData;
                const json = object.toJSON();
                object.userData = originalUserData;
                return json;
            } catch (e) {
                object.userData = originalUserData;
                console.warn('[ObjectSerializer] Serialization failed:', e);
                return null;
            }
        }

        /**
         * Rebuilds a Three.js Object3D from serialized JSON data.
         */
        static deserialize(jsonData) {
            if (!jsonData || typeof THREE === 'undefined') return null;

            try {
                const loader = new THREE.ObjectLoader();
                return loader.parse(jsonData);
            } catch (e) {
                console.error('[ObjectSerializer] Deserialization failed:', e);
                return null;
            }
        }
    }

    H.ObjectSerializer = ObjectSerializer;
})();