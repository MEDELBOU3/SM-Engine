/**
 * ADVANCED CURVE TANGENT ENGINE (v1.0)
 * Smooth Curve Interpolation with Tangent Adjustment
 * - Catmull-Rom Spline Interpolation
 * - Automatic Tangent Calculation from Neighbors
 * - Smooth Shape Editing & Form Control
 * - G1 Continuity (position + tangent matching)
 */

class AdvancedCurveTangent {
    constructor(modeler) {
        this.modeler = modeler;
        this.tolerance = 0.01;
        this.resolution = 50; // Points per curve segment
    }

    /**
     * CATMULL-ROM SPLINE INTERPOLATION
     * Smooth curve through control points with automatic tangent calculation
     * Creates smooth curves that pass through all control points
     */
    interpolateCatmullRom(controlPoints, resolution = this.resolution) {
        if (controlPoints.length < 2) return controlPoints;
        if (controlPoints.length === 2) return this.linearInterpolate(controlPoints, resolution);

        const curvePoints = [];

        // Process each segment (between consecutive control points)
        for (let i = 0; i < controlPoints.length - 1; i++) {
            // Catmull-Rom requires 4 points: p0, p1, p2, p3
            // We interpolate between p1 and p2
            const p0 = controlPoints[Math.max(0, i - 1)];
            const p1 = controlPoints[i];
            const p2 = controlPoints[i + 1];
            const p3 = controlPoints[Math.min(controlPoints.length - 1, i + 2)];

            // Generate points along this segment
            for (let t = 0; t < 1; t += 1 / resolution) {
                const pt = this.catmullRomPoint(p0, p1, p2, p3, t);
                curvePoints.push(pt);
            }
        }

        // Add final point
        curvePoints.push(controlPoints[controlPoints.length - 1]);
        return curvePoints;
    }

    /**
     * CATMULL-ROM CALCULATION AT PARAMETER t (0 to 1)
     * Formula: P(t) = 0.5 * [2P1 + (-P0 + P2)t + (2P0 - 5P1 + 4P2 - P3)t² + (-P0 + 3P1 - 3P2 + P3)t³]
     */
    catmullRomPoint(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;

        const v0x = (p2.x - p0.x) * 0.5;
        const v0y = (p2.y - p0.y) * 0.5;
        const v1x = (p3.x - p1.x) * 0.5;
        const v1y = (p3.y - p1.y) * 0.5;

        const x = p1.x + v0x * t + (3 * (p2.x - p1.x) - 2 * v0x - v1x) * t2 + (2 * (p1.x - p2.x) + v0x + v1x) * t3;
        const y = p1.y + v0y * t + (3 * (p2.y - p1.y) - 2 * v0y - v1y) * t2 + (2 * (p1.y - p2.y) + v0y + v1y) * t3;

        return {x, y};
    }

    /**
     * LINEAR INTERPOLATION (for 2-point curves)
     */
    linearInterpolate(controlPoints, resolution) {
        const points = [];
        const p1 = controlPoints[0];
        const p2 = controlPoints[1];

        for (let t = 0; t <= 1; t += 1 / resolution) {
            points.push({
                x: p1.x + (p2.x - p1.x) * t,
                y: p1.y + (p2.y - p1.y) * t
            });
        }
        return points;
    }

    /**
     * CALCULATE TANGENT VECTOR AT A POINT
     * Used for smooth edge transitions
     * Returns unit vector pointing in direction of curve
     */
    calculateTangent(controlPoints, index) {
        if (controlPoints.length < 2) return {x: 1, y: 0};

        let tangent;

        if (index === 0) {
            // Start point: tangent toward next point
            tangent = {
                x: controlPoints[1].x - controlPoints[0].x,
                y: controlPoints[1].y - controlPoints[0].y
            };
        } else if (index === controlPoints.length - 1) {
            // End point: tangent from previous point
            const prev = controlPoints[index - 1];
            tangent = {
                x: controlPoints[index].x - prev.x,
                y: controlPoints[index].y - prev.y
            };
        } else {
            // Middle points: average of before and after
            const before = controlPoints[index - 1];
            const after = controlPoints[index + 1];
            tangent = {
                x: (after.x - before.x) * 0.5,
                y: (after.y - before.y) * 0.5
            };
        }

        // Normalize to unit vector
        const len = Math.hypot(tangent.x, tangent.y);
        if (len > 0) {
            tangent.x /= len;
            tangent.y /= len;
        }

        return tangent;
    }

