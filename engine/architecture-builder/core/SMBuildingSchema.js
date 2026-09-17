// engine/architecture/core/SMBuildingSchema.js
// SM Engine — canonical schema + normalization for .smbuilding maps.
(function (global) {
    'use strict';

    const VERSION = 1;

    const DEFAULTS = Object.freeze({
        units: 'meters',
        wallHeight: 3.2,
        wallThickness: 0.22,
        floorThickness: 0.18,
        ceilingThickness: 0.12,
        doorWidth: 0.95,
        doorHeight: 2.1,
        windowWidth: 1.2,
        windowHeight: 1.2,
        windowSillHeight: 0.9,
        columnRadius: 0.2,
        columnHeight: 3.2,
        stairWidth: 1.1,
        stairRise: 0.17,
        stairRun: 0.28
    });

    const UNIT_SCALE = Object.freeze({
        meters: 1,
        meter: 1,
        m: 1,
        centimeters: 0.01,
        centimeter: 0.01,
        cm: 0.01,
        millimeters: 0.001,
        millimeter: 0.001,
        mm: 0.001,
        feet: 0.3048,
        foot: 0.3048,
        ft: 0.3048
    });

    function num(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function bool(value, fallback = false) {
        if (value === undefined || value === null) return fallback;
        return value === true || value === 1 || value === '1' || value === 'true';
    }

    function id(prefix, index) {
        return `${prefix}_${String(index + 1).padStart(3, '0')}`;
    }

    function point2(value, fallback = [0, 0]) {
        if (Array.isArray(value)) {
            return [num(value[0], fallback[0]), num(value[1], fallback[1])];
        }
        if (value && typeof value === 'object') {
            return [num(value.x, fallback[0]), num(value.y ?? value.z, fallback[1])];
        }
        return [...fallback];
    }

    function polygon(value) {
        if (!Array.isArray(value)) return [];
        return value
            .map((p) => point2(p))
            .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    }

    function normalizeOpening(opening, kind, wallId, index, defaults) {
        const isDoor = kind === 'door';
        return {
            id: String(opening?.id || id(kind, index)),
            type: kind,
            wall: String(opening?.wall || wallId || ''),
            offset: Math.max(0, num(opening?.offset, 0)),
            width: Math.max(0.01, num(
                opening?.width,
                isDoor ? defaults.doorWidth : defaults.windowWidth
            )),
            height: Math.max(0.01, num(
                opening?.height,
                isDoor ? defaults.doorHeight : defaults.windowHeight
            )),
            sillHeight: isDoor
                ? 0
                : Math.max(0, num(opening?.sillHeight, defaults.windowSillHeight)),
            style: String(opening?.style || (isDoor ? 'standard' : 'standard')),
            material: opening?.material ? String(opening.material) : null,
            frameMaterial: opening?.frameMaterial ? String(opening.frameMaterial) : null,
            glassMaterial: opening?.glassMaterial ? String(opening.glassMaterial) : null,
            metadata: opening?.metadata && typeof opening.metadata === 'object'
                ? { ...opening.metadata }
                : {}
        };
    }

    function normalizeWall(wall, index, defaults) {
        const wallId = String(wall?.id || id('wall', index));
        const from = point2(wall?.from || wall?.start);
        const to = point2(wall?.to || wall?.end);
        const doors = Array.isArray(wall?.doors) ? wall.doors : [];
        const windows = Array.isArray(wall?.windows) ? wall.windows : [];

        return {
            id: wallId,
            from,
            to,
            height: Math.max(0.01, num(wall?.height, defaults.wallHeight)),
            thickness: Math.max(0.005, num(wall?.thickness, defaults.wallThickness)),
            elevation: num(wall?.elevation, 0),
            material: String(wall?.material || 'wall'),
            exterior: bool(wall?.exterior, false),
            capEnds: bool(wall?.capEnds, true),
            doors: doors.map((o, i) => normalizeOpening(o, 'door', wallId, i, defaults)),
            windows: windows.map((o, i) => normalizeOpening(o, 'window', wallId, i, defaults)),
            metadata: wall?.metadata && typeof wall.metadata === 'object'
                ? { ...wall.metadata }
                : {}
        };
    }

    function normalizeRoom(room, index, defaults) {
        return {
            id: String(room?.id || id('room', index)),
            name: String(room?.name || room?.id || `Room ${index + 1}`),
            type: String(room?.type || 'room'),
            polygon: polygon(room?.polygon || room?.points),
            height: Math.max(0.01, num(room?.height, defaults.wallHeight)),
            floorThickness: Math.max(0.001, num(room?.floorThickness, defaults.floorThickness)),
            ceilingThickness: Math.max(0.001, num(room?.ceilingThickness, defaults.ceilingThickness)),
            floorMaterial: String(room?.floorMaterial || room?.material || 'floor'),
            ceilingMaterial: String(room?.ceilingMaterial || 'ceiling'),
            generateFloor: bool(room?.generateFloor, true),
            generateCeiling: bool(room?.generateCeiling, false),
            metadata: room?.metadata && typeof room.metadata === 'object'
                ? { ...room.metadata }
                : {}
        };
    }

    function normalizeColumn(column, index, defaults) {
        return {
            id: String(column?.id || id('column', index)),
            position: point2(column?.position || column?.center),
            shape: String(column?.shape || 'round'),
            radius: Math.max(0.01, num(column?.radius, defaults.columnRadius)),
            width: Math.max(0.01, num(column?.width, defaults.columnRadius * 2)),
            depth: Math.max(0.01, num(column?.depth, defaults.columnRadius * 2)),
            height: Math.max(0.01, num(column?.height, defaults.columnHeight)),
            elevation: num(column?.elevation, 0),
            material: String(column?.material || 'column'),
            segments: Math.max(6, Math.floor(num(column?.segments, 24))),
            metadata: column?.metadata && typeof column.metadata === 'object'
                ? { ...column.metadata }
                : {}
        };
    }

    function normalizeStair(stair, index, defaults) {
        return {
            id: String(stair?.id || id('stair', index)),
            from: point2(stair?.from || stair?.start),
            to: point2(stair?.to || stair?.end || [2.8, 0]),
            elevation: num(stair?.elevation, 0),
            targetElevation: num(stair?.targetElevation, 3.2),
            width: Math.max(0.1, num(stair?.width, defaults.stairWidth)),
            rise: Math.max(0.05, num(stair?.rise, defaults.stairRise)),
            run: Math.max(0.05, num(stair?.run, defaults.stairRun)),
            steps: Math.max(1, Math.floor(num(stair?.steps, 0))),
            material: String(stair?.material || 'stairs'),
            metadata: stair?.metadata && typeof stair.metadata === 'object'
                ? { ...stair.metadata }
                : {}
        };
    }

    function normalizeFloor(floor, index, defaults) {
        const level = Math.floor(num(floor?.level, index));
        const floorId = String(floor?.id || `floor_${level}`);
        const walls = Array.isArray(floor?.walls) ? floor.walls : [];
        const rooms = Array.isArray(floor?.rooms) ? floor.rooms : [];
        const doors = Array.isArray(floor?.doors) ? floor.doors : [];
        const windows = Array.isArray(floor?.windows) ? floor.windows : [];
        const columns = Array.isArray(floor?.columns) ? floor.columns : [];
        const stairs = Array.isArray(floor?.stairs) ? floor.stairs : [];

        const normalizedWalls = walls.map((w, i) => normalizeWall(w, i, defaults));
        const wallIndex = new Map(normalizedWalls.map((w) => [w.id, w]));

        for (const [kind, list] of [['door', doors], ['window', windows]]) {
            list.forEach((opening, i) => {
                const wallId = String(opening?.wall || '');
                const wall = wallIndex.get(wallId);
                if (!wall) return;
                const normalized = normalizeOpening(opening, kind, wallId, i, defaults);
                if (kind === 'door') wall.doors.push(normalized);
                else wall.windows.push(normalized);
            });
        }

        return {
            id: floorId,
            level,
            name: String(floor?.name || `Floor ${level}`),
            elevation: num(floor?.elevation, level * defaults.wallHeight),
            footprint: polygon(floor?.footprint),
            walls: normalizedWalls,
            rooms: rooms.map((r, i) => normalizeRoom(r, i, defaults)),
            columns: columns.map((c, i) => normalizeColumn(c, i, defaults)),
            stairs: stairs.map((s, i) => normalizeStair(s, i, defaults)),
            metadata: floor?.metadata && typeof floor.metadata === 'object'
                ? { ...floor.metadata }
                : {}
        };
    }

    function normalizeRoof(roof, defaults) {
        if (!roof || roof.enabled === false) {
            return { enabled: false };
        }

        return {
            enabled: true,
            type: String(roof.type || 'flat'),
            height: Math.max(0, num(roof.height, 1.5)),
            overhang: Math.max(0, num(roof.overhang, 0.2)),
            thickness: Math.max(0.02, num(roof.thickness, defaults.floorThickness)),
            material: String(roof.material || 'roof'),
            pitch: num(roof.pitch, 30),
            footprint: polygon(roof.footprint),
            metadata: roof.metadata && typeof roof.metadata === 'object'
                ? { ...roof.metadata }
                : {}
        };
    }

    function normalizeDefaults(buildingDefaults = {}) {
        return {
            wallHeight: Math.max(0.01, num(buildingDefaults.wallHeight, DEFAULTS.wallHeight)),
            wallThickness: Math.max(0.005, num(buildingDefaults.wallThickness, DEFAULTS.wallThickness)),
            floorThickness: Math.max(0.001, num(buildingDefaults.floorThickness, DEFAULTS.floorThickness)),
            ceilingThickness: Math.max(0.001, num(buildingDefaults.ceilingThickness, DEFAULTS.ceilingThickness)),
            doorWidth: Math.max(0.01, num(buildingDefaults.doorWidth, DEFAULTS.doorWidth)),
            doorHeight: Math.max(0.01, num(buildingDefaults.doorHeight, DEFAULTS.doorHeight)),
            windowWidth: Math.max(0.01, num(buildingDefaults.windowWidth, DEFAULTS.windowWidth)),
            windowHeight: Math.max(0.01, num(buildingDefaults.windowHeight, DEFAULTS.windowHeight)),
            windowSillHeight: Math.max(0, num(buildingDefaults.windowSillHeight, DEFAULTS.windowSillHeight)),
            columnRadius: Math.max(0.01, num(buildingDefaults.columnRadius, DEFAULTS.columnRadius)),
            columnHeight: Math.max(0.01, num(buildingDefaults.columnHeight, DEFAULTS.columnHeight)),
            stairWidth: Math.max(0.1, num(buildingDefaults.stairWidth, DEFAULTS.stairWidth)),
            stairRise: Math.max(0.05, num(buildingDefaults.stairRise, DEFAULTS.stairRise)),
            stairRun: Math.max(0.05, num(buildingDefaults.stairRun, DEFAULTS.stairRun))
        };
    }

    function applyUnitScale(map, scale) {
        if (scale === 1) return map;

        const p = (pt) => [pt[0] * scale, pt[1] * scale];

        map.defaults.wallHeight *= scale;
        map.defaults.wallThickness *= scale;
        map.defaults.floorThickness *= scale;
        map.defaults.ceilingThickness *= scale;
        map.defaults.doorWidth *= scale;
        map.defaults.doorHeight *= scale;
        map.defaults.windowWidth *= scale;
        map.defaults.windowHeight *= scale;
        map.defaults.windowSillHeight *= scale;
        map.defaults.columnRadius *= scale;
        map.defaults.columnHeight *= scale;
        map.defaults.stairWidth *= scale;
        map.defaults.stairRise *= scale;
        map.defaults.stairRun *= scale;

        for (const floor of map.floors) {
            floor.elevation *= scale;
            floor.footprint = floor.footprint.map(p);

            for (const wall of floor.walls) {
                wall.from = p(wall.from);
                wall.to = p(wall.to);
                wall.height *= scale;
                wall.thickness *= scale;
                wall.elevation *= scale;
                for (const o of [...wall.doors, ...wall.windows]) {
                    o.offset *= scale;
                    o.width *= scale;
                    o.height *= scale;
                    o.sillHeight *= scale;
                }
            }

            for (const room of floor.rooms) {
                room.polygon = room.polygon.map(p);
                room.height *= scale;
                room.floorThickness *= scale;
                room.ceilingThickness *= scale;
            }

            for (const column of floor.columns) {
                column.position = p(column.position);
                column.radius *= scale;
                column.width *= scale;
                column.depth *= scale;
                column.height *= scale;
                column.elevation *= scale;
            }

            for (const stair of floor.stairs) {
                stair.from = p(stair.from);
                stair.to = p(stair.to);
                stair.elevation *= scale;
                stair.targetElevation *= scale;
                stair.width *= scale;
                stair.rise *= scale;
                stair.run *= scale;
            }
        }

        if (map.roof?.enabled) {
            map.roof.height *= scale;
            map.roof.overhang *= scale;
            map.roof.thickness *= scale;
            map.roof.footprint = map.roof.footprint.map(p);
        }

        map.units = 'meters';
        map.unitScaleApplied = scale;
        return map;
    }

    function normalize(raw) {
        if (!raw || typeof raw !== 'object') {
            throw new TypeError('SMBuildingSchema.normalize() expects an object.');
        }

        const building = raw.building && typeof raw.building === 'object'
            ? raw.building
            : {};

        const defaults = normalizeDefaults({
            ...building.defaults,
            wallHeight: building.defaultWallHeight ?? building.defaults?.wallHeight,
            wallThickness: building.defaultWallThickness ?? building.defaults?.wallThickness,
            floorThickness: building.defaultFloorThickness ?? building.defaults?.floorThickness
        });

        const units = String(raw.units || DEFAULTS.units).toLowerCase();
        const scale = UNIT_SCALE[units] || 1;

        const normalized = {
            format: 'SM_BUILDING_MAP',
            version: Math.max(1, Math.floor(num(raw.version, VERSION))),
            units,
            building: {
                id: String(building.id || 'building'),
                name: String(building.name || raw.name || 'SM Building'),
                category: String(building.category || 'architecture'),
                style: String(building.style || 'generic'),
                author: building.author ? String(building.author) : null,
                metadata: building.metadata && typeof building.metadata === 'object'
                    ? { ...building.metadata }
                    : {}
            },
            defaults,
            materials: raw.materials && typeof raw.materials === 'object'
                ? { ...raw.materials }
                : {},
            floors: (Array.isArray(raw.floors) ? raw.floors : [])
                .map((f, i) => normalizeFloor(f, i, defaults))
                .sort((a, b) => a.level - b.level),
            roof: normalizeRoof(raw.roof, defaults),
            metadata: raw.metadata && typeof raw.metadata === 'object'
                ? { ...raw.metadata }
                : {}
        };

        applyUnitScale(normalized, scale);
        validate(normalized, { throwOnError: true });
        return normalized;
    }

    function validate(map, { throwOnError = false } = {}) {
        const errors = [];
        const warnings = [];

        if (!map || typeof map !== 'object') {
            errors.push('Building map must be an object.');
        }

        if (!Array.isArray(map?.floors) || map.floors.length === 0) {
            warnings.push('Building map contains no floors.');
        }

        const ids = new Set();
        const register = (value, label) => {
            if (!value) return;
            if (ids.has(value)) errors.push(`Duplicate ${label} id '${value}'.`);
            ids.add(value);
        };

        for (const floor of map?.floors || []) {
            register(floor.id, 'floor');

            for (const wall of floor.walls || []) {
                register(wall.id, 'wall');
                const dx = wall.to[0] - wall.from[0];
                const dy = wall.to[1] - wall.from[1];
                if (Math.hypot(dx, dy) < 0.001) {
                    errors.push(`Wall '${wall.id}' has zero length.`);
                }

                for (const opening of [...(wall.doors || []), ...(wall.windows || [])]) {
                    register(opening.id, opening.type || 'opening');
                    if (opening.width <= 0 || opening.height <= 0) {
                        errors.push(`Opening '${opening.id}' has invalid dimensions.`);
                    }
                }
            }

            for (const room of floor.rooms || []) {
                register(room.id, 'room');
                if (room.polygon.length > 0 && room.polygon.length < 3) {
                    errors.push(`Room '${room.id}' polygon needs at least 3 points.`);
                }
            }

            for (const column of floor.columns || []) register(column.id, 'column');
            for (const stair of floor.stairs || []) register(stair.id, 'stair');
        }

        const result = { valid: errors.length === 0, errors, warnings };
        if (throwOnError && errors.length) {
            const error = new Error(`Invalid SM building map:\n- ${errors.join('\n- ')}`);
            error.validation = result;
            throw error;
        }
        return result;
    }

    global.SMBuildingSchema = {
        VERSION,
        DEFAULTS,
        UNIT_SCALE,
        normalize,
        validate
    };
})(typeof window !== 'undefined' ? window : globalThis);
