(function () {
    'use strict';

    const round = (value) => Number.isFinite(Number(value)) ? Number(Number(value).toFixed(4)) : 0;
    const vector = (value) => value ? [round(value.x), round(value.y), round(value.z)] : [0, 0, 0];

    class SMAIContextBuilder {
        constructor(options = {}) {
            this.maxObjects = Math.max(10, Number(options.maxObjects) || 80);
        }

        describeMaterial(material) {
            if (!material) return null;
            return {
                type: material.type || 'Material',
                color: material.color?.getHexString ? `#${material.color.getHexString()}` : null,
                roughness: Number.isFinite(material.roughness) ? round(material.roughness) : null,
                metalness: Number.isFinite(material.metalness) ? round(material.metalness) : null,
                opacity: Number.isFinite(material.opacity) ? round(material.opacity) : null,
                transparent: material.transparent === true
            };
        }

        describeObject(object, detailed = false) {
            if (!object) return null;
            const entity = window.smSceneManager?.getEntity?.(object);
            const item = {
                id: entity?.id || object.userData?.entityId || object.uuid,
                uuid: object.uuid,
                name: object.name || object.type || 'Object',
                type: object.type || 'Object3D',
                visible: object.visible !== false,
                position: vector(object.position),
                rotationDegrees: vector(object.rotation).map((value) => round(value * 180 / Math.PI)),
                scale: vector(object.scale),
                childCount: object.children?.length || 0
            };
            if (detailed) {
                item.material = Array.isArray(object.material)
                    ? object.material.map((material) => this.describeMaterial(material))
                    : this.describeMaterial(object.material);
                item.geometry = object.geometry ? {
                    type: object.geometry.type,
                    vertices: object.geometry.attributes?.position?.count || 0,
                    triangles: object.geometry.index
                        ? Math.floor(object.geometry.index.count / 3)
                        : Math.floor((object.geometry.attributes?.position?.count || 0) / 3)
                } : null;
                item.tags = entity?.tags || object.userData?.tags || [];
            }
            return item;
        }

        build() {
            const scene = window.scene;
            const selected = window.selectedObject || window.transformControls?.object || null;
            const objects = [];
            const counts = { objects: 0, meshes: 0, lights: 0, cameras: 0, triangles: 0 };
            scene?.traverse?.((object) => {
                if (object === scene || object.userData?.ignoreInHierarchy === true) return;
                counts.objects += 1;
                if (object.isMesh) {
                    counts.meshes += 1;
                    counts.triangles += object.geometry?.index
                        ? Math.floor(object.geometry.index.count / 3)
                        : Math.floor((object.geometry?.attributes?.position?.count || 0) / 3);
                }
                if (object.isLight) counts.lights += 1;
                if (object.isCamera) counts.cameras += 1;
                if (objects.length < this.maxObjects) objects.push(this.describeObject(object, false));
            });

            return {
                engine: 'SM Engine',
                workspace: String(window.workspaceManager?.currentMode || 'FILM'),
                gameViewportMode: window.workspaceManager?.currentGameMode || null,
                selectedObject: this.describeObject(selected, true),
                camera: window.camera ? {
                    type: window.camera.type,
                    position: vector(window.camera.position),
                    rotationDegrees: vector(window.camera.rotation).map((value) => round(value * 180 / Math.PI)),
                    fov: Number.isFinite(window.camera.fov) ? round(window.camera.fov) : null
                } : null,
                sceneStats: counts,
                sceneObjects: objects,
                truncated: counts.objects > objects.length
            };
        }

        buildSystemInstruction() {
            return [
                'You are the integrated SM Engine AI assistant.',
                'Help the user edit the current 3D scene. Use the provided functions for factual inspection and every scene mutation.',
                'Never claim an edit succeeded unless the matching function result says it succeeded.',
                'Prefer the selected object when the request says this object or it.',
                'When the user asks to build, create, fix, apply, or edit, act immediately with the available tools instead of asking them to continue.',
                'Never repeat an identical function call after it has already succeeded in the current task. Stop calling tools when the requested result is complete.',
                'Keep answers concise and mention object names after edits.',
                `Current editor context:\n${JSON.stringify(this.build())}`
            ].join('\n');
        }
    }

    window.SMAIContextBuilder = SMAIContextBuilder;
    window.smAIContextBuilder = window.smAIContextBuilder || new SMAIContextBuilder();
}());