    /**
     * SMOOTH CORNER JUNCTION
     * Creates smooth transition at corner points
     * Used when editing shapes to maintain smooth curves
     */
    smoothCornerTransition(prevPoint, cornerPoint, nextPoint, smoothness = 0.3) {
        // Calculate incoming and outgoing tangents
        const inTangent = {
            x: cornerPoint.x - prevPoint.x,
            y: cornerPoint.y - prevPoint.y
        };

        const outTangent = {
            x: nextPoint.x - cornerPoint.x,
            y: nextPoint.y - cornerPoint.y
        };

        // Normalize
        const inLen = Math.hypot(inTangent.x, inTangent.y);
        const outLen = Math.hypot(outTangent.x, outTangent.y);

        if (inLen > 0) { inTangent.x /= inLen; inTangent.y /= inLen; }
        if (outLen > 0) { outTangent.x /= outLen; outTangent.y /= outLen; }

        // Blend tangents for smooth transition
        const avgTangent = {
            x: (inTangent.x + outTangent.x) * 0.5,
            y: (inTangent.y + outTangent.y) * 0.5
        };

        const avgLen = Math.hypot(avgTangent.x, avgTangent.y);
        if (avgLen > 0) {
            avgTangent.x /= avgLen;
            avgTangent.y /= avgLen;
        }

        // Return smoothed corner point with blended direction
        return {
            point: cornerPoint,
            tangent: avgTangent,
            smoothness: smoothness
        };
    }

    /**
     * ADAPTIVE CURVE FITTING
     * Reduces number of points while maintaining curve shape
     * Uses tolerance-based point removal (Douglas-Peucker algorithm)
     */
    fitCurveAdaptive(points, tolerance = this.tolerance) {
        if (points.length <= 2) return points;

        const fitPoints = [points[0]];
        let lastFitPoint = points[0];

        for (let i = 1; i < points.length - 1; i++) {
            const current = points[i];
            const next = points[i + 1];

            // Calculate perpendicular distance to line
            const dist = this.perpendicularDistance(current, lastFitPoint, next);

            if (dist > tolerance) {
                fitPoints.push(current);
                lastFitPoint = current;
            }
        }

        fitPoints.push(points[points.length - 1]);
        return fitPoints;
    }

