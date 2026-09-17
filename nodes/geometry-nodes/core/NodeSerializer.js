// ============================================================================
// NodeSerializer v2 — versioned .gnode persistence with migration support.
// ============================================================================
(function (global) {
    'use strict';

    const FORMAT_VERSION = 2;

    class NodeSerializer {
        static toJSON(graph, extra = {}) {
            return {
                type: 'GeometryNodeGraph',
                version: FORMAT_VERSION,
                metadata: { ...(graph.metadata || {}), ...extra },
                nodes: graph.nodes.map(n => ({
                    id: n.id,
                    type: n.type,
                    x: n.x,
                    y: n.y,
                    w: n.w,
                    h: n.h,
                    value: cloneJSON(n.value),
                    params: cloneJSON(n.params || {}),
                    muted: !!n.muted,
                    label: n.label || ''
                })),
                connections: graph.connections.map(c => ({
                    id: c.id,
                    fromId: c.fromId,
                    fromSocket: c.fromSocket,
                    toId: c.toId,
                    toSocket: c.toSocket
                })),
                groups: graph.groups.map(g => ({
                    id: g.id,
                    title: g.title,
                    stroke: g.stroke,
                    x: g.x,
                    y: g.y,
                    w: g.w,
                    h: g.h,
                    nodeIds: [...(g.nodeIds || [])]
                }))
            };
        }

        static serialize(graph, extra) {
            return JSON.stringify(this.toJSON(graph, extra), null, 2);
        }

        static fromJSON(data, registry, graph = null) {
            if (typeof data === 'string') data = JSON.parse(data);
            if (!data || data.type !== 'GeometryNodeGraph') {
                throw new Error('Not a valid Geometry Nodes graph (.gnode)');
            }

            graph = graph || new global.NodeGraph();
            graph.version = FORMAT_VERSION;
            graph.metadata = { ...(data.metadata || {}) };
            graph.nodes.length = 0;
            graph.connections.length = 0;
            graph.groups.length = 0;
            graph._cache.clear();
            graph.dirty.clear();
            graph.nodeIdCounter = 0;
            graph.groupIdCounter = 0;
            graph.connectionIdCounter = 0;

            const idMap = new Map();

            (data.nodes || []).forEach(d => {
                const node = graph.addNode(d.type, d.x ?? 0, d.y ?? 0, registry);
                if (!node) {
                    console.warn('[Geometry Nodes] Unknown node type during load:', d.type);
                    return;
                }

                const generatedId = node.id;
                node.id = d.id || generatedId;
                node.inputs.forEach((s, i) => { s.node = node.id; s.index = i; });
                node.outputs.forEach((s, i) => { s.node = node.id; s.index = i; });
                node.w = d.w || node.w;
                node.h = d.h || node.h;
                node.value = d.value !== undefined ? cloneJSON(d.value) : node.value;
                node.params = cloneJSON(d.params || {});
                node.muted = !!d.muted;
                node.label = d.label || '';
                idMap.set(generatedId, node.id);

                graph.nodeIdCounter = Math.max(graph.nodeIdCounter, numericSuffix(node.id) + 1);
            });

            (data.connections || []).forEach(c => {
                if (!graph.findNode(c.fromId) || !graph.findNode(c.toId)) return;
                graph.connections.push({
                    id: c.id || graph.nextConnectionId(),
                    fromId: c.fromId,
                    fromSocket: Number(c.fromSocket) || 0,
                    toId: c.toId,
                    toSocket: Number(c.toSocket) || 0
                });
                graph.connectionIdCounter = Math.max(graph.connectionIdCounter, numericSuffix(c.id) + 1);
            });

            (data.groups || []).forEach(g => {
                graph.groups.push({
                    id: g.id || graph.nextGroupId(),
                    title: g.title || 'Frame',
                    stroke: g.stroke || '#5b5b5b',
                    x: Number(g.x) || 0,
                    y: Number(g.y) || 0,
                    w: Number(g.w) || 300,
                    h: Number(g.h) || 180,
                    nodeIds: (g.nodeIds || []).filter(id => !!graph.findNode(id))
                });
                graph.groupIdCounter = Math.max(graph.groupIdCounter, numericSuffix(g.id) + 1);
            });

            graph.dirty.clear();
            graph._cache.clear();
            graph.nodes.forEach(n => graph.markDirty(n.id, false));
            return graph;
        }

        static parse(text, registry, graph) {
            return this.fromJSON(JSON.parse(text), registry, graph);
        }
    }

    function cloneJSON(value) {
        if (value == null) return value;
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
    }

    function numericSuffix(id) {
        const m = String(id || '').match(/(\d+)$/);
        return m ? Number(m[1]) || 0 : 0;
    }

    global.NodeSerializer = NodeSerializer;
    global.GeoNodeSerializer = NodeSerializer;
})(typeof window !== 'undefined' ? window : globalThis);