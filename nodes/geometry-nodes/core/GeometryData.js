// ============================================================================
// GeometryData v2 — Blender-like geometry set payload.
// Supports mesh geometry, points, curves, instances, materials and attributes.
// ============================================================================
(function (global) {
    'use strict';

    const THREE = global.THREE;

    class CurveData {
        constructor(points = [], options = {}) {
            this.__curveData = true;
            this.points = points.map(p => p && p.isVector3 ? p.clone() : new THREE.Vector3(...(Array.isArray(p) ? p : [0, 0, 0])));
            this.cyclic = !!options.cyclic;
            this.radius = options.radius ?? 0.1;
            this.metadata = { ...(options.metadata || {}) };
        }

        clone() {
            return new CurveData(this.points, {
                cyclic: this.cyclic,
                radius: this.radius,
                metadata: { ...this.metadata }
            });
        }
    }

    class GeometryData {
        constructor(geometry = null, options = {}) {
            this.__geometryData = true;
            this.geometry = geometry || null;
            this.points = Array.isArray(options.points)
                ? options.points.map(p => ({
                    position: p.position?.isVector3 ? p.position.clone() : new THREE.Vector3(...(p.position || [0, 0, 0])),
                    normal: p.normal?.isVector3 ? p.normal.clone() : new THREE.Vector3(...(p.normal || [0, 1, 0])),
                    rotation: p.rotation?.isEuler ? p.rotation.clone() : new THREE.Euler(...(p.rotation || [0, 0, 0])),
                    scale: p.scale?.isVector3 ? p.scale.clone() : new THREE.Vector3(...(p.scale || [1, 1, 1])),
                    id: p.id ?? 0,
                    attributes: { ...(p.attributes || {}) }
                }))
                : [];

            this.curves = Array.isArray(options.curves)
                ? options.curves.map(c => c?.__curveData ? c.clone() : new CurveData(c?.points || c || [], c || {}))
                : [];

            this.instances = Array.isArray(options.instances)
                ? options.instances.map(i => ({
                    geometry: i.geometry?.clone ? i.geometry.clone() : i.geometry,
                    data: i.data?.clone ? i.data.clone() : i.data,
                    matrix: i.matrix?.clone ? i.matrix.clone() : new THREE.Matrix4().copy(i.matrix || new THREE.Matrix4()),
                    material: i.material || null,
                    id: i.id ?? 0,
                    attributes: { ...(i.attributes || {}) }
                }))
                : [];

            this.material = options.material || null;
            this.materialSlots = Array.isArray(options.materialSlots) ? [...options.materialSlots] : [];
            this.attributes = {
                POINT: {},
                EDGE: {},
                FACE: {},
                CORNER: {},
                INSTANCE: {},
                ...(options.attributes || {})
            };
            this.metadata = { ...(options.metadata || {}) };
        }

        static is(value) {
            return !!(value && value.__geometryData === true);
        }

        static from(value) {
            if (GeometryData.is(value)) return value;
            if (value && value.isBufferGeometry) return new GeometryData(value);
            if (value && value.geometry?.isBufferGeometry) {
                return new GeometryData(value.geometry, {
                    material: value.material || null,
                    metadata: { ...(value.metadata || {}) }
                });
            }
            return new GeometryData(null);
        }

        static empty() {
            return new GeometryData(null);
        }

        setGeometry(geometry) {
            this.geometry = geometry || null;
            return this;
        }

        addPoint(point) {
            const p = point || {};
            this.points.push({
                position: p.position?.isVector3 ? p.position.clone() : new THREE.Vector3(...(p.position || [0, 0, 0])),
                normal: p.normal?.isVector3 ? p.normal.clone() : new THREE.Vector3(...(p.normal || [0, 1, 0])),
                rotation: p.rotation?.isEuler ? p.rotation.clone() : new THREE.Euler(...(p.rotation || [0, 0, 0])),
                scale: p.scale?.isVector3 ? p.scale.clone() : new THREE.Vector3(...(p.scale || [1, 1, 1])),
                id: p.id ?? this.points.length,
                attributes: { ...(p.attributes || {}) }
            });
            return this;
        }

        addInstance(instance) {
            const i = instance || {};
            this.instances.push({
                geometry: i.geometry?.clone ? i.geometry.clone() : i.geometry,
                data: i.data?.clone ? i.data.clone() : i.data,
                matrix: i.matrix?.clone ? i.matrix.clone() : new THREE.Matrix4(),
                material: i.material || null,
                id: i.id ?? this.instances.length,
                attributes: { ...(i.attributes || {}) }
            });
            return this;
        }

        addCurve(curve) {
            this.curves.push(curve?.__curveData ? curve.clone() : new CurveData(curve?.points || curve || [], curve || {}));
            return this;
        }

        setAttribute(name, domain, values) {
            domain = String(domain || 'POINT').toUpperCase();
            if (!this.attributes[domain]) this.attributes[domain] = {};
            this.attributes[domain][name] = values;
            return this;
        }

        getAttribute(name, domain = 'POINT') {
            return this.attributes?.[String(domain).toUpperCase()]?.[name];
        }

        clone(options = {}) {
            const deep = options.deep !== false;
            const geometry = deep && this.geometry?.clone ? this.geometry.clone() : this.geometry;
            const out = new GeometryData(geometry, {
                points: deep ? this.points : [],
                curves: deep ? this.curves : [],
                instances: deep ? this.instances : [],
                material: this.material,
                materialSlots: this.materialSlots,
                attributes: {},
                metadata: { ...this.metadata }
            });

            out.attributes = {};
            for (const [domain, attrs] of Object.entries(this.attributes || {})) {
                out.attributes[domain] = {};
                for (const [name, value] of Object.entries(attrs || {})) {
                    if (ArrayBuffer.isView(value)) out.attributes[domain][name] = value.slice ? value.slice() : new value.constructor(value);
                    else if (Array.isArray(value)) out.attributes[domain][name] = value.map(v => Array.isArray(v) ? [...v] : v);
                    else out.attributes[domain][name] = value;
                }
            }
            return out;
        }

        hasMesh() { return !!this.geometry; }
        hasPoints() { return this.points.length > 0; }
        hasCurves() { return this.curves.length > 0; }
        hasInstances() { return this.instances.length > 0; }

        stats() {
            const position = this.geometry?.getAttribute?.('position');
            const index = this.geometry?.index;
            return {
                vertices: position?.count || 0,
                triangles: index ? Math.floor(index.count / 3) : (position ? Math.floor(position.count / 3) : 0),
                points: this.points.length,
                curves: this.curves.length,
                instances: this.instances.length
            };
        }

        dispose() {
            this.geometry?.dispose?.();
            this.instances.forEach(i => {
                if (i.data?.dispose) i.data.dispose();
                else i.geometry?.dispose?.();
            });
        }
    }

    global.CurveData = CurveData;
    global.GeometryData = GeometryData;
    global.GeoGeometryData = GeometryData;
})(typeof window !== 'undefined' ? window : globalThis);