/**
 * Storyboard2DIntegration.js
 * Advanced integration between Storyboard2DManager and Animation2DManager
 * 
 * Features:
 *  - Seamless frame capture from 2D canvas
 *  - Timeline synchronization
 *  - Layer export/import
 *  - Real-time preview
 *  - Batch operations
 */

class Storyboard2DIntegration {
    constructor() {
        this.storyboard = null;
        this.animation2D = null;
        this.isInitialized = false;
    }

    /**
     * Initialize integration after both managers are ready
     */
    initialize() {
        if (this.isInitialized) return;

        // Wait for both managers to be ready
        const checkReady = () => {
            this.animation2D = window.animation2DManager;
            this.storyboard = window.storyboard2DManager;

            if (this.animation2D && this.storyboard) {
                this.setupConnections();
                this.setupEventListeners();
                this.isInitialized = true;
                console.log('✓ Storyboard 2D Integration Ready');
            } else {
                setTimeout(checkReady, 500);
            }
        };

        checkReady();
    }

    /**
     * Setup event listeners and connections
     */
    setupConnections() {
        // Allow capturing current canvas as frame
        if (this.storyboard.elements.btnNewFrame) {
            const originalNewFrame = this.storyboard.createNewFrame.bind(this.storyboard);
            this.storyboard.createNewFrame = (referenceData) => {
                const frameId = originalNewFrame(referenceData);
                this.captureCurrentCanvasToFrame(frameId);
                return frameId;
            };
        }
    }

    setupEventListeners() {
        // Listen for frame selection to preview in animation canvas
        this.storyboard.selectFrame = (frameId => {
            const original = this.storyboard.selectFrame.bind(this.storyboard);
            return (fId) => {
                original(fId);
                this.previewFrameInCanvas(fId);
            };
        })(this.storyboard.selectFrame);
    }

    /**
     * Capture current canvas content as frame preview
     */
    captureCurrentCanvasToFrame(frameId) {
        if (!this.animation2D || !this.animation2D.canvas) return;

        const frameData = this.storyboard.frames.get(frameId);
        if (!frameData) return;

        try {
            // Capture canvas as image
            const imageData = this.animation2D.canvas.toDataURL('image/png');
            frameData.previewImage = imageData;

            // Also capture the actual drawing data
            if (this.animation2D.layers && this.animation2D.layers.length > 0) {
                frameData.layerData = this.animation2D.layers.map(layer => ({
                    name: layer.name,
                    visible: layer.visible,
                    locked: layer.locked,
                    opacity: layer.opacity
                }));
            }

            frameData.capturedAt = Date.now();
        } catch (error) {
            console.warn('Failed to capture canvas:', error);
        }
    }

    /**
     * Preview selected frame in the animation canvas
     */
    previewFrameInCanvas(frameId) {
        const frameData = this.storyboard.frames.get(frameId);
        if (!frameData || !frameData.previewImage) return;

        // Create a temporary image to display
        const img = new Image();
        img.onload = () => {
            // You can add logic here to display the preview
            console.log('Frame preview loaded:', frameId);
        };
        img.src = frameData.previewImage;
    }

    /**
     * Export entire storyboard as image grid (useful for printing)
     */
    exportAsImageGrid(options = {}) {
        const {
            cols = 3,
            rows = 4,
            scale = 1,
            showLabels = true,
            backgroundColor = '#1e293b'
        } = options;

        const frames = Array.from(this.storyboard.frames.values());
        if (frames.length === 0) {
            console.warn('No frames to export');
            return;
        }

        const cellWidth = 640 * scale;
        const cellHeight = 360 * scale;
        const padding = 20 * scale;
        const labelHeight = showLabels ? 40 * scale : 0;
        const totalHeight = (cellHeight + labelHeight + padding) * Math.ceil(frames.length / cols) + padding;
        const totalWidth = (cellWidth + padding) * cols + padding;

        const canvas = document.createElement('canvas');
        canvas.width = totalWidth;
        canvas.height = totalHeight;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        frames.forEach((frame, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = col * (cellWidth + padding) + padding;
            const y = row * (cellHeight + labelHeight + padding) + padding;

            // Draw frame border
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, cellWidth, cellHeight);

            // Draw frame preview or placeholder
            if (frame.previewImage) {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, x, y, cellWidth, cellHeight);
                };
                img.src = frame.previewImage;
            } else {
                ctx.fillStyle = '#334155';
                ctx.fillRect(x, y, cellWidth, cellHeight);
                ctx.fillStyle = '#cbd5e1';
                ctx.font = `${12 * scale}px Inter`;
                ctx.textAlign = 'center';
                ctx.fillText('SCENE ' + frame.number, x + cellWidth / 2, y + cellHeight / 2);
            }

