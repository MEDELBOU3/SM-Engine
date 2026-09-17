// ============================================================================
// NodeEvaluator v2 — dependency-driven, cached Geometry Nodes evaluator.
// Supports create/apply/field/evaluate handlers and multi-output nodes.
// ============================================================================
(function (global) {
    'use strict';

    class NodeEvaluator {
        constructor(graph, registry) {
            this.graph = graph;
            this.registry = registry;
            this.profile = {};
            this.totalTime = 0;
            this.lastResult = null;
            this.lastMaterial = null;
            this.onError = null;
            this._pass = 0;
        }

        _now() {
            return global.performance?.now ? global.performance.now() : Date.now();
        }

        getResult(node) { return this.graph?._cache.get(node.id) || null; }
        clearCache() { this.graph?._cache.clear(); }

        _resolveConnectionValue(node, inputIndex, changedSet) {
            const conns = this.graph.getInputConnections(node.id).filter(c => c.toSocket === inputIndex);
            const input = node.inputs[inputIndex];

            if (!conns.length) {
                const override = node.params && node.params[input.name] !== undefined
                    ? node.params[input.name]
                    : undefined;
                return override !== undefined ? override : input.default;
            }

            if (input?.multiInput) {
                return conns.map(conn => {
                    const src = this.graph.findNode(conn.fromId);
                    const out = src ? this._computeNode(src, changedSet) : null;
                    return out?.outputs?.[conn.fromSocket] ?? null;
                });
            }

            const conn = conns[0];
            const src = this.graph.findNode(conn.fromId);
            const out = src ? this._computeNode(src, changedSet) : null;
            return out?.outputs?.[conn.fromSocket] ?? input.default;
        }

        _computeNode(node, changedSet) {
            const graph = this.graph;
            const schema = node.schema || this.registry.get(node.type) || {};
            const cached = graph._cache.get(node.id);
            const dynamic = !!schema.dynamic;
            const dirty = graph.dirty.has(node.id) || changedSet.has(node.id) || dynamic;

            if (!dirty && cached) return cached;

            const t0 = this._now();
            const values = {};
            let outputs = [];

            try {
                node.inputs.forEach((inp, i) => {
                    values[inp.name] = this._resolveConnectionValue(node, i, changedSet);
                });

                const context = {
                    evaluator: this,
                    graph,
                    registry: this.registry,
                    node,
                    THREE: global.THREE,
                    GeometryData: global.GeometryData,
                    GeometryField: global.GeometryField,
                    FieldSystem: global.FieldSystem,
                    GeometryOps: global.GeometryOps,
                    globals: global,
                    pass: this._pass,
                    time: typeof global.currentTime === 'number'
                        ? global.currentTime
                        : (global.performance?.now ? global.performance.now() / 1000 : Date.now() / 1000)
                };

                if (node.muted && node.inputs.length && node.outputs.length) {
                    outputs[0] = values[node.inputs[0].name];
                } else if (typeof schema.evaluate === 'function') {
                    const result = schema.evaluate(values, context, node);
                    outputs = normalizeOutputs(result, node.outputs.length);
                } else if (typeof schema.field === 'function') {
                    const result = schema.field(values, node, context);
                    outputs = schema.hasMultipleOutputs && Array.isArray(result)
                        ? result
                        : [result];
                } else if (typeof schema.create === 'function') {
                    const result = schema.create(values, node, context);
                    outputs = normalizeOutputs(result, node.outputs.length);
                } else if (typeof schema.apply === 'function') {
                    const firstGeometryInput = node.inputs.find(inp => inp.type === 'geometry');
                    const primary = schema.primaryInput
                        ? values[schema.primaryInput]
                        : firstGeometryInput
                            ? values[firstGeometryInput.name]
                            : null;

                    const result = schema.apply(primary, values, context, node);
                    outputs = normalizeOutputs(result == null ? primary : result, node.outputs.length);
                } else if (node.isOutput) {
                    outputs = node.inputs.map(inp => values[inp.name]);
                } else if (schema.outputRef) {
                    outputs = normalizeOutputs(schema.outputRef(this, node, values, context), node.outputs.length);
                }

                const result = { outputs, values };
                graph._cache.set(node.id, result);
                graph.dirty.delete(node.id);
                node.evalError = null;
                changedSet.add(node.id);
                return result;
            } catch (err) {
                node.evalError = err?.message || String(err);
                const failed = { outputs: new Array(node.outputs.length).fill(null), values };
                graph._cache.set(node.id, failed);
                changedSet.add(node.id);
                try { this.onError?.(node, err); } catch (_) {}
                console.error(`[Geometry Nodes] ${node.type} failed:`, err);
                return failed;
            } finally {
                node.evalTime = Math.round((this._now() - t0) * 100) / 100;
                this.profile[node.id] = node.evalTime;
            }
        }

        markDownstream(nodeId) {
            this.graph.markDirty(nodeId, true);
        }

        evaluate({ force = false, rootId = null } = {}) {
            const graph = this.graph;
            const t0 = this._now();
            this._pass++;

            if (force) {
                graph.nodes.forEach(n => graph.markDirty(n.id, false));
            }

            const changedSet = new Set();
            let geometry = null;
            let material = null;

            if (rootId) {
                const root = graph.findNode(rootId);
                const result = root ? this._computeNode(root, changedSet) : null;
                geometry = result?.outputs?.[0] ?? null;
                material = result?.outputs?.[1] ?? null;
            } else {
                const outputs = graph.nodes.filter(n => n.isOutput);
                for (const outputNode of outputs) {
                    const result = this._computeNode(outputNode, changedSet);
                    if (geometry == null && result?.outputs?.[0] != null) geometry = result.outputs[0];
                    if (material == null && result?.outputs?.[1] != null) material = result.outputs[1];
                }

                if (geometry == null) {
                    for (let i = graph.nodes.length - 1; i >= 0; i--) {
                        const n = graph.nodes[i];
                        const def = n.schema || this.registry.get(n.type);
                        if (!n.isOutput && def && (def.create || def.apply || def.evaluate)) {
                            const result = this._computeNode(n, changedSet);
                            const candidate = result?.outputs?.[0];
                            if (candidate && (
                                candidate?.isBufferGeometry ||
                                candidate?.__geometryData ||
                                candidate?.geometry?.isBufferGeometry
                            )) {
                                geometry = candidate;
                                break;
                            }
                        }
                    }
                }
            }

            graph.dirty.clear();
            this.totalTime = Math.round((this._now() - t0) * 100) / 100;
            this.lastResult = geometry;
            this.lastMaterial = material;

            return {
                geometry,
                material,
                changedNodes: [...changedSet],
                totalTime: this.totalTime,
                profile: { ...this.profile }
            };
        }
    }

    function normalizeOutputs(result, outputCount) {
        if (result && result.__nodeOutputs === true && Array.isArray(result.values)) {
            return result.values;
        }
        if (outputCount > 1 && Array.isArray(result) && result.length === outputCount) {
            return result;
        }
        return [result];
    }

    global.NodeEvaluator = NodeEvaluator;
})(typeof window !== 'undefined' ? window : globalThis);