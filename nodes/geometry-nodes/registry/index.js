// ============================================================================
// registry — registers every node definition into the shared registry.
// Each module only touches the registry; the evaluator/runtime stay UI-free.
// ============================================================================

(function (global) {
    'use strict';

    function registerAll() {
        const fsOrder = [
            'registry/primitives.js',
            'registry/transform.js',
            'registry/modify.js',
            'registry/material.js',
            'registry/utility.js',
        ];
        // In the browser these run via <script> tags; in Node (tests) nothing
        // to do here — this file exists only as documentation of load order.
    }

    global.geometryNodeModules = {
        registerAll,
        order: [
            'primitives',
            'transform',
            'modify',
            'material',
            'utility',
        ],
    };

})(typeof window !== 'undefined' ? window : globalThis);