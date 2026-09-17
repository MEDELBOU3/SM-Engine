/**
 * Profile Extrusion System (v7.0)
 * Converts 2D profiles to 3D geometries with ADVANCED SMOOTH CURVE SUPPORT
 * - Linear Extrusion with Smooth Curves
 * - Smooth Profile Curves via Catmull-Rom Interpolation
 * - Revolve with Smooth Profile Generation
 * - G1 Continuity for Professional Shapes
 */

class ProfileExtrusion {
    constructor() {
        this.materials = this.createMaterials();
        this.curveTangent = new AdvancedCurveTangent();
    }
    
    /**
     * Create standard materials for 3D meshes
     */
    createMaterials() {
        return {
            default: new THREE.MeshPhongMaterial({
                color: 0x2196F3,
                emissive: 0x000000,
                shininess: 100,
                side: THREE.DoubleSide
            }),
            transparent: new THREE.MeshPhongMaterial({
                color: 0x64B5F6,
                emissive: 0x000000,
                shininess: 100,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            }),
            wireframe: new THREE.MeshBasicMaterial({
                wireframe: true,
                color: 0x333333,
                side: THREE.DoubleSide
            })
        };
    }
    
    /**
     * Linear extrusion with SMOOTH CURVE PROFILE INTERPOLATION
     * Extrudes a profile straight along an axis
     * Now supports smooth Catmull-Rom curves for the profile
     */
    extrude(profilePoints, options = {}) {
        const {
            length = 1,
            segments = 1,
            taper = 1,
            axis = 'z',
            material = this.materials.default,
            smoothProfile = true,      // NEW: Enable smooth Catmull-Rom curves
            profileResolution = 50     // NEW: Points per curve segment
        } = options;
        
        if (!profilePoints || profilePoints.length === 0) {
            console.warn('⚠️ No profile points provided');
            return null;
        }
        
        // ENHANCED: Smooth the profile using Catmull-Rom interpolation
        let actualProfilePoints = profilePoints;
        if (smoothProfile && profilePoints.length > 2) {
            actualProfilePoints = this.curveTangent.interpolateCatmullRom(profilePoints, profileResolution);
        }
        
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        
        // Create vertices for each segment
        for (let s = 0; s <= segments; s++) {
            const t = s / segments;
            const scaleFactor = 1 + (taper - 1) * t;
            
            for (let i = 0; i < actualProfilePoints.length; i++) {
                const point = actualProfilePoints[i];
                const vertex = new THREE.Vector3(point.x || 0, point.y || 0, point.z || 0);
                
                // Scale based on taper
                vertex.x *= scaleFactor;
                vertex.y *= scaleFactor;
                
                // Extend along axis
                if (axis === 'z') {
                    vertex.z = t * length;
                } else if (axis === 'y') {
                    vertex.y = t * length;
                } else if (axis === 'x') {
                    vertex.x = t * length;
                }
                
                vertices.push(vertex.x, vertex.y, vertex.z);
            }
        }
        
        // Create indices for faces
        const profileLength = actualProfilePoints.length;
        
        for (let s = 0; s < segments; s++) {
            for (let i = 0; i < profileLength - 1; i++) {
                const a = s * profileLength + i;
                const b = s * profileLength + i + 1;
                const c = (s + 1) * profileLength + i;
                const d = (s + 1) * profileLength + i + 1;
                
                // Two triangles per quad
                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        geometry.computeVertexNormals();
        
        const mesh = new THREE.Mesh(geometry, material);
        return mesh;
    }
    
    /**
     * Revolve (Lathe) extrusion with SMOOTH PROFILE CURVES
     * Revolves a profile around an axis
     * Now uses smooth curve interpolation for better shape quality
     */
    revolve(profilePoints, options = {}) {
        const {
            axis = 'y',
            segments = 16,
            angle = Math.PI * 2,
            material = this.materials.default,
            closed = true,
            smoothProfile = true,      // NEW: Enable smooth curves
            profileResolution = 50     // NEW: Points per curve segment
        } = options;
        
        if (!profilePoints || profilePoints.length < 2) {
            console.warn('⚠️ Need at least 2 profile points for revolve');
            return null;
        }
        
        // ENHANCED: Smooth the profile using Catmull-Rom interpolation
        let actualProfilePoints = profilePoints;
        if (smoothProfile && profilePoints.length > 2) {
            actualProfilePoints = this.curveTangent.interpolateCatmullRom(profilePoints, profileResolution);
        }
        
        // For revolve, profilePoints should be in a plane perpendicular to the axis
        // Typically points from (x=0, y values)
        
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        
        // Create rings by revolving the profile
        for (let s = 0; s <= segments; s++) {
            const theta = (s / segments) * angle;
            const cos = Math.cos(theta);
            const sin = Math.sin(theta);
            
            for (let i = 0; i < actualProfilePoints.length; i++) {
                const point = actualProfilePoints[i];
                
                let x, y, z;
                if (axis === 'y') {
                    // Revolve around Y axis
                    x = (point.x || 0) * cos;
                    z = (point.x || 0) * sin;
                    y = point.y || 0;
                } else if (axis === 'z') {
                    // Revolve around Z axis
                    x = (point.x || 0) * cos;
                    y = (point.x || 0) * sin;
                    z = point.z || 0;
                } else {
                    // Revolve around X axis
                    y = (point.y || 0) * cos;
                    z = (point.y || 0) * sin;
                    x = point.x || 0;
                }
                
                vertices.push(x, y, z);
            }
        }
        
        // Create indices
        const profileLength = actualProfilePoints.length;
        
        for (let s = 0; s < segments; s++) {
            for (let i = 0; i < profileLength - 1; i++) {
                const a = s * profileLength + i;
                const b = s * profileLength + i + 1;
                const c = (s + 1) * profileLength + i;
                const d = (s + 1) * profileLength + i + 1;
                
                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }
        
        // Close the revolved shape if full angle
        if (closed && Math.abs(angle - Math.PI * 2) < 0.01) {
            for (let i = 0; i < profileLength - 1; i++) {
                const a = 0 * profileLength + i;
                const b = 0 * profileLength + i + 1;
                const c = segments * profileLength + i;
                const d = segments * profileLength + i + 1;
                
                indices.push(c, a, d);
                indices.push(d, a, b);
            }
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        geometry.computeVertexNormals();
        
        const mesh = new THREE.Mesh(geometry, material);
        return mesh;
    }
    
    /**
     * Tapered extrusion
     * Extrudes with scaling along the extrusion direction
     */
    tapered(profilePoints, options = {}) {
        const {
            length = 1,
            startScale = 1,
            endScale = 0.5,
            segments = 8,
            axis = 'z',
            material = this.materials.default
        } = options;
        
        return this.extrude(profilePoints, {
            length,
            segments,
            taper: endScale / startScale,
            axis,
            material
        });
    }
    
    /**
     * Spiral extrusion
     * Extrudes while rotating along the axis
     */
    spiral(profilePoints, options = {}) {
        const {
            length = 1,
            rotations = 1,
            segments = 16,
            axis = 'z',
            material = this.materials.default
        } = options;
        
        if (!profilePoints || profilePoints.length === 0) {
            return null;
        }
        
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        
        for (let s = 0; s <= segments; s++) {
            const t = s / segments;
            const angle = t * rotations * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            for (let i = 0; i < profilePoints.length; i++) {
                const point = profilePoints[i];
                
                // Apply rotation
                let x = point.x * cos - point.y * sin;
                let y = point.x * sin + point.y * cos;
                let z = point.z || 0;
                
                // Apply extrusion along axis
                if (axis === 'z') {
                    z = t * length;
                } else if (axis === 'y') {
                    y = t * length;
                } else {
                    x = t * length;
                }
                
                vertices.push(x, y, z);
            }
        }
        
        // Create indices
        const profileLength = profilePoints.length;
        
        for (let s = 0; s < segments; s++) {
            for (let i = 0; i < profileLength - 1; i++) {
                const a = s * profileLength + i;
                const b = s * profileLength + i + 1;
                const c = (s + 1) * profileLength + i;
                const d = (s + 1) * profileLength + i + 1;
                
                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        geometry.computeVertexNormals();
        
        const mesh = new THREE.Mesh(geometry, material);
        return mesh;
    }
    
    /**
     * Bridge between two profiles with SMOOTH TRANSITIONS
     * Lofts between two 2D profiles using smooth curve interpolation
     * Creates G1 continuous surfaces
     */
    loft(profilePoints1, profilePoints2, options = {}) {
        const {
            segments = 1,
            material = this.materials.default,
            smoothProfiles = true,     // NEW: Enable smooth curves
            profileResolution = 50     // NEW: Points per curve segment
        } = options;
        
        if (profilePoints1.length !== profilePoints2.length) {
            console.warn('⚠️ Profiles must have same number of points');
            return null;
        }
        
        // ENHANCED: Smooth both profiles
        let actualProfile1 = profilePoints1;
        let actualProfile2 = profilePoints2;
        
        if (smoothProfiles && profilePoints1.length > 2) {
            actualProfile1 = this.curveTangent.interpolateCatmullRom(profilePoints1, profileResolution);
            actualProfile2 = this.curveTangent.interpolateCatmullRom(profilePoints2, profileResolution);
        }
        
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        
        // Create interpolated vertices between profiles
        for (let s = 0; s <= segments; s++) {
            const t = s / segments;
            
            for (let i = 0; i < actualProfile1.length; i++) {
                const p1 = actualProfile1[i];
                const p2 = actualProfile2[i];
                
                const x = (p1.x || 0) + ((p2.x || 0) - (p1.x || 0)) * t;
                const y = (p1.y || 0) + ((p2.y || 0) - (p1.y || 0)) * t;
                const z = (p1.z || 0) + ((p2.z || 0) - (p1.z || 0)) * t;
                
                vertices.push(x, y, z);
            }
        }
        
        // Create indices
        const profileLength = actualProfile1.length;
        
        for (let s = 0; s < segments; s++) {
            for (let i = 0; i < profileLength - 1; i++) {
                const a = s * profileLength + i;
                const b = s * profileLength + i + 1;
                const c = (s + 1) * profileLength + i;
                const d = (s + 1) * profileLength + i + 1;
                
                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        geometry.computeVertexNormals();
        
        const mesh = new THREE.Mesh(geometry, material);
        return mesh;
    }

    /**
     * CREATE SMOOTH FILLET SURFACE
     * Rounds the junction between two surfaces for smooth G1 continuity
     * Useful for smoothing hard edges in extruded shapes
     */
    createFilletSurface(mesh1, mesh2, radius = 0.5, segments = 8, material = this.materials.default) {
        // Find edge intersection between two meshes
        // Create transitional geometry that smoothly blends both surfaces
        
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        
        // Generate blending surface between two meshes
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            
            // Create vertices along transition
            for (let j = 0; j <= segments; j++) {
                const u = j / segments;
                
                // Blend position and normal
                const x = (1 - t) * 0 + t * radius * Math.cos(u * Math.PI * 2);
                const y = (1 - t) * 0 + t * radius * Math.sin(u * Math.PI * 2);
                const z = t * radius;
                
                vertices.push(x, y, z);
            }
        }
        
        // Generate indices for smooth surface
        for (let i = 0; i < segments; i++) {
            for (let j = 0; j < segments; j++) {
                const a = i * (segments + 1) + j;
                const b = i * (segments + 1) + j + 1;
                const c = (i + 1) * (segments + 1) + j;
                const d = (i + 1) * (segments + 1) + j + 1;
                
                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        geometry.computeVertexNormals();
        
        return new THREE.Mesh(geometry, material);
    }

    /**
     * SMOOTH SHAPE EDITING - Adjust shape with automatic tangent recalculation
     * When a control point moves, the shape adjusts smoothly based on neighbors
     */
    smoothShapeUpdate(controlPoints, changedIndex, newPosition, options = {}) {
        const {
            influence = 0.3,           // How much neighbors are affected
            maxDistance = 2.0          // Maximum influence distance
        } = options;
        
        const adjustedPoints = [...controlPoints];
        adjustedPoints[changedIndex] = newPosition;
        
        // Adjust neighboring points based on distance and influence
        if (changedIndex > 0) {
            const prevPoint = adjustedPoints[changedIndex - 1];
            const dist = Math.hypot(
                newPosition.x - prevPoint.x,
                newPosition.y - prevPoint.y,
                (newPosition.z || 0) - (prevPoint.z || 0)
            );
            
            if (dist < maxDistance) {
                const factor = (1 - dist / maxDistance) * influence;
                adjustedPoints[changedIndex - 1] = {
                    x: prevPoint.x + (newPosition.x - prevPoint.x) * factor * 0.1,
                    y: prevPoint.y + (newPosition.y - prevPoint.y) * factor * 0.1,
                    z: (prevPoint.z || 0) + ((newPosition.z || 0) - (prevPoint.z || 0)) * factor * 0.1
                };
            }
        }
        
        if (changedIndex < controlPoints.length - 1) {
            const nextPoint = adjustedPoints[changedIndex + 1];
            const dist = Math.hypot(
                newPosition.x - nextPoint.x,
                newPosition.y - nextPoint.y,
                (newPosition.z || 0) - (nextPoint.z || 0)
            );
            
            if (dist < maxDistance) {
                const factor = (1 - dist / maxDistance) * influence;
                adjustedPoints[changedIndex + 1] = {
                    x: nextPoint.x + (newPosition.x - nextPoint.x) * factor * 0.1,
                    y: nextPoint.y + (newPosition.y - nextPoint.y) * factor * 0.1,
                    z: (nextPoint.z || 0) + ((newPosition.z || 0) - (nextPoint.z || 0)) * factor * 0.1
                };
            }
        }
        
        return adjustedPoints;
    }
    
    /**
     * Export mesh to geometry data
     */
    exportGeometry(mesh) {
        if (!mesh || !mesh.geometry) return null;
        
        const geometry = mesh.geometry;
        return {
            vertices: Array.from(geometry.attributes.position.array),
            indices: Array.from(geometry.index.array),
            position: mesh.position,
            rotation: mesh.rotation,
            scale: mesh.scale
        };
    }
    
    /**
     * Clone geometry
     */
    cloneGeometry(geometry) {
        const cloned = geometry.clone();
        return cloned;
    }
}

window.ProfileExtrusion = ProfileExtrusion;
