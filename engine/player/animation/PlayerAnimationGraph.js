// SM Engine - Serializable player animation graph asset.
(function () {
    class PlayerAnimationGraph {
        constructor(data = {}) {
            this.version = Number(data.version) || 1;
            this.name = data.name || 'Player Animation Graph';
            this.nodes = Array.isArray(data.nodes) ? data.nodes.map(node => ({ ...node, data: { ...(node.data || {}) } })) : [];
            this.connections = Array.isArray(data.connections) ? data.connections.map(connection => ({ ...connection })) : [];
            this.parameters = Array.isArray(data.parameters) ? data.parameters.map(parameter => ({ ...parameter })) : [];
        }
        addNode(node) {
            if (!node?.id) throw new Error('Animation graph nodes require an id.');
            this.removeNode(node.id);
            this.nodes.push({ ...node, data: { ...(node.data || {}) } });
            return this;
        }
        removeNode(id) {
            this.nodes = this.nodes.filter(node => node.id !== id);
            this.connections = this.connections.filter(connection => connection.fromNodeId !== id && connection.toNodeId !== id);
            return this;
        }
        connect(connection) {
            if (!connection?.fromNodeId || !connection?.toNodeId) throw new Error('Animation graph connections require source and target nodes.');
            this.connections.push({ ...connection });
            return this;
        }
        toJSON() {
            return {
                version: this.version,
                name: this.name,
                nodes: this.nodes.map(node => ({ ...node, data: { ...(node.data || {}) } })),
                connections: this.connections.map(connection => ({ ...connection })),
                parameters: this.parameters.map(parameter => ({ ...parameter }))
            };
        }
        static fromJSON(data) { return new PlayerAnimationGraph(data || {}); }
    }
    window.PlayerAnimationGraph = PlayerAnimationGraph;
})();