            // Draw labels
            if (showLabels) {
                ctx.fillStyle = '#cbd5e1';
                ctx.font = `bold ${14 * scale}px Inter`;
                ctx.textAlign = 'left';
                ctx.fillText(`SCENE ${frame.number}`, x + 8, y + cellHeight + 12 * scale);
                ctx.font = `${12 * scale}px Inter`;
                ctx.fillStyle = '#94a3b8';
                ctx.fillText(frame.duration.toFixed(1) + 's', x + 8, y + cellHeight + 28 * scale);
            }
        });

        return canvas;
    }

    /**
     * Export storyboard as PDF
     */
    exportAsPDF() {
        if (typeof html2pdf === 'undefined') {
            console.warn('html2pdf library not loaded');
            alert('PDF export requires html2pdf library. Please add it to index.html');
            return;
        }

        const element = document.createElement('div');
        element.style.padding = '20px';
        element.style.backgroundColor = '#0f172a';

        this.storyboard.frames.forEach((frame, index) => {
            const frameDiv = document.createElement('div');
            frameDiv.style.marginBottom = '20px';
            frameDiv.style.pageBreakInside = 'avoid';

            const header = document.createElement('h2');
            header.textContent = `Scene ${frame.number}: ${frame.sceneName}`;
            header.style.color = '#3b82f6';
            header.style.marginBottom = '10px';

            const notes = document.createElement('p');
            notes.textContent = frame.notes || 'No notes';
            notes.style.color = '#cbd5e1';
            notes.style.marginBottom = '10px';

            frameDiv.appendChild(header);
            frameDiv.appendChild(notes);
            element.appendChild(frameDiv);
        });

        html2pdf().set({
            margin: 10,
            filename: `storyboard_${Date.now()}.pdf`,
            image: { type: 'PNG', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
        }).save().set(element);
    }

    /**
     * Batch import frames from a folder/directory
     */
    async batchImportFrames(imageUrls) {
        for (const [index, url] of imageUrls.entries()) {
            const frameId = this.storyboard.createNewFrame();
            const frameData = this.storyboard.frames.get(frameId);

            try {
                const response = await fetch(url);
                const blob = await response.blob();
                frameData.previewImage = URL.createObjectURL(blob);
                frameData.notes = `Imported frame ${index + 1}`;
            } catch (error) {
                console.warn(`Failed to import frame from ${url}:`, error);
            }
        }

        this.storyboard.saveHistory();
        this.storyboard.refreshUI();
    }

    /**
     * Generate shot list (text-based summary)
     */
    generateShotList() {
        let shotList = '=== STORYBOARD SHOT LIST ===\n\n';
        let totalDuration = 0;

        this.storyboard.frames.forEach((frame, index) => {
            totalDuration += frame.duration;
            shotList += `SCENE ${frame.number}: ${frame.sceneName}\n`;
            shotList += `Duration: ${frame.duration.toFixed(1)}s | Cumulative: ${totalDuration.toFixed(1)}s\n`;
            
            if (frame.notes) {
                shotList += `Notes: ${frame.notes}\n`;
            }
            
            if (frame.cameraDirections) {
                shotList += `Camera: ${frame.cameraDirections}\n`;
            }
            
            if (frame.audioSFX) {
                shotList += `Audio: ${frame.audioSFX}\n`;
            }
            
            if (frame.tags.length > 0) {
                shotList += `Tags: ${frame.tags.join(', ')}\n`;
            }
            
            shotList += '\n---\n\n';
        });

        shotList += `\nTOTAL DURATION: ${totalDuration.toFixed(2)} seconds\n`;
        shotList += `FRAME COUNT: ${this.storyboard.frames.size}\n`;
        shotList += `AVERAGE SCENE LENGTH: ${(totalDuration / this.storyboard.frames.size).toFixed(2)}s\n`;

        return shotList;
    }

    /**
     * Export shot list as text file
     */
    exportShotList() {
        const shotList = this.generateShotList();
        const blob = new Blob([shotList], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `shotlist_${Date.now()}.txt`;
        link.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Analyze storyboard statistics
     */
    getStatistics() {
        const frames = Array.from(this.storyboard.frames.values());
        const durations = frames.map(f => f.duration);
        const totalDuration = durations.reduce((a, b) => a + b, 0);

        return {
            frameCount: frames.length,
            totalDuration,
            averageDuration: totalDuration / frames.length,
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            totalTags: frames.reduce((sum, f) => sum + f.tags.length, 0),
            framesWithNotes: frames.filter(f => f.notes.length > 0).length,
            estimatedFrameRate: this.storyboard.settings.frameRate,
            totalFrameCount: Math.round(totalDuration * this.storyboard.settings.frameRate)
        };
    }

    /**
     * Compare two storyboard versions
     */
    compareWithExport(exportedData) {
        const current = Array.from(this.storyboard.frames.values());
        const imported = exportedData.frames || [];

        const comparison = {
            added: [],
            removed: [],
            modified: [],
            unchanged: 0
        };

        const importedMap = new Map(imported.map(f => [f.id, f]));

        current.forEach(frame => {
            if (!importedMap.has(frame.id)) {
                comparison.added.push(frame);
            } else {
                const imported = importedMap.get(frame.id);
                if (JSON.stringify(frame) !== JSON.stringify(imported)) {
                    comparison.modified.push({
                        frameId: frame.id,
                        current: frame,
                        previous: imported
                    });
                } else {
                    comparison.unchanged++;
                }
            }
        });

        importedMap.forEach((frame, id) => {
            if (!this.storyboard.frames.has(id)) {
                comparison.removed.push(frame);
            }
        });

        return comparison;
    }
}

// Auto-initialize integration when both managers are ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const integration = new Storyboard2DIntegration();
        integration.initialize();
        window.storyboard2DIntegration = integration;
    });
} else {
    const integration = new Storyboard2DIntegration();
    integration.initialize();
    window.storyboard2DIntegration = integration;
}
