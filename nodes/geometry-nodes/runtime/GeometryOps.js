// ============================================================================
// GeometryOps v2 — geometry algorithms used by SM Geometry Nodes.
// Accepts THREE.BufferGeometry or GeometryData and returns GeometryData.
// ============================================================================
(function (global) {
    'use strict';

    const THREE = global.THREE;
    const GeometryData = global.GeometryData;
    const FieldSystem = global.FieldSystem;

    function data(value) {
        return GeometryData.from(value);
    }

    function mesh(value) {
        const d = data(value);
        return d.geometry || null;
    }

    function cloneData(value) {
        return data(value).clone();
    }

    function cloneGeometry(geometry) {
        const g = mesh(geometry);
        return g?.clone ? g.clone() : g;
    }

    function toIndexed(value, threshold = 1e-5) {
        const d = data(value);
        const geom = d.geometry;
        if (!geom) return d.clone();
        if (geom.index) return d.clone();

        if (THREE.BufferGeometryUtils?.mergeVertices) {
            const out = d.clone();
            out.geometry = THREE.BufferGeometryUtils.mergeVertices(geom.clone(), threshold);
            out.geometry.computeVertexNormals();
            return out;
        }

        const posAttr = geom.getAttribute('position');
        if (!posAttr || posAttr.count % 3 !== 0) return d.clone();

        const positions = posAttr.array;
        const unique = new Map();
        const newPos = [];
        const newIdx = [];
        const precision = Math.max(1, Math.round(-Math.log10(Math.max(threshold, 1e-8))));

        for (let i = 0; i < posAttr.count; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];
            const z = positions[i * 3 + 2];
            const key = `${x.toFixed(precision)},${y.toFixed(precision)},${z.toFixed(precision)}`;
            let id = unique.get(key);
            if (id === undefined) {
                id = newPos.length / 3;
                unique.set(key, id);
                newPos.push(x, y, z);
            }
            newIdx.push(id);
        }

        const outGeom = new THREE.BufferGeometry();
        outGeom.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
        outGeom.setIndex(newIdx);
        outGeom.computeVertexNormals();

        const out = d.clone();
        out.geometry = outGeom;
        return out;
    }

    function mergeVertices(value, threshold = 1e-5) {
        return toIndexed(value, threshold);
    }

    function subdivideMesh(value, levels = 1) {
        let d = toIndexed(value);
        let geom = d.geometry;
        if (!geom) return d;

        levels = Math.max(0, Math.min(5, Math.round(Number(levels) || 0)));
        for (let level = 0; level < levels; level++) {
            geom = subdivideOnce(geom);
        }
        geom.computeVertexNormals();
        d.geometry = geom;
        return d;
    }

    function subdivideOnce(geom) {
        const indexed = geom.index ? geom : toIndexed(new GeometryData(geom)).geometry;
        const pos = indexed.getAttribute('position');
        const idx = indexed.index.array;
        const vertices = [];
        for (let i = 0; i < pos.count; i++) vertices.push(pos.getX(i), pos.getY(i), pos.getZ(i));

        const midpointCache = new Map();
        const outputIndices = [];

        const midpoint = (a, b) => {
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            if (midpointCache.has(key)) return midpointCache.get(key);
            const id = vertices.length / 3;
            vertices.push(
                (vertices[a * 3] + vertices[b * 3]) * 0.5,
                (vertices[a * 3 + 1] + vertices[b * 3 + 1]) * 0.5,
                (vertices[a * 3 + 2] + vertices[b * 3 + 2]) * 0.5
            );
            midpointCache.set(key, id);
            return id;
        };

        for (let i = 0; i < idx.length; i += 3) {
            const a = idx[i], b = idx[i + 1], c = idx[i + 2];
            const ab = midpoint(a, b);
            const bc = midpoint(b, c);
            const ca = midpoint(c, a);
            outputIndices.push(
                a, ab, ca,
                ab, b, bc,
                ca, bc, c,
                ab, bc, ca
            );
        }

        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        out.setIndex(outputIndices);
        out.computeVertexNormals();
        return out;
    }

    function triangulateGeometry(value) {
        const d = data(value).clone();
        if (!d.geometry) return d;
        if (!d.geometry.index) return toIndexed(d);
        return d;
    }

    function reverseWinding(value) {
        const d = toIndexed(value);
        const g = d.geometry;
        if (!g?.index) return d;
        const idx = Array.from(g.index.array);
        for (let i = 0; i < idx.length; i += 3) {
            [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
        }
        g.setIndex(idx);
        g.computeVertexNormals();
        return d;
    }

    function transformGeometry(value, translation = [0,0,0], rotation = [0,0,0], scale = [1,1,1]) {
        const d = data(value).clone();
        const t = new THREE.Vector3(...vec3(translation, [0,0,0]));
        const r = vec3(rotation, [0,0,0]).map(v => THREE.MathUtils.degToRad(Number(v) || 0));
        const s = vec3(scale, [1,1,1]);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2]));
        const matrix = new THREE.Matrix4().compose(
            t,
            q,
            new THREE.Vector3(s[0] ?? 1, s[1] ?? 1, s[2] ?? 1)
        );
        d.geometry?.applyMatrix4?.(matrix);
        d.points.forEach(p => {
            p.position.applyMatrix4(matrix);
            p.normal.transformDirection(matrix);
        });
        d.instances.forEach(i => i.matrix.premultiply(matrix));
        d.curves.forEach(c => c.points.forEach(p => p.applyMatrix4(matrix)));
        d.geometry?.computeVertexNormals?.();
        return d;
    }

    function setPosition(value, positionField = null, offsetField = [0,0,0], selectionField = true) {
        const d = data(value).clone();
        const g = d.geometry;
        if (!g) return d;

        const pos = g.getAttribute('position');
        if (!pos) return d;
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        const nrm = g.getAttribute('normal');

        for (let i = 0; i < pos.count; i++) {
            const current = [pos.getX(i), pos.getY(i), pos.getZ(i)];
            const normal = nrm ? [nrm.getX(i), nrm.getY(i), nrm.getZ(i)] : [0, 1, 0];
            const ctx = {
                domain: 'POINT',
                index: i,
                id: i,
                position: current,
                normal,
                geometryData: d,
                geometry: g
            };

            if (!FieldSystem.boolean(selectionField, true, ctx)) continue;

            let base = current;
            if (positionField != null) base = FieldSystem.vector(positionField, current, ctx);
            const off = FieldSystem.vector(offsetField, [0,0,0], ctx);

            pos.setXYZ(i, base[0] + off[0], base[1] + off[1], base[2] + off[2]);
        }

        pos.needsUpdate = true;
        g.computeVertexNormals();
        g.computeBoundingBox();
        g.computeBoundingSphere();
        return d;
    }

    function extrudeMesh(value, offset = 0.5, selectionField = true, individual = false) {
        // Region extrude for selected triangles. New top faces are duplicated and
        // boundary edges receive side walls. Works especially well for Plane/Grid.
        const source = toIndexed(value);
        const g = source.geometry;
        if (!g?.index || !g.getAttribute('position')) return source;

        if (!g.getAttribute('normal')) g.computeVertexNormals();
        const pos = g.getAttribute('position');
        const nrm = g.getAttribute('normal');
        const idx = Array.from(g.index.array);

        const selectedFaces = [];
        const selectedVertices = new Set();
        const edgeCount = new Map();

        const addEdge = (a, b) => {
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            const item = edgeCount.get(key) || { count: 0, a, b };
            item.count++;
            edgeCount.set(key, item);
        };

        for (let f = 0; f < idx.length; f += 3) {
            const tri = [idx[f], idx[f + 1], idx[f + 2]];
            const a = tri[0];
            const ctx = {
                domain: 'FACE',
                index: f / 3,
                id: f / 3,
                position: [
                    (pos.getX(tri[0]) + pos.getX(tri[1]) + pos.getX(tri[2])) / 3,
                    (pos.getY(tri[0]) + pos.getY(tri[1]) + pos.getY(tri[2])) / 3,
                    (pos.getZ(tri[0]) + pos.getZ(tri[1]) + pos.getZ(tri[2])) / 3
                ],
                geometryData: source,
                geometry: g
            };
            if (!FieldSystem.boolean(selectionField, true, ctx)) continue;
            selectedFaces.push(tri);
            tri.forEach(v => selectedVertices.add(v));
            addEdge(tri[0], tri[1]);
            addEdge(tri[1], tri[2]);
            addEdge(tri[2], tri[0]);
        }

        if (!selectedFaces.length) return source;

        const vertices = [];
        for (let i = 0; i < pos.count; i++) {
            vertices.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        }

        const duplicate = new Map();
        for (const v of selectedVertices) {
            const id = vertices.length / 3;
            duplicate.set(v, id);
            const ctx = {
                domain: 'POINT',
                index: v,
                id: v,
                position: [pos.getX(v), pos.getY(v), pos.getZ(v)],
                normal: [nrm.getX(v), nrm.getY(v), nrm.getZ(v)],
                geometryData: source,
                geometry: g
            };
            const amount = FieldSystem.number(offset, 0.5, ctx);
            vertices.push(
                pos.getX(v) + nrm.getX(v) * amount,
                pos.getY(v) + nrm.getY(v) * amount,
                pos.getZ(v) + nrm.getZ(v) * amount
            );
        }

        const outIdx = [];
        // Keep unselected faces.
        const selectedFaceKeys = new Set(selectedFaces.map(t => t.join(',')));
        for (let f = 0; f < idx.length; f += 3) {
            const tri = [idx[f], idx[f + 1], idx[f + 2]];
            if (!selectedFaceKeys.has(tri.join(','))) outIdx.push(...tri);
        }

        // New top faces.
        selectedFaces.forEach(tri => {
            outIdx.push(duplicate.get(tri[0]), duplicate.get(tri[1]), duplicate.get(tri[2]));
        });

        // Boundary walls.
        edgeCount.forEach(edge => {
            if (edge.count !== 1) return;
            const a = edge.a;
            const b = edge.b;
            const da = duplicate.get(a);
            const db = duplicate.get(b);
            outIdx.push(a, b, db, a, db, da);
        });

        const outGeom = new THREE.BufferGeometry();
        outGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        outGeom.setIndex(outIdx);
        outGeom.computeVertexNormals();
        outGeom.computeBoundingBox();
        outGeom.computeBoundingSphere();

        const out = source.clone();
        out.geometry = outGeom;
        return out;
    }

    function solidifyGeometry(value, thickness = 0.1) {
        const source = toIndexed(value);
        const g = source.geometry;
        if (!g?.index || !g.getAttribute('position')) return source;

        if (!g.getAttribute('normal')) g.computeVertexNormals();

        const pos = g.getAttribute('position');
        const nrm = g.getAttribute('normal');
        const idx = Array.from(g.index.array);
        const count = pos.count;
        const vertices = new Float32Array(count * 6);

        const t = Number(thickness) || 0;
        for (let i = 0; i < count; i++) {
            vertices[i * 3] = pos.getX(i);
            vertices[i * 3 + 1] = pos.getY(i);
            vertices[i * 3 + 2] = pos.getZ(i);

            vertices[(count + i) * 3] = pos.getX(i) + nrm.getX(i) * t;
            vertices[(count + i) * 3 + 1] = pos.getY(i) + nrm.getY(i) * t;
            vertices[(count + i) * 3 + 2] = pos.getZ(i) + nrm.getZ(i) * t;
        }

        const outIdx = [];
        const edgeUse = new Map();
        const edge = (a,b) => {
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            const item = edgeUse.get(key) || { count: 0, a, b };
            item.count++;
            edgeUse.set(key, item);
        };

        for (let i = 0; i < idx.length; i += 3) {
            const a=idx[i], b=idx[i+1], c=idx[i+2];
            // back face
            outIdx.push(a, c, b);
            // offset/front face
            outIdx.push(count+a, count+b, count+c);
            edge(a,b); edge(b,c); edge(c,a);
        }

        // Only boundary edges need side walls.
        edgeUse.forEach(e => {
            if (e.count !== 1) return;
            const a=e.a,b=e.b,aa=count+a,bb=count+b;
            outIdx.push(a,b,bb, a,bb,aa);
        });

        const outGeom = new THREE.BufferGeometry();
        outGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        outGeom.setIndex(outIdx);
        outGeom.computeVertexNormals();
        outGeom.computeBoundingBox();
        outGeom.computeBoundingSphere();

        const out = source.clone();
        out.geometry = outGeom;
        return out;
    }

    function displaceGeometry(value, strength = 0.3, scale = 1, seed = 0, selection = true) {
        const d = data(value).clone();
        const g = d.geometry;
        if (!g) return d;
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        const pos = g.getAttribute('position');
        const nrm = g.getAttribute('normal');

        for (let i = 0; i < pos.count; i++) {
            const current = [pos.getX(i), pos.getY(i), pos.getZ(i)];
            const normal = [nrm.getX(i), nrm.getY(i), nrm.getZ(i)];
            const ctx = { domain: 'POINT', index: i, id: i, position: current, normal, geometryData: d, geometry: g };
            if (!FieldSystem.boolean(selection, true, ctx)) continue;
            const s = FieldSystem.number(scale, 1, ctx);
            const str = FieldSystem.number(strength, 0.3, ctx);
            const noise = FieldSystem.noise3(current[0] * s, current[1] * s, current[2] * s, seed) * 2 - 1;
            pos.setXYZ(i,
                current[0] + normal[0] * noise * str,
                current[1] + normal[1] * noise * str,
                current[2] + normal[2] * noise * str
            );
        }
        pos.needsUpdate = true;
        g.computeVertexNormals();
        return d;
    }

    function deleteGeometry(value, selection = false, domain = 'POINT') {
        const d = toIndexed(value);
        const g = d.geometry;
        if (!g?.index) return d;

        const pos = g.getAttribute('position');
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        const nrm = g.getAttribute('normal');
        const idx = Array.from(g.index.array);
        const kept = [];

        for (let f = 0; f < idx.length; f += 3) {
            const tri = [idx[f], idx[f + 1], idx[f + 2]];
            let shouldDelete = false;

            if (String(domain).toUpperCase() === 'FACE') {
                const center = [
                    (pos.getX(tri[0]) + pos.getX(tri[1]) + pos.getX(tri[2])) / 3,
                    (pos.getY(tri[0]) + pos.getY(tri[1]) + pos.getY(tri[2])) / 3,
                    (pos.getZ(tri[0]) + pos.getZ(tri[1]) + pos.getZ(tri[2])) / 3
                ];
                shouldDelete = FieldSystem.boolean(selection, false, {
                    domain: 'FACE', index: f / 3, id: f / 3, position: center, geometryData: d, geometry: g
                });
            } else {
                shouldDelete = tri.some(v => FieldSystem.boolean(selection, false, {
                    domain: 'POINT',
                    index: v,
                    id: v,
                    position: [pos.getX(v), pos.getY(v), pos.getZ(v)],
                    normal: [nrm.getX(v), nrm.getY(v), nrm.getZ(v)],
                    geometryData: d,
                    geometry: g
                }));
            }

            if (!shouldDelete) kept.push(...tri);
        }

        const out = d.clone();
        out.geometry.setIndex(kept);
        out.geometry.computeVertexNormals();
        return out;
    }

    function separateGeometry(value, selection = false, domain = 'FACE') {
        const selected = deleteGeometry(value, FieldSystem.lift('boolean', v => !v, selection), domain);
        const inverted = deleteGeometry(value, selection, domain);
        return [selected, inverted];
    }

    function mergeGeometries(values) {
        const list = (values || []).map(data).filter(Boolean);
        if (!list.length) return GeometryData.empty();

        const meshList = list.filter(d => d.geometry);
        let out = new GeometryData(null);

        if (meshList.length) {
            if (THREE.BufferGeometryUtils?.mergeGeometries) {
                const merged = THREE.BufferGeometryUtils.mergeGeometries(
                    meshList.map(d => d.geometry.clone()),
                    false
                );
                out.geometry = merged;
            } else {
                let merged = meshList[0].geometry.clone();
                for (let i = 1; i < meshList.length; i++) {
                    merged = mergeTwo(merged, meshList[i].geometry);
                }
                merged.computeVertexNormals();
                out.geometry = merged;
            }
        }

        list.forEach(d => {
            d.points.forEach(p => out.addPoint(p));
            d.curves.forEach(c => out.addCurve(c));
            d.instances.forEach(i => out.addInstance(i));
        });

        out.material = list.find(d => d.material)?.material || null;
        out.materialSlots = list.flatMap(d => d.materialSlots || []);
        out.metadata.joinedGeometryCount = list.length;
        return out;
    }

    function mergeTwo(a, b) {
        const aa = a.index ? a : toIndexed(new GeometryData(a)).geometry;
        const bb = b.index ? b : toIndexed(new GeometryData(b)).geometry;
        const pa = aa.getAttribute('position');
        const pb = bb.getAttribute('position');
        const positions = new Float32Array((pa.count + pb.count) * 3);
        positions.set(pa.array, 0);
        positions.set(pb.array, pa.array.length);

        const ia = Array.from(aa.index.array);
        const ib = Array.from(bb.index.array).map(i => i + pa.count);

        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        out.setIndex(ia.concat(ib));
        out.computeVertexNormals();
        return out;
    }

    function arrayGeometry(value, count = 3, offset = [2,0,0]) {
        const base = data(value);
        const list = [];
        count = Math.max(1, Math.min(1000, Math.round(Number(count) || 1)));
        const off = vec3(offset, [2,0,0]);
        for (let i = 0; i < count; i++) {
            list.push(transformGeometry(base, [off[0] * i, off[1] * i, off[2] * i], [0,0,0], [1,1,1]));
        }
        return mergeGeometries(list);
    }

    function distributePointsOnFaces(value, density = 10, seed = 0, selection = true) {
        const d = toIndexed(value);
        const g = d.geometry;
        const out = new GeometryData(null);
        if (!g?.index) return out;

        const pos = g.getAttribute('position');
        const idx = g.index.array;
        const tri = new THREE.Triangle();
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        let id = 0;

        for (let f = 0; f < idx.length; f += 3) {
            a.fromBufferAttribute(pos, idx[f]);
            b.fromBufferAttribute(pos, idx[f + 1]);
            c.fromBufferAttribute(pos, idx[f + 2]);
            tri.set(a, b, c);

            const center = tri.getMidpoint(new THREE.Vector3());
            const faceCtx = {
                domain: 'FACE',
                index: f / 3,
                id: f / 3,
                position: center.toArray(),
                geometryData: d,
                geometry: g
            };

            if (!FieldSystem.boolean(selection, true, faceCtx)) continue;

            const area = tri.getArea();
            const den = Math.max(0, FieldSystem.number(density, 10, faceCtx));
            const expected = area * den;
            const whole = Math.floor(expected);
            const fraction = expected - whole;
            const count = whole + (FieldSystem.hash(seed + f, f) < fraction ? 1 : 0);

            const faceNormal = tri.getNormal(new THREE.Vector3());

            for (let j = 0; j < count; j++) {
                const r1 = FieldSystem.hash(seed + f * 17.1, j * 2 + 1);
                const r2 = FieldSystem.hash(seed + f * 31.7, j * 2 + 2);
                const sqrtR1 = Math.sqrt(r1);
                const u = 1 - sqrtR1;
                const v = sqrtR1 * (1 - r2);
                const w = sqrtR1 * r2;

                const p = new THREE.Vector3()
                    .addScaledVector(a, u)
                    .addScaledVector(b, v)
                    .addScaledVector(c, w);

                out.addPoint({
                    position: p,
                    normal: faceNormal,
                    id: id++,
                    attributes: { faceIndex: f / 3 }
                });
            }
        }

        return out;
    }

    function instanceOnPoints(pointsValue, instanceValue, scale = [1,1,1], rotation = [0,0,0], selection = true) {
        const points = data(pointsValue);
        const instanceData = data(instanceValue);
        const out = new GeometryData(null);
        out.material = instanceData.material;

        points.points.forEach((point, index) => {
            const ctx = {
                domain: 'POINT',
                index,
                id: point.id ?? index,
                position: point.position.toArray(),
                normal: point.normal.toArray(),
                geometryData: points
            };
            if (!FieldSystem.boolean(selection, true, ctx)) return;

            const sc = FieldSystem.vector(scale, [1,1,1], ctx);
            const rot = FieldSystem.vector(rotation, [0,0,0], ctx).map(v => THREE.MathUtils.degToRad(v));
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
            const matrix = new THREE.Matrix4().compose(
                point.position.clone(),
                q,
                new THREE.Vector3(sc[0], sc[1], sc[2])
            );

            out.addInstance({
                data: instanceData,
                matrix,
                material: instanceData.material,
                id: point.id ?? index
            });
        });

        return out;
    }

    function transformInstances(value, translation = [0,0,0], rotation = [0,0,0], scale = [1,1,1]) {
        const d = data(value).clone();
        d.instances.forEach((inst, index) => {
            const ctx = { domain: 'INSTANCE', index, id: inst.id ?? index, geometryData: d };
            const tr = FieldSystem.vector(translation, [0,0,0], ctx);
            const ro = FieldSystem.vector(rotation, [0,0,0], ctx).map(v => THREE.MathUtils.degToRad(v));
            const sc = FieldSystem.vector(scale, [1,1,1], ctx);
            const local = new THREE.Matrix4().compose(
                new THREE.Vector3(...tr),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(...ro)),
                new THREE.Vector3(...sc)
            );
            inst.matrix.multiply(local);
        });
        return d;
    }

    function realizeInstances(value) {
        const d = data(value);
        const parts = [];
        if (d.geometry) parts.push(new GeometryData(d.geometry.clone(), { material: d.material }));

        d.instances.forEach(inst => {
            let instData = data(inst.data || inst.geometry);
            if (instData.hasInstances()) instData = realizeInstances(instData);
            if (!instData.geometry) return;

            const transformed = instData.geometry.clone();
            transformed.applyMatrix4(inst.matrix);
            parts.push(new GeometryData(transformed, {
                material: inst.material || instData.material
            }));
        });

        const merged = mergeGeometries(parts);
        merged.material = d.material || merged.material;
        merged.metadata.realizedInstanceCount = d.instances.length;
        return merged;
    }

    function meshToPoints(value, radius = 0.1) {
        const d = data(value);
        const out = new GeometryData(null);
        const g = d.geometry;
        const pos = g?.getAttribute?.('position');
        if (!pos) return out;
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        const nrm = g.getAttribute('normal');

        for (let i = 0; i < pos.count; i++) {
            out.addPoint({
                position: new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)),
                normal: nrm
                    ? new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i))
                    : new THREE.Vector3(0,1,0),
                scale: new THREE.Vector3(radius, radius, radius),
                id: i
            });
        }
        return out;
    }

    function curveToMesh(value, radius = 0.1, resolution = 8) {
        const d = data(value);
        const geometries = [];

        d.curves.forEach(curve => {
            if (!curve.points || curve.points.length < 2) return;
            let path;
            if (curve.points.length === 2) {
                path = new THREE.LineCurve3(curve.points[0], curve.points[1]);
            } else {
                path = new THREE.CatmullRomCurve3(curve.points, curve.cyclic, 'centripetal', 0.5);
            }
            const tubular = Math.max(2, Math.round((curve.points.length - 1) * 12));
            geometries.push(new GeometryData(new THREE.TubeGeometry(
                path,
                tubular,
                Math.max(0.0001, Number(radius ?? curve.radius ?? 0.1)),
                Math.max(3, Math.round(Number(resolution) || 8)),
                curve.cyclic
            )));
        });

        return mergeGeometries(geometries);
    }

    function resampleCurves(value, count = 16) {
        const d = data(value).clone();
        count = Math.max(2, Math.min(512, Math.round(Number(count) || 16)));
        d.curves = d.curves.map(curve => {
            if (curve.points.length < 2) return curve.clone();
            const path = curve.points.length === 2
                ? new THREE.LineCurve3(curve.points[0], curve.points[1])
                : new THREE.CatmullRomCurve3(curve.points, curve.cyclic, 'centripetal', 0.5);
            const points = path.getPoints(curve.cyclic ? count - 1 : count - 1);
            return new global.CurveData(points, { cyclic: curve.cyclic, radius: curve.radius, metadata: curve.metadata });
        });
        return d;
    }

    function booleanGeometries(aValue, bValue, operation = 'difference') {
        const a = mesh(aValue), b = mesh(bValue);
        if (!a || !b) return data(aValue).clone();

        // Support common CSG APIs if present.
        try {
            if (global.CSG?.fromMesh && global.CSG?.toMesh) {
                const ma = new THREE.Mesh(a.clone(), new THREE.MeshStandardMaterial());
                const mb = new THREE.Mesh(b.clone(), new THREE.MeshStandardMaterial());
                ma.updateMatrix();
                mb.updateMatrix();
                let ca = global.CSG.fromMesh(ma);
                const cb = global.CSG.fromMesh(mb);
                ca = operation === 'union' ? ca.union(cb)
                    : operation === 'intersect' ? ca.intersect(cb)
                    : ca.subtract(cb);
                const resultMesh = global.CSG.toMesh(ca, ma.matrix, ma.material);
                return new GeometryData(resultMesh.geometry.clone());
            }
        } catch (err) {
            console.warn('[Geometry Nodes] CSG operation failed:', err);
        }

        console.warn('[Geometry Nodes] CSG library unavailable; Boolean returns Geometry A.');
        return data(aValue).clone();
    }

    function vec3(value, fallback = [0,0,0]) {
        if (!Array.isArray(value)) return [...fallback];
        return [
            Number(value[0]) || 0,
            Number(value[1]) || 0,
            Number(value[2]) || 0
        ];
    }

    global.GeometryOps = {
        data,
        mesh,
        cloneData,
        cloneGeometry,
        toIndexed,
        mergeVertices,
        subdivideMesh,
        triangulateGeometry,
        reverseWinding,
        transformGeometry,
        setPosition,
        extrudeMesh,
        extrudeGeometry: extrudeMesh,
        solidifyGeometry,
        displaceGeometry,
        deleteGeometry,
        separateGeometry,
        mergeGeometries,
        arrayGeometry,
        distributePointsOnFaces,
        instanceOnPoints,
        transformInstances,
        realizeInstances,
        meshToPoints,
        curveToMesh,
        resampleCurves,
        booleanGeometries
    };
})(typeof window !== 'undefined' ? window : globalThis);