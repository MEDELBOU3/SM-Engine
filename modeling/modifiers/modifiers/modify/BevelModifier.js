//modifiers/modifiers/modify/BevelModifier.js
// Bevels sharp edges on a mesh — mirrors Blender's Bevel modifier.
// Works by detecting sharp edges (above angle threshold), then splitting and offsetting them.

(function () {
    const root = window.SMModifiers = window.SMModifiers || {};

    class BevelModifier extends root.ModifierBase {
        defineSchema() {
            return {
                width:          { type: "float",  default: 0.05, min: 0,     max: 100,  label: "Width" },
                segments:       { type: "int",    default: 1,    min: 1,     max: 16,   label: "Segments" },
                // Limit method: "angle" | "weight" | "none"
                limitMethod:    { type: "select", default: "angle",                     label: "Limit Method",
                                  options: ["angle", "none"] },
                angleThreshold: { type: "float",  default: 30,   min: 0,     max: 180,  label: "Angle (°)" },
                // Profile: 0 = straight, 0.5 = concave, 1 = convex (super-ellipse control)
                profile:        { type: "float",  default: 0.5,  min: 0,     max: 1,    label: "Profile" },
                // Clamp overlap so bevel doesn't exceed edge length / 2
                clampOverlap:   { type: "bool",   default: true,                        label: "Clamp Overlap" },
                // Miter types
                outerMiter:     { type: "select", default: "sharp",                     label: "Outer Miter",
                                  options: ["sharp", "patch", "arc"] },
                innerMiter:     { type: "select", default: "sharp",                     label: "Inner Miter",
                                  options: ["sharp", "arc"] },
                // Harden normals on bevel faces
                hardenNormals:  { type: "bool",   default: false,                       label: "Harden Normals" },
            };
        }

        apply(geometry, object) {
            const p = this.getParams();
            // For a pure JS implementation we work on the non-indexed triangle soup.
            // The approach:
            //   1. Detect sharp edges (face-pair angle > threshold)
            //   2. For each sharp edge, inset it along adjacent face normals
            //   3. Fill bevel strip with (segments) sub-divisions
            const geo = root.GeometryUtils.ensureNonIndexed(geometry);
            geo.computeVertexNormals();

            if (p.limitMethod === "none") return geo; // No-op in unlimited mode as safety

            const cosThreshold = Math.cos(THREE.MathUtils.degToRad(p.angleThreshold));

            // Build edge → face adjacency
            const edges = this._buildEdgeMap(geo);
            const sharpEdges = this._findSharpEdges(edges, geo, cosThreshold);

            if (sharpEdges.length === 0) return geo;

            // Build bevel strips for each sharp edge
            const bevelStrips = sharpEdges.flatMap(edge =>
                this._buildBevelStrip(edge, geo, p)
            );

            const allGeos = [geo, ...bevelStrips.filter(Boolean)];
            const result = root.GeometryUtils.mergeNonIndexedGeometries(allGeos);
            result.computeVertexNormals();
            return result;
        }

        _buildEdgeMap(geometry) {
            const position = geometry.getAttribute("position");
            const edges = new Map();

            const posKey = (i) =>
                `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;

            for (let tri = 0; tri < position.count; tri += 3) {
                const triNormal = new THREE.Vector3();
                const a = new THREE.Vector3().fromBufferAttribute(position, tri);
                const b = new THREE.Vector3().fromBufferAttribute(position, tri+1);
                const c = new THREE.Vector3().fromBufferAttribute(position, tri+2);
                triNormal.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();

                for (let e = 0; e < 3; e++) {
                    const ia = tri + e;
                    const ib = tri + (e + 1) % 3;
                    const ka = posKey(ia), kb = posKey(ib);
                    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;

                    if (!edges.has(key)) {
                        edges.set(key, {
                            va: new THREE.Vector3().fromBufferAttribute(position, ia),
                            vb: new THREE.Vector3().fromBufferAttribute(position, ib),
                            faces: []
                        });
                    }
                    edges.get(key).faces.push({ normal: triNormal.clone(), tri, localEdge: e });
                }
            }
            return edges;
        }

        _findSharpEdges(edges, geometry, cosThreshold) {
            const sharp = [];
            for (const [, edge] of edges) {
                if (edge.faces.length !== 2) continue; // boundary edge — skip
                const dot = edge.faces[0].normal.dot(edge.faces[1].normal);
                if (dot < cosThreshold) { // angle is sharp
                    sharp.push(edge);
                }
            }
            return sharp;
        }

        _buildBevelStrip(edge, geometry, p) {
            const { va, vb, faces } = edge;
            if (faces.length < 2) return [];

            const width = p.width;
            const segs  = p.segments;
            const n1 = faces[0].normal;
            const n2 = faces[1].normal;

            // Direction perpendicular to edge, in each face's plane
            const edgeDir = vb.clone().sub(va).normalize();
            const perp1   = n1.clone().cross(edgeDir).normalize();
            const perp2   = n2.clone().cross(edgeDir).negate().normalize();

            // Bevel strip: (segs+1) ring of vertices between two offset lines
            const strips = [];
            for (let s = 0; s <= segs; s++) {
                const t = s / segs;
                // Profile interpolation (super-ellipse shape)
                const curve = this._profileCurve(t, p.profile);
                const lerpedPerp = perp1.clone().lerp(perp2, curve).normalize();
                const offset = lerpedPerp.multiplyScalar(width);
                strips.push([
                    va.clone().add(offset),
                    vb.clone().add(offset)
                ]);
            }

            // Build quads between consecutive strip rows
            const positions = [];
            for (let s = 0; s < segs; s++) {
                const [a0, b0] = strips[s];
                const [a1, b1] = strips[s+1];
                // Quad → 2 triangles
                positions.push(
                    ...a0.toArray(), ...b0.toArray(), ...a1.toArray(),
                    ...b0.toArray(), ...b1.toArray(), ...a1.toArray()
                );
            }

            if (positions.length === 0) return [];
            const geo = new THREE.BufferGeometry();
            geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
            return [geo];
        }

        // Maps t=[0..1] through profile shape: 0=linear, 0.5=arc, 1=super-convex
        _profileCurve(t, profile) {
            if (profile <= 0) return t;
            if (Math.abs(profile - 0.5) < 0.001) {
                // Circular arc
                const angle = t * Math.PI * 0.5;
                return 1 - Math.cos(angle);
            }
            // Generalized power curve
            const p = profile < 0.5 ? 1 / (2 * profile) : 2 * (1 - profile);
            return Math.pow(t, p);
        }
    }

    root.BevelModifier = BevelModifier;
})();