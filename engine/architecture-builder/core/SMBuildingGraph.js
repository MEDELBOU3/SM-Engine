// engine/architecture/core/SMBuildingGraph.js
(function (global) {
    'use strict';

    class SMBuildingGraph {
        constructor(map) {
            this.map = map;
            this.floorById = new Map();
            this.wallById = new Map();
            this.roomById = new Map();
            this.openingById = new Map();
            this.columnById = new Map();
            this.stairById = new Map();
            this.wallOpenings = new Map();
            this.roomAdjacency = new Map();
            this._build();
        }

        _build() {
            for (const floor of this.map?.floors || []) {
                this.floorById.set(floor.id, floor);

                for (const wall of floor.walls || []) {
                    this.wallById.set(wall.id, wall);
                    const openings = [...(wall.doors || []), ...(wall.windows || [])];
                    this.wallOpenings.set(wall.id, openings);
                    openings.forEach((o) => this.openingById.set(o.id, o));
                }

                for (const room of floor.rooms || []) {
                    this.roomById.set(room.id, room);
                    this.roomAdjacency.set(room.id, new Set());
                }

                for (const column of floor.columns || []) this.columnById.set(column.id, column);
                for (const stair of floor.stairs || []) this.stairById.set(stair.id, stair);
            }
            this._computeRoomAdjacency();
        }

        _computeRoomAdjacency() {
            const floors = this.map?.floors || [];
            for (const floor of floors) {
                const rooms = floor.rooms || [];
                for (let i = 0; i < rooms.length; i++) {
                    for (let j = i + 1; j < rooms.length; j++) {
                        if (this._polygonsTouch(rooms[i].polygon, rooms[j].polygon)) {
                            this.roomAdjacency.get(rooms[i].id)?.add(rooms[j].id);
                            this.roomAdjacency.get(rooms[j].id)?.add(rooms[i].id);
                        }
                    }
                }
            }
        }

        _polygonsTouch(a, b) {
            if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) {
                return false;
            }
            const eps = 0.025;
            const dist2 = (p, q) => {
                const dx = p[0] - q[0];
                const dy = p[1] - q[1];
                return dx * dx + dy * dy;
            };
            for (const p of a) {
                for (const q of b) {
                    if (dist2(p, q) <= eps * eps) return true;
                }
            }
            return false;
        }

        getWall(id) { return this.wallById.get(id) || null; }
        getRoom(id) { return this.roomById.get(id) || null; }
        getOpening(id) { return this.openingById.get(id) || null; }
        getFloor(id) { return this.floorById.get(id) || null; }

        getOpeningsForWall(wallId) {
            return [...(this.wallOpenings.get(wallId) || [])];
        }

        getAdjacentRooms(roomId) {
            return [...(this.roomAdjacency.get(roomId) || [])];
        }

        getStats() {
            return {
                floors: this.floorById.size,
                walls: this.wallById.size,
                rooms: this.roomById.size,
                openings: this.openingById.size,
                columns: this.columnById.size,
                stairs: this.stairById.size
            };
        }
    }

    global.SMBuildingGraph = SMBuildingGraph;
})(typeof window !== 'undefined' ? window : globalThis);