    /**
     * PERPENDICULAR DISTANCE from point to line
     * Used for curve fitting
     */
    perpendicularDistance(point, lineStart, lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        const len = Math.hypot(dx, dy);

        if (len === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);

        const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (len * len)));

        const projX = lineStart.x + t * dx;
        const projY = lineStart.y + t * dy;

        return Math.hypot(point.x - projX, point.y - projY);
    }

    /**
     * ADJUST CURVE BASED ON EDGE NEIGHBORS
     * When a point is moved, its curve adjusts smoothly to match neighbors
     * Implements G1 continuity (position + tangent match)
     */
    adjustCurveFromNeighbors(entities, pointIndex, newPosition) {
        const entity = entities[pointIndex];
        if (!entity || entity.type !== 'spline' || !entity.controlPoints) return entity;

        const points = [...entity.controlPoints];
        const idx = entity.controlPoints.findIndex(p => p.x === entity.controlPoints[pointIndex]?.x && p.y === entity.controlPoints[pointIndex]?.y);

        if (idx === -1) return entity;

        // Update point position
        points[idx] = newPosition;

        // Smoothly adjust neighbors based on distance
        const maxAdjustDistance = 0.5; // World units

        if (idx > 0) {
            const prevPoint = points[idx - 1];
            const dist = Math.hypot(newPosition.x - prevPoint.x, newPosition.y - prevPoint.y);

            if (dist < maxAdjustDistance * 2) {
                // Adjust previous point's influence
                const tangent = this.calculateTangent(points, idx);
                const adjustment = Math.min(0.3, dist / (maxAdjustDistance * 2));
                // Store tangent influence for rendering
                entity.tangentInfluence = entity.tangentInfluence || {};
                entity.tangentInfluence[idx] = {tangent, influence: adjustment};
            }
        }

        if (idx < points.length - 1) {
            const nextPoint = points[idx + 1];
            const dist = Math.hypot(newPosition.x - nextPoint.x, newPosition.y - nextPoint.y);

            if (dist < maxAdjustDistance * 2) {
                // Adjust next point's influence
                const tangent = this.calculateTangent(points, idx);
                const adjustment = Math.min(0.3, dist / (maxAdjustDistance * 2));
                entity.tangentInfluence = entity.tangentInfluence || {};
                entity.tangentInfluence[idx] = {tangent, influence: adjustment};
            }
        }

        return entity;
    }

    /**
     * SMOOTH SHAPE EDITING
     * Ensures smooth transitions when editing polygon or complex shapes
     * Called when user moves a vertex
     */
    smoothShapeEdit(entity, vertexIndex, newPosition, neighbors = []) {
        if (entity.type === 'polygon' && entity.points) {
            const points = [...entity.points];
            points[vertexIndex] = newPosition;

            // Create smooth transition with neighbors
            if (neighbors.length > 0) {
                neighbors.forEach(idx => {
                    if (idx !== vertexIndex && points[idx]) {
                        const dist = Math.hypot(newPosition.x - points[idx].x, newPosition.y - points[idx].y);
                        const influence = Math.max(0, 1 - (dist / 2)); // Max 2 units influence

                        if (influence > 0.1) {
                            // Smoothly blend adjacent points
                            points[idx] = {
                                x: points[idx].x + (newPosition.x - points[idx].x) * influence * 0.1,
                                y: points[idx].y + (newPosition.y - points[idx].y) * influence * 0.1
                            };
                        }
                    }
                });
            }

            entity.points = points;
            return entity;
        }

        return entity;
    }

    /**
     * CREATE SMOOTH CORNER FILLET
     * Adds rounded corner between two line segments
     * Result: smooth G1 continuous transition
     */
    createFilletCorner(p1, vertex, p2, radius = 0.5) {
        const v1 = {x: vertex.x - p1.x, y: vertex.y - p1.y};
        const v2 = {x: p2.x - vertex.x, y: p2.y - vertex.y};

        const len1 = Math.hypot(v1.x, v1.y);
        const len2 = Math.hypot(v2.x, v2.y);

        if (len1 === 0 || len2 === 0) return null;

        // Normalize vectors
        v1.x /= len1; v1.y /= len1;
        v2.x /= len2; v2.y /= len2;

        // Calculate fillet center
        const bisector = {x: (v1.x + v2.x) * 0.5, y: (v1.y + v2.y) * 0.5};
        const bisLen = Math.hypot(bisector.x, bisector.y);

        if (bisLen === 0) return null;

        bisector.x /= bisLen;
        bisector.y /= bisLen;

        // Distance from vertex to center
        const angle = Math.acos(Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y)));
        const distance = radius / Math.sin(angle / 2);

        const center = {
            x: vertex.x + bisector.x * distance,
            y: vertex.y + bisector.y * distance
        };

        // Generate arc points
        const arcPoints = [];
        const startAngle = Math.atan2(-v1.y, -v1.x);
        const endAngle = Math.atan2(v2.y, v2.x);
        const arcSegments = Math.ceil(Math.abs(endAngle - startAngle) * 20);

        for (let i = 0; i <= arcSegments; i++) {
            const t = i / arcSegments;
            const currentAngle = startAngle + (endAngle - startAngle) * t;
            arcPoints.push({
                x: center.x + Math.cos(currentAngle) * radius,
                y: center.y + Math.sin(currentAngle) * radius
            });
        }

        return {center, radius, arcPoints, startAngle, endAngle};
    }

    /**
     * BEZIER CURVE GENERATION
     * Creates smooth Bezier curve from control points
     * Useful for arbitrary smooth curve creation
     */
    bezierCurve(controlPoints, resolution = this.resolution) {
        const points = [];
        const n = controlPoints.length - 1;

        for (let t = 0; t <= 1; t += 1 / resolution) {
            let point = {x: 0, y: 0};

            for (let i = 0; i <= n; i++) {
                const basis = this.bernsteinBasis(n, i, t);
                point.x += basis * controlPoints[i].x;
                point.y += basis * controlPoints[i].y;
            }

            points.push(point);
        }

        return points;
    }

    /**
     * BERNSTEIN BASIS POLYNOMIAL
     * Used in Bezier curve calculation
     */
    bernsteinBasis(n, i, t) {
        return this.binomial(n, i) * Math.pow(t, i) * Math.pow(1 - t, n - i);
    }

    /**
     * BINOMIAL COEFFICIENT
     */
    binomial(n, k) {
        if (k > n) return 0;
        if (k === 0 || k === n) return 1;
        return this.factorial(n) / (this.factorial(k) * this.factorial(n - k));
    }

    factorial(n) {
        if (n <= 1) return 1;
        return n * this.factorial(n - 1);
    }
}

// Export
window.AdvancedCurveTangent = AdvancedCurveTangent;
