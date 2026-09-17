// engine/architecture/generators/SMRoomGenerator.js
(function (global) {
    'use strict';

    class SMRoomGenerator {
        constructor(context) {
            this.context = context;
        }

        generate(room, floor) {
            const THREE = global.THREE;
            const group = new THREE.Group();
            group.name = room.id;
            group.userData.smArchitectureType = 'room';
            group.userData.smRoomId = room.id;
            group.userData.smRoomType = room.type;
            group.userData.smFloorId = floor.id;

            if (room.generateCeiling && room.polygon.length >= 3) {
                const floorGenerator = new global.SMFloorGenerator(this.context);
                const ceiling = floorGenerator.generateFromPolygon(room.polygon, {
                    thickness: room.ceilingThickness,
                    material: room.ceilingMaterial,
                    elevation: floor.elevation + room.height,
                    floorId: floor.id,
                    roomId: room.id,
                    name: `${room.id}:ceiling`,
                    type: 'ceiling'
                });
                if (ceiling) group.add(ceiling);
            }

            return group;
        }
    }

    global.SMRoomGenerator = SMRoomGenerator;
})(typeof window !== 'undefined' ? window : globalThis);
