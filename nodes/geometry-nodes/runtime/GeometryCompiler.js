// ============================================================================
// GeometryCompiler v2 — headless graph compiler.
// ============================================================================
(function (global) {
    'use strict';

    class GeometryCompiler {
        constructor(registry = null, evaluator = null) {
            this.registry = registry || global.getGeometryNodeRegistry();
            this.evaluator = evaluator || null;
        }

        compileData(graph, options = {}) {
            const evaluator = this._ensureEvaluator(graph);
            const result = evaluator.evaluate({
                force: options.force !== false,
                rootId: options.rootId || null
            });

            let data = global.GeometryData.from(result.geometry);
            if (options.realizeInstances !== false && data.hasInstances()) {
                data = global.GeometryOps.realizeInstances(data);
            }

            return {
                data,
                geometry: data.geometry,
                material: result.material || data.material || null,
                stats: data.stats(),
                profile: result.profile,
                totalTime: result.totalTime,
                changedNodes: result.changedNodes
            };
        }

        compile(graph, options = {}) {
            return this.compileData(graph, options).geometry;
        }

        compileWithKey(graph, options = {}) {
            const json = global.NodeSerializer?.serialize?.(graph) || JSON.stringify(graph?.toJSON?.() || {});
            const key = hashString(json);
            return { key, ...this.compileData(graph, options) };
        }

        _ensureEvaluator(graph) {
            if (!this.evaluator) this.evaluator = new global.NodeEvaluator(graph, this.registry);
            this.evaluator.graph = graph;
            return this.evaluator;
        }
    }

    function hashString(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(16);
    }

    global.GeometryCompiler = GeometryCompiler;
})(typeof window !== 'undefined' ? window : globalThis);