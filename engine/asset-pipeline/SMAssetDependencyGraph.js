// engine/asset-pipeline/SMAssetDependencyGraph.js
// SM Engine — asset dependency graph with reverse lookup, cycle detection and topo sort.
(function (global) {
    'use strict';

    class SMAssetDependencyGraph {
        constructor() {
            this._forward = new Map(); // asset -> dependencies
            this._reverse = new Map(); // dependency -> dependents
        }

        _key(value) {
            const raw =
                typeof value === 'string'
                    ? value
                    : value?.uuid;

            if (!raw) {
                throw new TypeError(
                    'Dependency graph node requires a UUID/string key.'
                );
            }

            if (
                global.SMAssetUUID?.isValid?.(
                    raw
                )
            ) {
                return global.SMAssetUUID.normalize(
                    raw
                );
            }

            return String(raw);
        }

        ensure(value) {
            const key =
                this._key(
                    value
                );

            if (!this._forward.has(key)) {
                this._forward.set(
                    key,
                    new Set()
                );
            }

            if (!this._reverse.has(key)) {
                this._reverse.set(
                    key,
                    new Set()
                );
            }

            return key;
        }

        addNode(value) {
            return this.ensure(
                value
            );
        }

        addDependency(
            asset,
            dependency
        ) {
            const from =
                this.ensure(
                    asset
                );

            const to =
                this.ensure(
                    dependency
                );

            if (from === to) {
                throw new Error(
                    `Asset "${from}" cannot depend on itself.`
                );
            }

            this._forward
                .get(from)
                .add(to);

            this._reverse
                .get(to)
                .add(from);

            return true;
        }

        removeDependency(
            asset,
            dependency
        ) {
            const from =
                this._key(
                    asset
                );

            const to =
                this._key(
                    dependency
                );

            const changed =
                this._forward
                    .get(from)
                    ?.delete(
                        to
                    ) ||
                false;

            this._reverse
                .get(to)
                ?.delete(
                    from
                );

            return changed;
        }

        removeNode(value) {
            const key =
                this._key(
                    value
                );

            for (
                const dependency
                of this._forward.get(key) ||
                []
            ) {
                this._reverse
                    .get(dependency)
                    ?.delete(
                        key
                    );
            }

            for (
                const dependent
                of this._reverse.get(key) ||
                []
            ) {
                this._forward
                    .get(dependent)
                    ?.delete(
                        key
                    );
            }

            const removed =
                this._forward.delete(
                    key
                );

            this._reverse.delete(
                key
            );

            return removed;
        }

        clearDependencies(value) {
            const key =
                this.ensure(
                    value
                );

            for (
                const dependency
                of this._forward.get(key)
            ) {
                this._reverse
                    .get(dependency)
                    ?.delete(
                        key
                    );
            }

            this._forward.set(
                key,
                new Set()
            );
        }

        setDependencies(
            asset,
            dependencies = []
        ) {
            const key =
                this.ensure(
                    asset
                );

            this.clearDependencies(
                key
            );

            for (const dep of dependencies) {
                this.addDependency(
                    key,
                    dep
                );
            }

            return this.dependenciesOf(
                key
            );
        }

        dependenciesOf(
            value,
            {
                recursive = false
            } = {}
        ) {
            const key =
                this._key(
                    value
                );

            if (!recursive) {
                return [
                    ...(
                        this._forward.get(key) ||
                        []
                    )
                ];
            }

            const visited =
                new Set();

            const visit =
                node => {
                    for (
                        const dependency
                        of this._forward.get(node) ||
                        []
                    ) {
                        if (
                            visited.has(
                                dependency
                            )
                        ) {
                            continue;
                        }

                        visited.add(
                            dependency
                        );

                        visit(
                            dependency
                        );
                    }
                };

            visit(
                key
            );

            return [
                ...visited
            ];
        }

        dependentsOf(
            value,
            {
                recursive = false
            } = {}
        ) {
            const key =
                this._key(
                    value
                );

            if (!recursive) {
                return [
                    ...(
                        this._reverse.get(key) ||
                        []
                    )
                ];
            }

            const visited =
                new Set();

            const visit =
                node => {
                    for (
                        const dependent
                        of this._reverse.get(node) ||
                        []
                    ) {
                        if (
                            visited.has(
                                dependent
                            )
                        ) {
                            continue;
                        }

                        visited.add(
                            dependent
                        );

                        visit(
                            dependent
                        );
                    }
                };

            visit(
                key
            );

            return [
                ...visited
            ];
        }

        hasPath(
            from,
            to
        ) {
            const start =
                this._key(
                    from
                );

            const target =
                this._key(
                    to
                );

            const stack =
                [start];

            const visited =
                new Set();

            while (stack.length) {
                const node =
                    stack.pop();

                if (node === target) {
                    return true;
                }

                if (
                    visited.has(
                        node
                    )
                ) {
                    continue;
                }

                visited.add(
                    node
                );

                for (
                    const dep
                    of this._forward.get(node) ||
                    []
                ) {
                    stack.push(
                        dep
                    );
                }
            }

            return false;
        }

        findCycles() {
            const cycles =
                [];

            const state =
                new Map(); // 0 unknown, 1 visiting, 2 done

            const stack =
                [];

            const visit =
                node => {
                    const currentState =
                        state.get(node) ||
                        0;

                    if (currentState === 2) {
                        return;
                    }

                    if (currentState === 1) {
                        const start =
                            stack.lastIndexOf(
                                node
                            );

                        cycles.push(
                            [
                                ...stack.slice(
                                    Math.max(
                                        0,
                                        start
                                    )
                                ),
                                node
                            ]
                        );

                        return;
                    }

                    state.set(
                        node,
                        1
                    );

                    stack.push(
                        node
                    );

                    for (
                        const dependency
                        of this._forward.get(node) ||
                        []
                    ) {
                        visit(
                            dependency
                        );
                    }

                    stack.pop();

                    state.set(
                        node,
                        2
                    );
                };

            for (
                const node
                of this._forward.keys()
            ) {
                visit(
                    node
                );
            }

            return cycles;
        }

        topologicalSort(
            values = null
        ) {
            const roots =
                values
                    ? values.map(
                        value =>
                            this._key(
                                value
                            )
                    )
                    : [
                        ...this._forward.keys()
                    ];

            const required =
                new Set();

            const collect =
                node => {
                    if (
                        required.has(
                            node
                        )
                    ) {
                        return;
                    }

                    required.add(
                        node
                    );

                    for (
                        const dependency
                        of this._forward.get(node) ||
                        []
                    ) {
                        collect(
                            dependency
                        );
                    }
                };

            roots.forEach(
                collect
            );

            const temp =
                new Set();

            const perm =
                new Set();

            const output =
                [];

            const visit =
                node => {
                    if (
                        perm.has(
                            node
                        )
                    ) {
                        return;
                    }

                    if (
                        temp.has(
                            node
                        )
                    ) {
                        throw new Error(
                            `Asset dependency cycle detected at "${node}".`
                        );
                    }

                    temp.add(
                        node
                    );

                    for (
                        const dependency
                        of this._forward.get(node) ||
                        []
                    ) {
                        if (
                            required.has(
                                dependency
                            )
                        ) {
                            visit(
                                dependency
                            );
                        }
                    }

                    temp.delete(
                        node
                    );

                    perm.add(
                        node
                    );

                    output.push(
                        node
                    );
                };

            for (
                const node
                of required
            ) {
                visit(
                    node
                );
            }

            return output;
        }

        toJSON() {
            return {
                version: 1,
                nodes: [
                    ...this._forward.keys()
                ].map(
                    uuid => ({
                        uuid,
                        dependencies: [
                            ...this._forward.get(
                                uuid
                            )
                        ]
                    })
                )
            };
        }

        fromJSON(data) {
            this._forward.clear();
            this._reverse.clear();

            for (
                const node
                of data?.nodes ||
                []
            ) {
                this.ensure(
                    node.uuid
                );
            }

            for (
                const node
                of data?.nodes ||
                []
            ) {
                for (
                    const dependency
                    of node.dependencies ||
                    []
                ) {
                    this.addDependency(
                        node.uuid,
                        dependency
                    );
                }
            }

            return this;
        }
    }

    global.SMAssetDependencyGraph =
        SMAssetDependencyGraph;

    global.smAssetDependencyGraph =
        global.smAssetDependencyGraph ||
        new SMAssetDependencyGraph();
})(typeof window !== 'undefined' ? window : globalThis);
