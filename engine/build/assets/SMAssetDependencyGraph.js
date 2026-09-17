(function () {
    'use strict';
    class SMAssetDependencyGraph {
        constructor() {
            this.nodes = new Map();
            this.edges = new Map();
            this.reverseEdges = new Map();
        }
        addNode(id, data = {}) {
            const key = this._key(id);
            if (!key) throw new Error('SMAssetDependencyGraph.addNode() requires id.');
            const existing = this.nodes.get(key);
            const node = existing || { id: key, type: String(data.type || 'asset'), path: data.path || key, external: data.external === true, metadata: {} };
            Object.assign(node, { ...data, id: key, metadata: { ...(existing?.metadata || {}), ...(data.metadata || {}) } });
            this.nodes.set(key, node);
            if (!this.edges.has(key)) this.edges.set(key, new Set());
            if (!this.reverseEdges.has(key)) this.reverseEdges.set(key, new Set());
            return node;
        }
        addDependency(from, to, data = {}) {
            const source = this._key(from);
            const target = this._key(to);
            if (!source || !target || source === target) return false;
            this.addNode(source, data.from || {});
            this.addNode(target, data.to || {});
            this.edges.get(source).add(target);
            this.reverseEdges.get(target).add(source);
            return true;
        }
        removeNode(id) {
            const key = this._key(id);
            if (!this.nodes.has(key)) return false;
            for (const dep of this.edges.get(key) || []) this.reverseEdges.get(dep)?.delete(key);
            for (const parent of this.reverseEdges.get(key) || []) this.edges.get(parent)?.delete(key);
            this.edges.delete(key);
            this.reverseEdges.delete(key);
            this.nodes.delete(key);
            return true;
        }
        has(id) { return this.nodes.has(this._key(id)); }
        get(id) { return this.nodes.get(this._key(id)) || null; }
        getDependencies(id, options = {}) {
            const key = this._key(id);
            if (options.recursive !== true) return Array.from(this.edges.get(key) || []);
            const visited = new Set();
            const visit = current => { for (const dep of this.edges.get(current) || []) { if (visited.has(dep)) continue; visited.add(dep); visit(dep); } };
            visit(key);
            return Array.from(visited);
        }
        getDependents(id, options = {}) {
            const key = this._key(id);
            if (options.recursive !== true) return Array.from(this.reverseEdges.get(key) || []);
            const visited = new Set();
            const visit = current => { for (const parent of this.reverseEdges.get(current) || []) { if (visited.has(parent)) continue; visited.add(parent); visit(parent); } };
            visit(key);
            return Array.from(visited);
        }
        reachableFrom(roots = []) {
            const result = new Set();
            const stack = (Array.isArray(roots) ? roots : [roots]).map(id => this._key(id)).filter(Boolean);
            while (stack.length) {
                const id = stack.pop();
                if (result.has(id)) continue;
                result.add(id);
                for (const dep of this.edges.get(id) || []) stack.push(dep);
            }
            return result;
        }
        findCycles() {
            const cycles = [];
            const visiting = new Set();
            const visited = new Set();
            const path = [];
            const visit = id => {
                if (visiting.has(id)) { const index = path.indexOf(id); cycles.push([...path.slice(index), id]); return; }
                if (visited.has(id)) return;
                visiting.add(id);
                path.push(id);
                for (const dep of this.edges.get(id) || []) visit(dep);
                path.pop();
                visiting.delete(id);
                visited.add(id);
            };
            for (const id of this.nodes.keys()) visit(id);
            return this._uniqueCycles(cycles);
        }
        topologicalSort() {
            const indegree = new Map(Array.from(this.nodes.keys(), id => [id, 0]));
            for (const deps of this.edges.values()) for (const dep of deps) indegree.set(dep, (indegree.get(dep) || 0) + 1);
            const queue = Array.from(indegree.entries()).filter(([, degree]) => degree === 0).map(([id]) => id).sort();
            const order = [];
            while (queue.length) {
                const id = queue.shift();
                order.push(id);
                for (const dep of this.edges.get(id) || []) { const next = (indegree.get(dep) || 0) - 1; indegree.set(dep, next); if (next === 0) { queue.push(dep); queue.sort(); } }
            }
            const cyclic = Array.from(this.nodes.keys()).filter(id => !order.includes(id));
            return { order, cyclic, ok: cyclic.length === 0 };
        }
        pruneUnreachable(roots = []) {
            const keep = this.reachableFrom(roots);
            const removed = [];
            for (const id of Array.from(this.nodes.keys())) if (!keep.has(id)) { removed.push(id); this.removeNode(id); }
            return removed;
        }
        serialize() {
            return { nodes: Array.from(this.nodes.values()).map(node => this._clone(node)), edges: Array.from(this.edges, ([id, deps]) => [id, Array.from(deps)]) };
        }
        clear() {
            this.nodes.clear();
            this.edges.clear();
            this.reverseEdges.clear();
        }
        _key(value) {
            return String(value?.id || value?.path || value || '').trim().replace(/\\/g, '/');
        }
        _uniqueCycles(cycles) {
            const seen = new Set();
            const output = [];
            for (const cycle of cycles) {
                const body = cycle.slice(0, -1);
                if (!body.length) continue;
                const rotations = body.map((_, i) => [...body.slice(i), ...body.slice(0, i)].join('>'));
                const key = rotations.sort()[0];
                if (seen.has(key)) continue;
                seen.add(key);
                output.push(cycle);
            }
            return output;
        }
        _clone(value) {
            try { return structuredClone(value); } catch { }
            return JSON.parse(JSON.stringify(value));
        }
        debug() {
            const state = { nodes: this.nodes.size, edges: Array.from(this.edges.values()).reduce((sum, set) => sum + set.size, 0), cycles: this.findCycles() };
            console.log('[SMAssetDependencyGraph]', state);
            return state;
        }
    }
    window.SMAssetDependencyGraph = SMAssetDependencyGraph;
    window.SMAssetDependencyGraphClass = SMAssetDependencyGraph;
})();