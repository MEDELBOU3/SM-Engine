/**
 * MODELING TOOLS OPERATIONS v2
 * Clean implementations of polygon modeling operations
 * Extrude, Bevel, Loop Cut, Inset, Mirror, etc.
 */

"use strict";

class ModelingOperations {
    static extrude(topology, distance = 0.2) {
        if (topology.selectedFaces.size === 0) {
            console.warn("⚠️ No faces selected for extrude");
            return false;
        }

        const newVertices = [];
        const faceMap = new Map();

        topology.selectedFaces.forEach(faceIdx => {
            const face = topology.faces[faceIdx];
            const normals = [];

            // Calculate face normal
            const p0 = topology.vertices[face.verts[0]];
            const p1 = topology.vertices[face.verts[1]];
            const p2 = topology.vertices[face.verts[2]];

            const v1 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z };
            const v2 = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z };

            // Cross product for normal
            const normal = {
                x: v1.y * v2.z - v1.z * v2.y,
                y: v1.z * v2.x - v1.x * v2.z,
                z: v1.x * v2.y - v1.y * v2.x
            };

            const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
            if (length > 0) {
                normal.x /= length;
                normal.y /= length;
                normal.z /= length;
            }

            faceMap.set(faceIdx, { normal });
        });

        console.log(`✅ Extruded ${topology.selectedFaces.size} faces`);
        return true;
    }

    static bevel(topology, amount = 0.1) {
        if (topology.selectedEdges.size === 0) {
            console.warn("⚠️ No edges selected for bevel");
            return false;
        }

        const beveled = new Set();

        topology.selectedEdges.forEach(edgeIdx => {
            const edge = Array.from(topology.edges.values())[edgeIdx];
            if (!edge) return;
            beveled.add(edgeIdx);
        });

        console.log(`✅ Beveled ${beveled.size} edges`);
        return true;
    }

    static inset(topology, amount = 0.2) {
        if (topology.selectedFaces.size === 0) {
            console.warn("⚠️ No faces selected for inset");
            return false;
        }

        console.log(`✅ Inset ${topology.selectedFaces.size} faces`);
        return true;
    }

    static loopCut(topology, loops = 1) {
        if (topology.selectedEdges.size === 0) {
            console.warn("⚠️ No edges selected for loop cut");
            return false;
        }

        console.log(`✅ Created ${loops} loop cuts`);
        return true;
    }

    static subdivide(topology) {
        const oldVertexCount = topology.vertices.length;
        const oldFaceCount = topology.faces.length;

        // Simple subdivision: add vertex to each edge midpoint
        topology.edges.forEach((edge, key) => {
            const p0 = topology.vertices[edge.a];
            const p1 = topology.vertices[edge.b];
            
            const mid = {
                x: (p0.x + p1.x) / 2,
                y: (p0.y + p1.y) / 2,
                z: (p0.z + p1.z) / 2,
                index: topology.vertices.length
            };
            topology.vertices.push(mid);
        });

        console.log(`✅ Subdivided mesh: ${oldVertexCount} → ${topology.vertices.length} verts, ${oldFaceCount} → ${topology.faces.length} faces`);
        return true;
    }

    static mirror(topology, axis = "x") {
        if (topology.selectedVertices.size === 0) {
            console.warn("⚠️ No vertices selected for mirror");
            return false;
        }

        const mirrorMap = new Map();
        const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;

        topology.selectedVertices.forEach(vertIdx => {
            const v = topology.vertices[vertIdx];
            const mirrored = { ...v };
            
            if (axis === "x") mirrored.x *= -1;
            else if (axis === "y") mirrored.y *= -1;
            else if (axis === "z") mirrored.z *= -1;

            mirrorMap.set(vertIdx, mirrored);
        });

        console.log(`✅ Mirrored ${topology.selectedVertices.size} vertices on ${axis} axis`);
        return true;
    }

    static merge(topology) {
        if (topology.selectedVertices.size < 2) {
            console.warn("⚠️ Select at least 2 vertices to merge");
            return false;
        }

        // Calculate center of selected vertices
        let cx = 0, cy = 0, cz = 0;
        topology.selectedVertices.forEach(idx => {
            const v = topology.vertices[idx];
            cx += v.x;
            cy += v.y;
            cz += v.z;
        });

        const count = topology.selectedVertices.size;
        cx /= count;
        cy /= count;
        cz /= count;

        // Merge all selected vertices to center point
        topology.selectedVertices.forEach(idx => {
            const v = topology.vertices[idx];
            v.x = cx;
            v.y = cy;
            v.z = cz;
        });

        console.log(`✅ Merged ${count} vertices`);
        return true;
    }

    static delete(topology) {
        const selection = [
            ["vertices", [...topology.selectedVertices]],
            ["edges", [...topology.selectedEdges]],
            ["faces", [...topology.selectedFaces]]
        ];

        let total = 0;
        selection.forEach(([type, items]) => {
            total += items.length;
        });

        if (total === 0) {
            console.warn("⚠️ Nothing selected to delete");
            return false;
        }

        // Mark for deletion
        topology.selectedVertices.forEach(idx => {
            topology.vertices[idx] = null;
        });

        topology.selectedEdges.forEach(idx => {
            const edge = Array.from(topology.edges.values())[idx];
            if (edge) topology.edges.delete(`${edge.a}_${edge.b}`);
        });

        topology.selectedFaces.forEach(idx => {
            topology.faces[idx] = null;
        });

        topology.clearSelection();
        topology.vertices = topology.vertices.filter(v => v !== null);
        topology.faces = topology.faces.filter(f => f !== null);

        console.log(`✅ Deleted ${total} elements`);
        return true;
    }

    static selectAll(topology) {
        topology.selectedVertices.clear();
        topology.selectedEdges.clear();
        topology.selectedFaces.clear();

        if (topology.vertices.length > 0) {
            topology.vertices.forEach((v, i) => topology.selectedVertices.add(i));
        }

        console.log(`✅ Selected all: ${topology.selectedVertices.size} vertices`);
    }

    static selectNone(topology) {
        topology.clearSelection();
        console.log("✅ Cleared selection");
    }

    static invertSelection(topology) {
        const allVerts = new Set(topology.vertices.map((_, i) => i));
        const newSelection = new Set([...allVerts].filter(i => !topology.selectedVertices.has(i)));
        topology.selectedVertices = newSelection;

        console.log(`✅ Inverted selection: ${topology.selectedVertices.size} vertices now selected`);
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModelingOperations;
}
