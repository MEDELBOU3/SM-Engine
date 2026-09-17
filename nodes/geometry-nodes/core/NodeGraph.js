// ============================================================================
// NodeGraph v2 — pure Geometry Nodes graph model.
// ============================================================================
(function (global) {
    'use strict';

    const NodeSocket = global.NodeSocket;

    class NodeGraph {
        constructor() {
            this.version = 2;
            this.metadata = { name: 'Geometry Nodes' };
            this.nodes = [];
            this.connections = [];
            this.groups = [];
            this.nodeIdCounter = 0;
            this.groupIdCounter = 0;
            this.connectionIdCounter = 0;
            this.dirty = new Set();
            this._cache = new Map();
        }

        nextNodeId() { return `node_${this.nodeIdCounter++}`; }
        nextGroupId() { return `group_${this.groupIdCounter++}`; }
        nextConnectionId() { return `link_${this.connectionIdCounter++}`; }

        findNode(id) { return this.nodes.find(n => n.id === id) || null; }
        findGroup(id) { return this.groups.find(g => g.id === id) || null; }
        getInputConnections(nodeId) { return this.connections.filter(c => c.toId === nodeId); }
        getOutputConnections(nodeId) { return this.connections.filter(c => c.fromId === nodeId); }

        addNode(type, x = 80, y = 80, registry) {
            const def = registry?.get?.(type);
            if (!def) return null;

            const id = this.nextNodeId();
            const inputs = (def.inputs || []).map((s, i) => ({
                name: s.name,
                type: s.type || 'any',
                default: s.default,
                min: s.min,
                max: s.max,
                step: s.step,
                opts: s.opts ? [...s.opts] : null,
                hideValue: !!s.hideValue,
                multiInput: !!s.multiInput,
                optional: !!s.optional,
                domain: s.domain || null,
                node: id,
                index: i
            }));

            const outputs = (def.outputs || []).map((s, i) => ({
                name: s.name,
                type: s.type || 'any',
                domain: s.domain || null,
                node: id,
                index: i
            }));

            const node = {
                id,
                type,
                schema: def,
                color: def.color || '#666666',
                x: Number(x) || 0,
                y: Number(y) || 0,
                w: def.w || 190,
                h: 44,
                inputs,
                outputs,
                value: def.defaultValue !== undefined ? structuredCloneSafe(def.defaultValue) : null,
                params: {},
                isOutput: !!def.isOutput,
                isInput: !!def.isInput,
                widget: def.widget || null,
                selected: false,
                muted: false,
                label: '',
                evalError: null,
                evalTime: null
            };

            this._updateHeight(node);
            this.nodes.push(node);
            this.markDirty(node.id, true);
            return node;
        }

        _updateHeight(node) {
            const rows = Math.max(node.inputs?.length || 0, node.outputs?.length || 0, 1);
            const extra = node.widget ? 26 : 0;
            node.h = Math.max(node.schema?.minHeight || 68, 44 + rows * 24 + extra);
        }

        removeNode(id) {
            const downstream = this.getOutputConnections(id).map(c => c.toId);
            this.nodes = this.nodes.filter(n => n.id !== id);
            this.connections = this.connections.filter(c => c.fromId !== id && c.toId !== id);
            this.groups.forEach(g => { g.nodeIds = (g.nodeIds || []).filter(nid => nid !== id); });
            this.groups = this.groups.filter(g => (g.nodeIds || []).length > 0);
            this._cache.delete(id);
            downstream.forEach(nid => this.markDirty(nid, true));
        }

        addConnection(fromId, fromSocket, toId, toSocket) {
            const fromNode = this.findNode(fromId);
            const toNode = this.findNode(toId);
            const validation = this.validateConnection(fromNode, toNode, fromSocket, toSocket);
            if (!validation.valid) return false;

            const input = toNode.inputs[toSocket];
            if (!input?.multiInput) {
                this.connections = this.connections.filter(c => !(c.toId === toId && c.toSocket === toSocket));
            }

            const duplicate = this.connections.some(c =>
                c.fromId === fromId && c.fromSocket === fromSocket &&
                c.toId === toId && c.toSocket === toSocket
            );
            if (duplicate) return true;

            this.connections.push({
                id: this.nextConnectionId(),
                fromId,
                fromSocket,
                toId,
                toSocket
            });

            this.markDirty(toId, true);
            return true;
        }

        removeConnectionById(connectionOrId) {
            const id = typeof connectionOrId === 'string' ? connectionOrId : connectionOrId?.id;
            const target = typeof connectionOrId === 'object' ? connectionOrId : this.connections.find(c => c.id === id);
            this.connections = this.connections.filter(c => c !== target && c.id !== id);
            if (target?.toId) this.markDirty(target.toId, true);
        }

        wouldCreate(fromId, toId) {
            if (fromId === toId) return true;
            // Adding from -> to creates a cycle only if TO already reaches FROM.
            const visited = new Set();
            const stack = [toId];
            while (stack.length) {
                const id = stack.pop();
                if (visited.has(id)) continue;
                visited.add(id);
                if (id === fromId) return true;
                this.getOutputConnections(id).forEach(c => stack.push(c.toId));
            }
            return false;
        }

        validateConnection(fromNode, toNode, fromSocket, toSocket) {
            const errors = [];
            if (!fromNode || !toNode) errors.push('node missing');
            if (fromNode && (fromSocket < 0 || fromSocket >= fromNode.outputs.length)) errors.push('bad output socket');
            if (toNode && (toSocket < 0 || toSocket >= toNode.inputs.length)) errors.push('bad input socket');
            if (errors.length) return { valid: false, errors };

            const outType = fromNode.outputs[fromSocket]?.type || 'any';
            const inType = toNode.inputs[toSocket]?.type || 'any';

            if (NodeSocket && !NodeSocket.canConnect(outType, inType)) {
                errors.push(`${outType} → ${inType}`);
            }

            if (this.wouldCreate(fromNode.id, toNode.id)) errors.push('circular dependency');

            return { valid: errors.length === 0, errors };
        }

        markDirty(nodeId, downstream = false) {
            if (!nodeId) return;
            const stack = [nodeId];
            const visited = new Set();
            while (stack.length) {
                const id = stack.pop();
                if (visited.has(id)) continue;
                visited.add(id);
                this.dirty.add(id);
                this._cache.delete(id);
                if (downstream) this.getOutputConnections(id).forEach(c => stack.push(c.toId));
            }
        }

        clearDirty(ids = null) {
            if (!ids) this.dirty.clear();
            else ids.forEach(id => this.dirty.delete(id));
        }

        dirtyNodes() { return [...this.dirty]; }
        hasDirty() { return this.dirty.size > 0; }
        resetDirty(ids = []) { ids.forEach(id => this.dirty.delete(id)); }

        clone(registry) {
            return NodeGraph.fromJSON(this.toJSON(), registry);
        }

        toJSON() {
            return {
                type: 'GeometryNodeGraph',
                version: this.version,
                metadata: { ...this.metadata },
                nodes: this.nodes.map(n => ({
                    id: n.id,
                    type: n.type,
                    x: n.x,
                    y: n.y,
                    w: n.w,
                    h: n.h,
                    value: structuredCloneSafe(n.value),
                    params: structuredCloneSafe(n.params || {}),
                    muted: !!n.muted,
                    label: n.label || ''
                })),
                connections: this.connections.map(c => ({ ...c })),
                groups: this.groups.map(g => ({
                    ...g,
                    nodeIds: [...(g.nodeIds || [])]
                }))
            };
        }

        static fromJSON(data, registry) {
            const g = new NodeGraph();
            if (global.NodeSerializer) return global.NodeSerializer.fromJSON(data, registry, g);
            return g;
        }
    }

    function structuredCloneSafe(value) {
        if (value == null) return value;
        if (typeof structuredClone === 'function') {
            try { return structuredClone(value); } catch (_) {}
        }
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
    }

    global.NodeGraph = NodeGraph;
})(typeof window !== 'undefined' ? window : globalThis);