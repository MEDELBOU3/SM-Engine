(function () {
    class SMWaterNodeGraph {
        constructor(system) {
            this.system = system || null;
            this.nodes = [
                { id: 'source', type: 'WaterSource', enabled: true },
                { id: 'level', type: 'WaterLevel', enabled: true, levelOffset: 0 },
                { id: 'flow', type: 'WaterFlow', enabled: true, flowSpeed: 0.32, flowDirection: { x: 1, y: 0 } },
                { id: 'surface', type: 'WaterSurface', enabled: true, waveHeight: 0.22, waveLength: 9, choppiness: 0.48, waveScale: 1, waveSteepness: 0.42, waveSpread: 0.72, windSpeed: 1, smallWaveStrength: 0.34, normalStrength: 0.28, foamStrength: 0.30, shoreFoamDepth: 0.48 },
                { id: 'carve', type: 'WaterCarve', enabled: true, terrainCarve: true, bedDepth: 3, shoreWidth: 1.5, shoreDepth: 0.08 },
                {
                    id: 'shoreFoam',
                    type: 'RiverbankFoam',
                    enabled: true,
                    riverbankFoamEnabled: true,
                    riverbankFoamWidth: 0.62,
                    riverbankFoamThickness: 0.045,
                    riverbankFoamIntensity: 0.58,
                    riverbankFoamFlow: 1.0,
                    riverbankFoamBreakup: 0.58,
                    riverbankFoamFleckRate: 4
                },
                { id: 'underwater', type: 'UnderwaterPostProcess', enabled: true, underwaterFogDensity: 0.045, underwaterExposure: 0.76 },
                { id: 'output', type: 'WaterOutput', enabled: true }
            ];
            this.links = [
                ['source', 'level'],
                ['level', 'flow'],
                ['flow', 'surface'],
                ['surface', 'carve'],
                ['carve', 'shoreFoam'],
                ['shoreFoam', 'underwater'],
                ['underwater', 'output']
            ];
        }

        getNode(id) { return this.nodes.find(node => node.id === id) || null; }
        setNode(id, patch = {}) { const node = this.getNode(id); if (!node) return null; Object.assign(node, patch); return node; }
        addNode(type, props = {}) { const id = props.id || `${String(type || 'node').toLowerCase()}_${Date.now().toString(36)}`; const node = { id, type, enabled: true, ...props }; this.nodes.push(node); return node; }
        removeNode(id) { if (['source', 'output'].includes(id)) return false; const index = this.nodes.findIndex(node => node.id === id); if (index < 0) return false; this.nodes.splice(index, 1); this.links = this.links.filter(link => !link.includes(id)); return true; }

        evaluate(base = {}) {
            const result = { ...base };
            const level = this.getNode('level');
            const flow = this.getNode('flow');
            const surface = this.getNode('surface');
            const carve = this.getNode('carve');
            const shoreFoam = this.getNode('shoreFoam');
            const underwater = this.getNode('underwater');

            if (level?.enabled) result.levelOffset = Number(level.levelOffset ?? result.levelOffset ?? 0);
            if (flow?.enabled) {
                result.flowSpeed = Number(flow.flowSpeed ?? result.flowSpeed ?? 0);
                result.flowDirection = {
                    x: Number(flow.flowDirection?.x ?? result.flowDirection?.x ?? 1),
                    y: Number(flow.flowDirection?.y ?? result.flowDirection?.y ?? 0)
                };
            }
            if (surface?.enabled) {
                result.waveHeight = Math.max(0, Number(surface.waveHeight ?? result.waveHeight ?? 0.22));
                result.waveLength = Math.max(0.2, Number(surface.waveLength ?? result.waveLength ?? 9));
                result.choppiness = Math.max(0, Number(surface.choppiness ?? result.choppiness ?? 0.48));
                result.waveScale = Math.max(0.08, Number(surface.waveScale ?? result.waveScale ?? 1));
                result.waveSteepness = THREE.MathUtils.clamp(Number(surface.waveSteepness ?? result.waveSteepness ?? 0.42), 0, 1.5);
                result.waveChoppiness = THREE.MathUtils.clamp(Number(surface.waveChoppiness ?? result.waveChoppiness ?? result.choppiness ?? 0.48), 0, 1.5);
                result.waveSpread = THREE.MathUtils.clamp(Number(surface.waveSpread ?? result.waveSpread ?? 0.72), 0, 2);
                result.windSpeed = Math.max(0, Number(surface.windSpeed ?? result.windSpeed ?? 1));
                result.smallWaveStrength = Math.max(0, Number(surface.smallWaveStrength ?? result.smallWaveStrength ?? result.microWaveStrength ?? 0.34));
                result.normalStrength = Math.max(0, Number(surface.normalStrength ?? result.normalStrength ?? 0.28));
                result.foamStrength = THREE.MathUtils.clamp(Number(surface.foamStrength ?? result.foamStrength ?? 0.30), 0, 1);
                result.shoreFoamDepth = Math.max(0.01, Number(surface.shoreFoamDepth ?? result.shoreFoamDepth ?? 0.48));
            }
            if (carve?.enabled) {
                result.terrainCarve = carve.terrainCarve !== false;
                result.bedDepth = Math.max(0.02, Number(carve.bedDepth ?? result.bedDepth ?? 3));
                result.shoreWidth = Math.max(0.05, Number(carve.shoreWidth ?? result.shoreWidth ?? 1.5));
                result.shoreDepth = Math.max(0.01, Number(carve.shoreDepth ?? result.shoreDepth ?? 0.08));
            }
            if (shoreFoam) {
                result.riverbankFoamEnabled =
                    shoreFoam.enabled !== false &&
                    shoreFoam.riverbankFoamEnabled !== false;
                result.riverbankFoamWidth = Math.max(
                    0.08,
                    Number(shoreFoam.riverbankFoamWidth ?? result.riverbankFoamWidth ?? 0.62)
                );
                result.riverbankFoamThickness = Math.max(
                    0,
                    Number(shoreFoam.riverbankFoamThickness ?? result.riverbankFoamThickness ?? 0.045)
                );
                result.riverbankFoamIntensity = THREE.MathUtils.clamp(
                    Number(shoreFoam.riverbankFoamIntensity ?? result.riverbankFoamIntensity ?? 0.58),
                    0,
                    2
                );
                result.riverbankFoamFlow = Math.max(
                    0,
                    Number(shoreFoam.riverbankFoamFlow ?? result.riverbankFoamFlow ?? 1)
                );
                result.riverbankFoamBreakup = THREE.MathUtils.clamp(
                    Number(shoreFoam.riverbankFoamBreakup ?? result.riverbankFoamBreakup ?? 0.58),
                    0.05,
                    0.95
                );
                result.riverbankFoamFleckRate = Math.max(
                    0,
                    Number(shoreFoam.riverbankFoamFleckRate ?? result.riverbankFoamFleckRate ?? 4)
                );
            }
            if (underwater?.enabled) {
                result.underwaterFogDensity = Math.max(0.0001, Number(underwater.underwaterFogDensity ?? result.underwaterFogDensity ?? 0.045));
                result.underwaterExposure = THREE.MathUtils.clamp(Number(underwater.underwaterExposure ?? result.underwaterExposure ?? 0.76), 0.2, 1.3);
            }
            return result;
        }

        apply(bodyOrId = null) {
            const body = typeof bodyOrId === 'string' ? this.system?.bodies?.get(bodyOrId) : (bodyOrId || this.system?.activeBody);
            if (!body) return false;
            const patch = this.evaluate(body.config || {});
            body.setConfig(patch);
            if (!body.mesh) body.rebuild?.();
            if (!body.mesh) {
                this.system?.emit?.('status', { text: 'Water surface needs a valid path: add 2 points for a river or 3 for a lake/pool.' });
                return false;
            }
            body.group.visible = true;
            body.mesh.visible = true;
            body.mesh.material.visible = true;
            body.mesh.frustumCulled = false;
            body.mesh.updateMatrixWorld?.(true);
            this.system?.refreshTerrain?.();
            this.system?.emit?.('nodegraphchange', { body, graph: this });
            return true;
        }

        toJSON() {
            return {
                nodes: this.nodes.map(node => ({ ...node, flowDirection: node.flowDirection ? { ...node.flowDirection } : undefined })),
                links: this.links.map(link => link.slice())
            };
        }

        fromJSON(data = {}) {
            if (Array.isArray(data.nodes)) this.nodes = data.nodes.map(node => ({ ...node }));
            if (Array.isArray(data.links)) this.links = data.links.map(link => link.slice());
            return this;
        }
    }

    window.SMWaterNodeGraph = SMWaterNodeGraph;
})();
