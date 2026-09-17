/**
 * ARCHITECTURE TOOLS v2
 * Clean, modular architecture tool system for SM Engine
 * Walls, Doors, Windows, Rooms, Stairs, Roofs, Furniture
 */

"use strict";

(function() {
    let elementCount = 0;

    function getUniqueName(prefix) {
        elementCount++;
        return `${prefix}_${elementCount}`;
    }

    function finalizeArchObject(obj, namePrefix) {
        const scene = window.scene;
        if (!scene) {
            console.warn('[ArchitectureTools] Scene is not initialized yet');
            return obj;
        }

        obj.name = getUniqueName(namePrefix);

        obj.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        scene.add(obj);

        // Update hierarchy UI
        if (window.hierarchyManager?.updateHierarchy) {
            window.hierarchyManager.updateHierarchy();
        } else if (typeof updateHierarchy === 'function') {
            updateHierarchy();
        }

        // Select the newly created element in the viewport
        if (typeof selectObject === 'function') {
            selectObject(obj);
        } else if (typeof window.selectObject === 'function') {
            window.selectObject(obj);
        } else if (window.transformControls) {
            window.transformControls.attach(obj);
        }

        window.dispatchEvent(new CustomEvent('sm:object-added', { detail: { object: obj } }));
        console.log(`✅ Architectural Element "${obj.name}" created and added to scene.`);
        return obj;
    }

    // ============================================
    // 1. WALL CREATOR
    // ============================================
    class WallTool {
        static create(p1, p2, height = 3.0, thickness = 0.2) {
            const pStart = p1 || new THREE.Vector3(-2.5, 0, 0);
            const pEnd = p2 || new THREE.Vector3(2.5, 0, 0);

            const dx = pEnd.x - pStart.x;
            const dz = pEnd.z - pStart.z;
            const length = Math.max(0.2, Math.sqrt(dx * dx + dz * dz));

            const geometry = new THREE.BoxGeometry(length, height, thickness);
            const material = new THREE.MeshStandardMaterial({
                color: 0xecf0f1,
                roughness: 0.85,
                metalness: 0.05
            });

            const wall = new THREE.Mesh(geometry, material);
            const midX = (pStart.x + pEnd.x) / 2;
            const midZ = (pStart.z + pEnd.z) / 2;
            wall.position.set(midX, height / 2, midZ);

            const angle = Math.atan2(dz, dx);
            wall.rotation.y = -angle;

            wall.userData = { type: 'arch_wall', height, thickness, length };
            return wall;
        }
    }

    // ============================================
    // 2. ROOM CREATOR (4 Walls + Floor)
    // ============================================
    class RoomTool {
        static create(width = 5.0, length = 6.0, height = 3.0, wallThickness = 0.2) {
            const group = new THREE.Group();
            group.userData = { type: 'arch_room', width, length, height, wallThickness };

            const halfW = width / 2;
            const halfL = length / 2;

            const wallMat = new THREE.MeshStandardMaterial({
                color: 0xecf0f1,
                roughness: 0.85,
                metalness: 0.05
            });
            const floorMat = new THREE.MeshStandardMaterial({
                color: 0x34495e,
                roughness: 0.7,
                metalness: 0.1
            });

            // North Wall
            const northGeom = new THREE.BoxGeometry(width, height, wallThickness);
            const northWall = new THREE.Mesh(northGeom, wallMat);
            northWall.name = 'NorthWall';
            northWall.position.set(0, height / 2, -halfL + wallThickness / 2);
            group.add(northWall);

            // South Wall
            const southGeom = new THREE.BoxGeometry(width, height, wallThickness);
            const southWall = new THREE.Mesh(southGeom, wallMat);
            southWall.name = 'SouthWall';
            southWall.position.set(0, height / 2, halfL - wallThickness / 2);
            group.add(southWall);

            // West Wall
            const sideLen = Math.max(0.1, length - wallThickness * 2);
            const westGeom = new THREE.BoxGeometry(wallThickness, height, sideLen);
            const westWall = new THREE.Mesh(westGeom, wallMat);
            westWall.name = 'WestWall';
            westWall.position.set(-halfW + wallThickness / 2, height / 2, 0);
            group.add(westWall);

            // East Wall
            const eastGeom = new THREE.BoxGeometry(wallThickness, height, sideLen);
            const eastWall = new THREE.Mesh(eastGeom, wallMat);
            eastWall.name = 'EastWall';
            eastWall.position.set(halfW - wallThickness / 2, height / 2, 0);
            group.add(eastWall);

            // Floor
            const floorGeom = new THREE.BoxGeometry(width, 0.08, length);
            const floor = new THREE.Mesh(floorGeom, floorMat);
            floor.name = 'Floor';
            floor.position.set(0, 0.04, 0);
            group.add(floor);

            return group;
        }
    }

    // ============================================
    // 3. DOOR CREATOR
    // ============================================
    class DoorTool {
        static create(width = 1.0, height = 2.2, depth = 0.1) {
            const group = new THREE.Group();
            group.userData = { type: 'arch_door', width, height };

            const frameThickness = 0.08;
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.6 });
            const panelMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.5 });
            const knobMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, metalness: 0.8, roughness: 0.2 });

            // Top frame
            const topGeom = new THREE.BoxGeometry(width + frameThickness * 2, frameThickness, depth + 0.02);
            const topFrame = new THREE.Mesh(topGeom, frameMat);
            topFrame.position.set(0, height + frameThickness / 2, 0);
            group.add(topFrame);

            // Left post
            const postGeom = new THREE.BoxGeometry(frameThickness, height, depth + 0.02);
            const leftPost = new THREE.Mesh(postGeom, frameMat);
            leftPost.position.set(-width / 2 - frameThickness / 2, height / 2, 0);
            group.add(leftPost);

            // Right post
            const rightPost = new THREE.Mesh(postGeom, frameMat);
            rightPost.position.set(width / 2 + frameThickness / 2, height / 2, 0);
            group.add(rightPost);

            // Door panel
            const panelGeom = new THREE.BoxGeometry(width - 0.02, height - 0.02, depth * 0.4);
            const panel = new THREE.Mesh(panelGeom, panelMat);
            panel.position.set(0, height / 2, 0);
            group.add(panel);

            // Knob
            const knobGeom = new THREE.SphereGeometry(0.04, 16, 16);
            const knob = new THREE.Mesh(knobGeom, knobMat);
            knob.position.set(width / 2 - 0.12, height * 0.45, depth * 0.25);
            group.add(knob);

            return group;
        }
    }

    // ============================================
    // 4. WINDOW CREATOR
    // ============================================
    class WindowTool {
        static create(width = 1.2, height = 1.2, depth = 0.1) {
            const group = new THREE.Group();
            group.userData = { type: 'arch_window', width, height };

            const frameThick = 0.06;
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.5 });
            const glassMat = new THREE.MeshStandardMaterial({
                color: 0x74b9ff,
                transparent: true,
                opacity: 0.45,
                roughness: 0.1,
                metalness: 0.8
            });

            // Outer Frame
            const topGeom = new THREE.BoxGeometry(width, frameThick, depth);
            const top = new THREE.Mesh(topGeom, frameMat);
            top.position.set(0, height - frameThick / 2, 0);
            group.add(top);

            const bottom = new THREE.Mesh(topGeom, frameMat);
            bottom.position.set(0, frameThick / 2, 0);
            group.add(bottom);

            const sideGeom = new THREE.BoxGeometry(frameThick, height - frameThick * 2, depth);
            const left = new THREE.Mesh(sideGeom, frameMat);
            left.position.set(-width / 2 + frameThick / 2, height / 2, 0);
            group.add(left);

            const right = new THREE.Mesh(sideGeom, frameMat);
            right.position.set(width / 2 - frameThick / 2, height / 2, 0);
            group.add(right);

            // Center cross divider
            const hDivider = new THREE.Mesh(new THREE.BoxGeometry(width - frameThick * 2, 0.03, depth * 0.6), frameMat);
            hDivider.position.set(0, height / 2, 0);
            group.add(hDivider);

            const vDivider = new THREE.Mesh(new THREE.BoxGeometry(0.03, height - frameThick * 2, depth * 0.6), frameMat);
            vDivider.position.set(0, height / 2, 0);
            group.add(vDivider);

            // Glass pane
            const glassGeom = new THREE.BoxGeometry(width - frameThick * 2, height - frameThick * 2, 0.015);
            const glass = new THREE.Mesh(glassGeom, glassMat);
            glass.position.set(0, height / 2, 0);
            group.add(glass);

            group.position.y = 1.0; // elevated to standard sill height
            return group;
        }
    }

    // ============================================
    // 5. STAIRS CREATOR
    // ============================================
    class StairTool {
        static create(width = 1.2, totalHeight = 3.0, totalLength = 4.0, stepCount = 12) {
            const group = new THREE.Group();
            group.userData = { type: 'arch_stairs', stepCount, totalHeight, totalLength };

            const stepHeight = totalHeight / stepCount;
            const stepDepth = totalLength / stepCount;
            const stepMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.7 });

            for (let i = 0; i < stepCount; i++) {
                const currentH = (i + 1) * stepHeight;
                const stepGeom = new THREE.BoxGeometry(width, currentH, stepDepth);
                const step = new THREE.Mesh(stepGeom, stepMat);
                step.position.set(0, currentH / 2, -totalLength / 2 + (i + 0.5) * stepDepth);
                group.add(step);
            }

            return group;
        }
    }

    // ============================================
    // 6. ROOF CREATOR (Gable & Flat)
    // ============================================
    class RoofTool {
        static createGable(width = 5.4, length = 6.4, height = 2.0) {
            const group = new THREE.Group();
            group.userData = { type: 'arch_roof', width, length, height };

            const roofMat = new THREE.MeshStandardMaterial({
                color: 0xc0392b, // terracotta
                roughness: 0.8
            });

            const slopeLength = Math.sqrt((width / 2) * (width / 2) + height * height);
            const angle = Math.atan2(height, width / 2);

            // Left slope
            const slopeGeom = new THREE.BoxGeometry(slopeLength, 0.12, length);
            const leftSlope = new THREE.Mesh(slopeGeom, roofMat);
            leftSlope.position.set(-width / 4, height / 2, 0);
            leftSlope.rotation.z = angle;
            group.add(leftSlope);

            // Right slope
            const rightSlope = new THREE.Mesh(slopeGeom, roofMat);
            rightSlope.position.set(width / 4, height / 2, 0);
            rightSlope.rotation.z = -angle;
            group.add(rightSlope);

            group.position.y = 3.0; // sit on top of standard room height
            return group;
        }
    }

    // ============================================
    // 7. FURNITURE (Table & Chair)
    // ============================================
    class FurnitureTool {
        static createTable(width = 1.4, depth = 0.8, height = 0.75) {
            const group = new THREE.Group();
            group.userData = { type: 'arch_furniture', subtype: 'table' };

            const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.6 });
            const legMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.5 });

            // Table top
            const topGeom = new THREE.BoxGeometry(width, 0.05, depth);
            const top = new THREE.Mesh(topGeom, woodMat);
            top.position.set(0, height - 0.025, 0);
            group.add(top);

            // 4 Legs
            const legGeom = new THREE.CylinderGeometry(0.025, 0.025, height - 0.05, 12);
            const offX = width / 2 - 0.08;
            const offZ = depth / 2 - 0.08;
            const legY = (height - 0.05) / 2;

            [
                [-offX, -offZ],
                [offX, -offZ],
                [-offX, offZ],
                [offX, offZ]
            ].forEach(([x, z]) => {
                const leg = new THREE.Mesh(legGeom, legMat);
                leg.position.set(x, legY, z);
                group.add(leg);
            });

            return group;
        }

        static createChair(width = 0.45, depth = 0.45, height = 0.9) {
            const group = new THREE.Group();
            group.userData = { type: 'arch_furniture', subtype: 'chair' };

            const seatHeight = 0.45;
            const seatMat = new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.5 });
            const legMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, metalness: 0.6 });

            // Seat
            const seatGeom = new THREE.BoxGeometry(width, 0.04, depth);
            const seat = new THREE.Mesh(seatGeom, seatMat);
            seat.position.set(0, seatHeight, 0);
            group.add(seat);

            // Backrest
            const backGeom = new THREE.BoxGeometry(width, height - seatHeight, 0.03);
            const back = new THREE.Mesh(backGeom, seatMat);
            back.position.set(0, seatHeight + (height - seatHeight) / 2, -depth / 2 + 0.02);
            group.add(back);

            // Legs
            const legGeom = new THREE.CylinderGeometry(0.02, 0.02, seatHeight, 12);
            const offX = width / 2 - 0.04;
            const offZ = depth / 2 - 0.04;
            const legY = seatHeight / 2;

            [
                [-offX, -offZ],
                [offX, -offZ],
                [-offX, offZ],
                [offX, offZ]
            ].forEach(([x, z]) => {
                const leg = new THREE.Mesh(legGeom, legMat);
                leg.position.set(x, legY, z);
                group.add(leg);
            });

            return group;
        }
    }

    // ============================================
    // GLOBAL EXPORTS
    // ============================================
    window.ArchitectureTools = {
        Wall: WallTool,
        Door: DoorTool,
        Window: WindowTool,
        Room: RoomTool,
        Stair: StairTool,
        Roof: RoofTool,
        Furniture: FurnitureTool
    };

    window.createArchElement = function(type) {
        const AT = window.ArchitectureTools;
        if (!AT) {
            console.error('[ArchitectureTools] ArchitectureTools module not available');
            return null;
        }

        let obj = null;
        let prefix = 'Arch';

        const wallH = parseFloat(document.getElementById('arch-param-wall-height')?.value) || 3.0;
        const wallThick = parseFloat(document.getElementById('arch-param-wall-thick')?.value) || 0.2;
        const roomW = parseFloat(document.getElementById('arch-param-room-w')?.value) || 5.0;
        const roomL = parseFloat(document.getElementById('arch-param-room-l')?.value) || 6.0;
        const stairSteps = parseInt(document.getElementById('arch-param-stair-steps')?.value) || 12;

        switch (type) {
            case 'wall':
                obj = AT.Wall.create(new THREE.Vector3(-2.5, 0, 0), new THREE.Vector3(2.5, 0, 0), wallH, wallThick);
                prefix = 'Wall';
                break;
            case 'room':
                obj = AT.Room.create(roomW, roomL, wallH, wallThick);
                prefix = 'Room';
                break;
            case 'door':
                obj = AT.Door.create(1.0, 2.2, 0.1);
                prefix = 'Door';
                break;
            case 'window':
                obj = AT.Window.create(1.2, 1.2, 0.1);
                prefix = 'Window';
                break;
            case 'stairs':
                obj = AT.Stair.create(1.2, wallH, 4.0, stairSteps);
                prefix = 'Stairs';
                break;
            case 'roof':
                obj = AT.Roof.createGable(roomW, roomL, 2.0);
                prefix = 'Roof';
                break;
            case 'table':
                obj = AT.Furniture.createTable(1.4, 0.8, 0.75);
                prefix = 'Table';
                break;
            case 'chair':
                obj = AT.Furniture.createChair(0.45, 0.45, 0.9);
                prefix = 'Chair';
                break;
            default:
                console.warn('[ArchitectureTools] Unknown element type:', type);
                return null;
        }

        if (obj) {
            return finalizeArchObject(obj, prefix);
        }
        return null;
    };

    console.log('✅ SM Engine Architecture Tools v2 initialized.');
})();
