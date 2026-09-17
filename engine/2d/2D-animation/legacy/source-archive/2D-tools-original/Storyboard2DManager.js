/**
 * Storyboard2DManager.js
 * Professional Advanced Storyboarding System for Animation 2D
 * 
 * Features:
 *  - Multiple view modes (Grid, List, Detail)
 *  - Frame management with metadata
 *  - Scene organization and tagging
 *  - Professional annotation system
 *  - Timeline scrubber integration
 *  - Undo/Redo support
 *  - Export/Import capabilities
 *  - Real-time frame preview
 */

class Storyboard2DManager {
    constructor(containerSelector = '#storyboard-panel') {
        this.container = document.querySelector(containerSelector);
        this.animation2DManager = null;
        this.isActive = false;
        this.currentViewMode = 'grid'; // 'grid', 'list', 'detail'
        this.selectedFrameId = null;

        // Frame data storage
        this.frames = new Map(); // frameId -> frameData
        this.frameCounter = 0;
        this.scenes = []; // Scene groupings

        // UI References
        this.elements = {};

        // History for undo/redo
        this.history = {
            states: [],
            currentIndex: -1,
            maxStates: 50
        };

        // Settings
        this.settings = {
            autoSave: true,
            autoSaveInterval: 30000,
            frameRate: 24,
            defaultDuration: 2.0,
            showFrameNumbers: true,
            showTimecodes: true,
            gridColumns: 'auto',
            toolbarPosition: 'top'
        };

        this.initializeUI();
        this.setupEventListeners();
        this.loadStoredData();
    }

    /* ════════════════════════════════════════════════════════
       1. UI INITIALIZATION
    ════════════════════════════════════════════════════════ */

    initializeUI() {
        if (!this.container) {
            console.error('Storyboard container not found');
            return;
        }

        this.container.innerHTML = this.getTemplateHTML();
        this.cacheElementReferences();
        this.setupToolbar();
    }

    getTemplateHTML() {
        return `
            <div id="storyboard-panel" class="storyboard-panel">
                <!-- Toolbar -->
                <div class="storyboard-toolbar">
                    <div class="storyboard-toolbar-group">
                        <button class="storyboard-btn storyboard-btn-icon" id="sb-new-frame" title="New Frame (Ctrl+N)">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="storyboard-btn storyboard-btn-icon" id="sb-delete-frame" title="Delete Frame">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button class="storyboard-btn storyboard-btn-icon" id="sb-duplicate-frame" title="Duplicate Frame">
                            <i class="fas fa-clone"></i>
                        </button>
                    </div>

                    <div class="storyboard-toolbar-divider"></div>

                    <div class="storyboard-toolbar-group">
                        <button class="storyboard-btn storyboard-btn-icon" id="sb-undo" title="Undo">
                            <i class="fas fa-undo"></i>
                        </button>
                        <button class="storyboard-btn storyboard-btn-icon" id="sb-redo" title="Redo">
                            <i class="fas fa-redo"></i>
                        </button>
                    </div>

                    <div class="storyboard-toolbar-divider"></div>

                    <div class="storyboard-toolbar-group">
                        <button class="storyboard-btn storyboard-btn-icon active" id="sb-view-grid" title="Grid View">
                            <i class="fas fa-th"></i>
                        </button>
                        <button class="storyboard-btn storyboard-btn-icon" id="sb-view-list" title="List View">
                            <i class="fas fa-list"></i>
                        </button>
                        <button class="storyboard-btn storyboard-btn-icon" id="sb-view-detail" title="Detail View">
                            <i class="fas fa-window-maximize"></i>
                        </button>
                    </div>

                    <div class="storyboard-toolbar-divider"></div>

                    <div class="storyboard-toolbar-group">
                        <button class="storyboard-btn storyboard-btn-icon" id="sb-import" title="Import Storyboard">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="storyboard-btn storyboard-btn-icon" id="sb-export" title="Export Storyboard">
                            <i class="fas fa-upload"></i>
                        </button>
                    </div>

                    <div class="storyboard-toolbar-divider"></div>

                    <div class="storyboard-toolbar-group">
                        <div class="storyboard-input-group">
                            <label>FPS:</label>
                            <input type="number" id="sb-fps-input" min="12" max="60" value="24" style="width: 50px;">
                        </div>
                        <div class="storyboard-input-group">
                            <label>Duration:</label>
                            <input type="number" id="sb-duration-input" min="0.1" max="30" step="0.1" value="2.0" style="width: 60px;">
                        </div>
                    </div>

                    <div class="storyboard-toolbar-divider"></div>

                    <div class="storyboard-toolbar-group">
                        <button class="storyboard-btn storyboard-btn-small" id="sb-settings">
                            <i class="fas fa-cog"></i> Settings
                        </button>
                        <button class="storyboard-btn storyboard-btn-small" id="sb-help">
                            <i class="fas fa-question-circle"></i> Help
                        </button>
                    </div>

                    <div style="flex: 1;"></div>
                    <span class="storyboard-toolbar-label" id="sb-frame-count">0 Frames</span>
                </div>

                <!-- Tabs -->
                <div class="storyboard-tabs" id="storyboard-tabs">
                    <button class="storyboard-tab active" data-tab="all">All Scenes</button>
                    <button class="storyboard-tab" data-tab="scene1">Scene 1</button>
                    <button class="storyboard-tab" data-tab="new-scene">+ New Scene</button>
                </div>

                <!-- Content Area -->
                <div class="storyboard-content">
                    <!-- Grid View -->
                    <div class="storyboard-grid-container" id="storyboard-grid-container" style="display: none;">
                        <div class="storyboard-grid" id="storyboard-grid"></div>
                    </div>

                    <!-- List View -->
                    <div class="storyboard-list-container" id="storyboard-list-container" style="display: none;">
                        <div class="storyboard-list" id="storyboard-list"></div>
                    </div>

                    <!-- Detail View -->
                    <div class="storyboard-detail-view" id="storyboard-detail-view" style="display: none;">
                        <!-- Left: Frame Preview -->
                        <div class="storyboard-detail-section">
                            <div class="storyboard-detail-title">Frame Preview</div>
                            <div class="storyboard-frame-canvas-wrapper">
                                <canvas class="storyboard-frame-canvas" id="detail-preview-canvas"></canvas>
                            </div>
                            <div class="storyboard-detail-field">
                                <label class="storyboard-detail-label">Frame Reference</label>
                                <input type="text" class="storyboard-detail-input" id="detail-frame-ref" readonly>
                            </div>
                        </div>

                        <!-- Right: Frame Details -->
                        <div class="storyboard-detail-section">
                            <div class="storyboard-detail-title">Frame Details</div>
                            <div class="storyboard-detail-field">
                                <label class="storyboard-detail-label">Scene Name</label>
                                <input type="text" class="storyboard-detail-input" id="detail-scene-name">
                            </div>
                            <div class="storyboard-detail-field">
                                <label class="storyboard-detail-label">Duration (seconds)</label>
                                <input type="number" class="storyboard-detail-input" id="detail-duration" step="0.1">
                            </div>
                            <div class="storyboard-detail-field">
                                <label class="storyboard-detail-label">Director's Notes</label>
                                <textarea class="storyboard-detail-input" id="detail-notes" style="height: 100px; resize: vertical;"></textarea>
                            </div>
                            <div class="storyboard-detail-field">
                                <label class="storyboard-detail-label">Camera Directions</label>
                                <textarea class="storyboard-detail-input" id="detail-camera" style="height: 80px; resize: vertical;"></textarea>
                            </div>
                            <div class="storyboard-detail-field">
                                <label class="storyboard-detail-label">Audio/SFX</label>
                                <input type="text" class="storyboard-detail-input" id="detail-audio" placeholder="Audio cues...">
                            </div>
                            <div class="storyboard-detail-field">
                                <label class="storyboard-detail-label">Tags</label>
                                <div id="detail-tags" class="storyboard-frame-tags"></div>
                                <input type="text" class="storyboard-detail-input" id="detail-tag-input" placeholder="Add tags (comma-separated)">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Timeline Scrubber -->
                <div class="storyboard-timeline" id="storyboard-timeline">
                    <div class="storyboard-timeline-playback">
                        <button class="storyboard-timeline-btn" id="sb-play" title="Play">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="storyboard-timeline-btn" id="sb-pause" title="Pause">
                            <i class="fas fa-pause"></i>
                        </button>
                        <button class="storyboard-timeline-btn" id="sb-stop" title="Stop">
                            <i class="fas fa-stop"></i>
                        </button>
                    </div>
                    <div class="storyboard-timeline-slider" id="storyboard-timeline-slider">
                        <div class="storyboard-timeline-progress" id="storyboard-timeline-progress"></div>
                    </div>
                    <span id="sb-timeline-info" style="font-size: 11px; color: var(--sb-text-muted); width: 80px; text-align: right;">0:00 / 0:00</span>
                </div>
            </div>
        `;
    }

    cacheElementReferences() {
        this.elements = {
            // Containers
            panel: this.container.querySelector('#storyboard-panel'),
            toolbar: this.container.querySelector('.storyboard-toolbar'),
            content: this.container.querySelector('.storyboard-content'),
            gridContainer: this.container.querySelector('#storyboard-grid-container'),
            listContainer: this.container.querySelector('#storyboard-list-container'),
            detailContainer: this.container.querySelector('#storyboard-detail-view'),
            grid: this.container.querySelector('#storyboard-grid'),
            list: this.container.querySelector('#storyboard-list'),

            // Toolbar buttons
            btnNewFrame: this.container.querySelector('#sb-new-frame'),
            btnDeleteFrame: this.container.querySelector('#sb-delete-frame'),
            btnDuplicateFrame: this.container.querySelector('#sb-duplicate-frame'),
            btnUndo: this.container.querySelector('#sb-undo'),
            btnRedo: this.container.querySelector('#sb-redo'),
            btnViewGrid: this.container.querySelector('#sb-view-grid'),
            btnViewList: this.container.querySelector('#sb-view-list'),
            btnViewDetail: this.container.querySelector('#sb-view-detail'),
            btnImport: this.container.querySelector('#sb-import'),
            btnExport: this.container.querySelector('#sb-export'),
            btnSettings: this.container.querySelector('#sb-settings'),
            btnHelp: this.container.querySelector('#sb-help'),
            fpsInput: this.container.querySelector('#sb-fps-input'),
            durationInput: this.container.querySelector('#sb-duration-input'),
            frameCount: this.container.querySelector('#sb-frame-count'),

            // Timeline
            btnPlay: this.container.querySelector('#sb-play'),
            btnPause: this.container.querySelector('#sb-pause'),
            btnStop: this.container.querySelector('#sb-stop'),
            timelineSlider: this.container.querySelector('#storyboard-timeline-slider'),
            timelineProgress: this.container.querySelector('#storyboard-timeline-progress'),
            timelineInfo: this.container.querySelector('#sb-timeline-info'),

            // Detail view inputs
            detailSceneName: this.container.querySelector('#detail-scene-name'),
            detailDuration: this.container.querySelector('#detail-duration'),
            detailNotes: this.container.querySelector('#detail-notes'),
            detailCamera: this.container.querySelector('#detail-camera'),
            detailAudio: this.container.querySelector('#detail-audio'),
            detailTags: this.container.querySelector('#detail-tags'),
            detailTagInput: this.container.querySelector('#detail-tag-input')
        };
    }

    setupToolbar() {
        this.settings.frameRate = parseInt(this.elements.fpsInput.value);
        this.settings.defaultDuration = parseFloat(this.elements.durationInput.value);
    }

    /* ════════════════════════════════════════════════════════
       2. EVENT LISTENERS
    ════════════════════════════════════════════════════════ */

    setupEventListeners() {
        // Toolbar buttons
        this.elements.btnNewFrame?.addEventListener('click', () => this.createNewFrame());
        this.elements.btnDeleteFrame?.addEventListener('click', () => this.deleteSelectedFrame());
        this.elements.btnDuplicateFrame?.addEventListener('click', () => this.duplicateSelectedFrame());
        this.elements.btnUndo?.addEventListener('click', () => this.undo());
        this.elements.btnRedo?.addEventListener('click', () => this.redo());

        // View mode buttons
        this.elements.btnViewGrid?.addEventListener('click', () => this.setViewMode('grid'));
        this.elements.btnViewList?.addEventListener('click', () => this.setViewMode('list'));
        this.elements.btnViewDetail?.addEventListener('click', () => this.setViewMode('detail'));

        // Import/Export
        this.elements.btnImport?.addEventListener('click', () => this.importStoryboard());
        this.elements.btnExport?.addEventListener('click', () => this.exportStoryboard());

        // Settings
        this.elements.btnSettings?.addEventListener('click', () => this.showSettingsModal());
        this.elements.btnHelp?.addEventListener('click', () => this.showHelpModal());

        // Timeline controls
        this.elements.btnPlay?.addEventListener('click', () => this.playTimeline());
        this.elements.btnPause?.addEventListener('click', () => this.pauseTimeline());
        this.elements.btnStop?.addEventListener('click', () => this.stopTimeline());
        this.elements.timelineSlider?.addEventListener('click', (e) => this.scrubTimeline(e));

        // Settings inputs
        this.elements.fpsInput?.addEventListener('change', (e) => {
            this.settings.frameRate = parseInt(e.target.value);
        });
        this.elements.durationInput?.addEventListener('change', (e) => {
            this.settings.defaultDuration = parseFloat(e.target.value);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        // Tabs
        this.container.querySelectorAll('.storyboard-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target));
        });
    }

    handleKeyboardShortcuts(e) {
        if (!this.isActive) return;

        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'n':
                    e.preventDefault();
                    this.createNewFrame();
                    break;
                case 'z':
                    e.preventDefault();
                    this.undo();
                    break;
                case 'y':
                    e.preventDefault();
                    this.redo();
                    break;
                case 'd':
                    e.preventDefault();
                    this.duplicateSelectedFrame();
                    break;
            }
        }

        if (e.key === 'Delete') {
            this.deleteSelectedFrame();
        }
    }

    /* ════════════════════════════════════════════════════════
       3. FRAME MANAGEMENT
    ════════════════════════════════════════════════════════ */

    createNewFrame(referenceData = null) {
        const frameId = `frame_${++this.frameCounter}`;
        const frameData = {
            id: frameId,
            number: this.frames.size + 1,
            timestamp: Date.now(),
            duration: this.settings.defaultDuration,
            sceneName: `Scene ${this.frames.size + 1}`,
            notes: '',
            cameraDirections: '',
            audioSFX: '',
            tags: [],
            previewImage: null,
            previewCanvas: null,
            linkedFrames: [],
            metadata: {}
        };

        if (referenceData) {
            Object.assign(frameData, referenceData);
        }

        this.frames.set(frameId, frameData);
        this.saveHistory();
        this.refreshUI();
        this.selectFrame(frameId);

        return frameId;
    }

    deleteSelectedFrame() {
        if (!this.selectedFrameId) return;

        const frameData = this.frames.get(this.selectedFrameId);
        if (frameData && confirm(`Delete frame "${frameData.sceneName}"?`)) {
            this.frames.delete(this.selectedFrameId);
            this.selectedFrameId = null;
            this.saveHistory();
            this.refreshUI();
        }
    }

    duplicateSelectedFrame() {
        if (!this.selectedFrameId) return;

        const sourceData = this.frames.get(this.selectedFrameId);
        if (sourceData) {
            const newData = JSON.parse(JSON.stringify(sourceData));
            newData.timestamp = Date.now();
            this.createNewFrame(newData);
        }
    }

    selectFrame(frameId) {
        this.selectedFrameId = frameId;
        this.refreshUI();
        this.loadFrameDetails(frameId);
    }

    loadFrameDetails(frameId) {
        const frameData = this.frames.get(frameId);
        if (!frameData) return;

        if (this.elements.detailSceneName) {
            this.elements.detailSceneName.value = frameData.sceneName;
        }
        if (this.elements.detailDuration) {
            this.elements.detailDuration.value = frameData.duration;
        }
        if (this.elements.detailNotes) {
            this.elements.detailNotes.value = frameData.notes;
        }
        if (this.elements.detailCamera) {
            this.elements.detailCamera.value = frameData.cameraDirections;
        }
        if (this.elements.detailAudio) {
            this.elements.detailAudio.value = frameData.audioSFX;
        }

        this.renderDetailTags(frameData.tags);
    }

    saveFrameDetails() {
        if (!this.selectedFrameId) return;

        const frameData = this.frames.get(this.selectedFrameId);
        if (frameData) {
            frameData.sceneName = this.elements.detailSceneName.value;
            frameData.duration = parseFloat(this.elements.detailDuration.value) || 0.5;
            frameData.notes = this.elements.detailNotes.value;
            frameData.cameraDirections = this.elements.detailCamera.value;
            frameData.audioSFX = this.elements.detailAudio.value;
            this.saveHistory();
        }
    }

    /* ════════════════════════════════════════════════════════
       4. UI RENDERING
    ════════════════════════════════════════════════════════ */

    refreshUI() {
        this.updateFrameCount();
        this.renderCurrentView();
    }

    updateFrameCount() {
        const count = this.frames.size;
        this.elements.frameCount.textContent = `${count} Frame${count !== 1 ? 's' : ''}`;
    }

    setViewMode(mode) {
        this.currentViewMode = mode;

        // Update button states
        this.elements.btnViewGrid.classList.toggle('active', mode === 'grid');
        this.elements.btnViewList.classList.toggle('active', mode === 'list');
        this.elements.btnViewDetail.classList.toggle('active', mode === 'detail');

        // Show/hide containers
        this.elements.gridContainer.style.display = mode === 'grid' ? 'flex' : 'none';
        this.elements.listContainer.style.display = mode === 'list' ? 'flex' : 'none';
        this.elements.detailContainer.style.display = mode === 'detail' ? 'grid' : 'none';

        this.renderCurrentView();
    }

    renderCurrentView() {
        switch (this.currentViewMode) {
            case 'grid':
                this.renderGridView();
                break;
            case 'list':
                this.renderListView();
                break;
            case 'detail':
                this.renderDetailView();
                break;
        }
    }

    renderGridView() {
        this.elements.grid.innerHTML = '';

        this.frames.forEach((frameData, frameId) => {
            const frameCard = this.createFrameCard(frameData);
            frameCard.addEventListener('click', () => this.selectFrame(frameId));
            
            if (frameId === this.selectedFrameId) {
                frameCard.classList.add('selected');
            }

            this.elements.grid.appendChild(frameCard);
        });
    }

    createFrameCard(frameData) {
        const card = document.createElement('div');
        card.className = 'storyboard-frame';
        card.dataset.frameId = frameData.id;

        card.innerHTML = `
            <div class="storyboard-frame-header">
                <div class="storyboard-frame-number">${frameData.number}</div>
                <div class="storyboard-frame-time">${this.formatTimecode(frameData.duration)}</div>
            </div>

            <div class="storyboard-frame-canvas-wrapper">
                <canvas class="storyboard-frame-canvas"></canvas>
                <div class="storyboard-canvas-placeholder">
                    <i class="fas fa-image"></i><br>Click to add artwork
                </div>
            </div>

            <div class="storyboard-frame-meta">
                <div class="storyboard-frame-meta-item">
                    <div class="storyboard-meta-label">Duration</div>
                    <div class="storyboard-meta-value">${frameData.duration.toFixed(1)}s</div>
                </div>
                <div class="storyboard-frame-meta-item">
                    <div class="storyboard-meta-label">Scene</div>
                    <div class="storyboard-meta-value">${frameData.sceneName}</div>
                </div>
            </div>

            <div class="storyboard-frame-notes">
                <div class="storyboard-frame-notes-label">Notes</div>
                <textarea readonly>${frameData.notes}</textarea>
            </div>

            <div class="storyboard-frame-tags">
                ${frameData.tags.map(tag => `<span class="storyboard-tag">${tag}</span>`).join('')}
            </div>

            <div class="storyboard-frame-actions">
                <button class="storyboard-frame-action-btn" data-action="edit">Edit</button>
                <button class="storyboard-frame-action-btn" data-action="duplicate">Dup</button>
                <button class="storyboard-frame-action-btn" data-action="delete">Del</button>
            </div>
        `;

        // Action handlers
        card.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setViewMode('detail');
        });

        card.querySelector('[data-action="duplicate"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectFrame(frameData.id);
            this.duplicateSelectedFrame();
        });

        card.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectFrame(frameData.id);
            this.deleteSelectedFrame();
        });

        return card;
    }

    renderListView() {
        this.elements.list.innerHTML = '';

        this.frames.forEach((frameData, frameId) => {
            const listItem = document.createElement('div');
            listItem.className = 'storyboard-list-item';
            if (frameId === this.selectedFrameId) {
                listItem.classList.add('selected');
            }

            listItem.innerHTML = `
                <div class="storyboard-list-thumbnail">
                    <div class="storyboard-canvas-placeholder" style="font-size: 8px;">
                        <i class="fas fa-image"></i>
                    </div>
                </div>

                <div class="storyboard-list-info">
                    <div class="storyboard-list-title">
                        ${frameData.sceneName}
                    </div>
                    <div class="storyboard-list-desc">
                        ${frameData.notes.substring(0, 50)}${frameData.notes.length > 50 ? '...' : ''}
                    </div>
                    <div class="storyboard-list-meta">
                        <span>${frameData.duration.toFixed(1)}s</span>
                        <span>${frameData.tags.length} tags</span>
                    </div>
                </div>

                <div class="storyboard-list-actions">
                    <button class="storyboard-list-action-btn" data-action="edit" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="storyboard-list-action-btn" data-action="delete" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            listItem.addEventListener('click', () => this.selectFrame(frameId));
            listItem.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setViewMode('detail');
            });
            listItem.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectFrame(frameId);
                this.deleteSelectedFrame();
            });

            this.elements.list.appendChild(listItem);
        });
    }

    renderDetailView() {
        if (this.selectedFrameId) {
            this.loadFrameDetails(this.selectedFrameId);
        }
    }

    renderDetailTags(tags) {
        const tagsContainer = this.elements.detailTags;
        tagsContainer.innerHTML = tags.map(tag => `
            <span class="storyboard-tag">
                ${tag}
                <span class="storyboard-tag-remove" data-tag="${tag}">×</span>
            </span>
        `).join('');

        tagsContainer.querySelectorAll('.storyboard-tag-remove').forEach(el => {
            el.addEventListener('click', (e) => {
                const tag = e.target.dataset.tag;
                const frameData = this.frames.get(this.selectedFrameId);
                if (frameData) {
                    frameData.tags = frameData.tags.filter(t => t !== tag);
                    this.renderDetailTags(frameData.tags);
                    this.saveHistory();
                }
            });
        });
    }

    /* ════════════════════════════════════════════════════════
       5. UTILITY FUNCTIONS
    ════════════════════════════════════════════════════════ */

    formatTimecode(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);

        if (h > 0) {
            return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(ms).padStart(2, '0')}`;
        }
        return `${m}:${String(s).padStart(2, '0')}:${String(ms).padStart(2, '0')}`;
    }

    getTotalDuration() {
        let total = 0;
        this.frames.forEach(frame => {
            total += frame.duration;
        });
        return total;
    }

    /* ════════════════════════════════════════════════════════
       6. HISTORY (UNDO/REDO)
    ════════════════════════════════════════════════════════ */

    saveHistory() {
        const state = this.serializeState();
        
        // Remove any states after current index
        this.history.states = this.history.states.slice(0, this.history.currentIndex + 1);
        
        // Add new state
        this.history.states.push(state);
        this.history.currentIndex++;

        // Limit history size
        if (this.history.states.length > this.history.maxStates) {
            this.history.states.shift();
            this.history.currentIndex--;
        }

        this.updateHistoryButtonStates();
    }

    undo() {
        if (this.history.currentIndex > 0) {
            this.history.currentIndex--;
            this.restoreState(this.history.states[this.history.currentIndex]);
            this.updateHistoryButtonStates();
        }
    }

    redo() {
        if (this.history.currentIndex < this.history.states.length - 1) {
            this.history.currentIndex++;
            this.restoreState(this.history.states[this.history.currentIndex]);
            this.updateHistoryButtonStates();
        }
    }

    serializeState() {
        const state = new Map();
        this.frames.forEach((value, key) => {
            state.set(key, JSON.parse(JSON.stringify(value)));
        });
        return state;
    }

    restoreState(state) {
        this.frames.clear();
        state.forEach((value, key) => {
            this.frames.set(key, JSON.parse(JSON.stringify(value)));
        });
        this.refreshUI();
    }

    updateHistoryButtonStates() {
        const canUndo = this.history.currentIndex > 0;
        const canRedo = this.history.currentIndex < this.history.states.length - 1;

        this.elements.btnUndo.disabled = !canUndo;
        this.elements.btnRedo.disabled = !canRedo;
        this.elements.btnUndo.classList.toggle('disabled', !canUndo);
        this.elements.btnRedo.classList.toggle('disabled', !canRedo);
    }

    /* ════════════════════════════════════════════════════════
       7. TIMELINE PLAYBACK
    ════════════════════════════════════════════════════════ */

    playTimeline() {
        // Implementation for timeline playback
        console.log('Playing timeline...');
        this.elements.btnPlay.classList.add('active');
        this.elements.btnPause.classList.remove('active');
    }

    pauseTimeline() {
        console.log('Pausing timeline...');
        this.elements.btnPlay.classList.remove('active');
        this.elements.btnPause.classList.add('active');
    }

    stopTimeline() {
        console.log('Stopping timeline...');
        this.elements.btnPlay.classList.remove('active');
        this.elements.btnPause.classList.remove('active');
    }

    scrubTimeline(e) {
        const rect = this.elements.timelineSlider.getBoundingClientRect();
        const progress = (e.clientX - rect.left) / rect.width;
        const totalDuration = this.getTotalDuration();
        const currentTime = progress * totalDuration;

        this.elements.timelineProgress.style.width = (progress * 100) + '%';
        this.elements.timelineInfo.textContent = `${this.formatTimecode(currentTime)} / ${this.formatTimecode(totalDuration)}`;
    }

    /* ════════════════════════════════════════════════════════
       8. IMPORT/EXPORT
    ════════════════════════════════════════════════════════ */

    exportStoryboard() {
        const data = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            settings: this.settings,
            frames: Array.from(this.frames.entries()).map(([id, data]) => ({
                id,
                ...data
            }))
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `storyboard_${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    importStoryboard() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (data.frames) {
                        this.frames.clear();
                        data.frames.forEach(frame => {
                            this.frames.set(frame.id, frame);
                            this.frameCounter = Math.max(this.frameCounter, parseInt(frame.id.split('_')[1]) || 0);
                        });
                        this.saveHistory();
                        this.refreshUI();
                        alert('Storyboard imported successfully!');
                    }
                } catch (error) {
                    alert('Error importing storyboard: ' + error.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    /* ════════════════════════════════════════════════════════
       9. MODALS
    ════════════════════════════════════════════════════════ */

    showSettingsModal() {
        const modal = this.createModal('Storyboard Settings', [
            { label: 'Auto Save', type: 'checkbox', value: this.settings.autoSave },
            { label: 'Frame Rate (FPS)', type: 'number', value: this.settings.frameRate },
            { label: 'Default Duration', type: 'number', value: this.settings.defaultDuration, step: 0.1 },
            { label: 'Show Frame Numbers', type: 'checkbox', value: this.settings.showFrameNumbers },
            { label: 'Show Timecodes', type: 'checkbox', value: this.settings.showTimecodes }
        ]);

        modal.show();
    }

    showHelpModal() {
        const helpContent = `
            <div style="font-size: 12px; line-height: 1.6; color: var(--sb-text-muted);">
                <h3 style="color: var(--sb-accent-bright); margin-bottom: 12px;">Storyboard Manager Shortcuts</h3>
                <ul style="list-style: none; padding: 0; margin: 0;">
                    <li><strong>Ctrl+N</strong> - New Frame</li>
                    <li><strong>Ctrl+Z</strong> - Undo</li>
                    <li><strong>Ctrl+Y</strong> - Redo</li>
                    <li><strong>Ctrl+D</strong> - Duplicate Frame</li>
                    <li><strong>Delete</strong> - Delete Frame</li>
                    <li style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--sb-grid-line);">
                        <strong style="color: var(--sb-accent-bright);">Pro Tips:</strong>
                    </li>
                    <li>• Add multiple frames quickly with Ctrl+N</li>
                    <li>• Use different views for different workflows</li>
                    <li>• Add detailed notes and camera directions in detail view</li>
                    <li>• Export your storyboard as JSON for backup</li>
                </ul>
            </div>
        `;

        this.showCustomModal('Storyboard Help', helpContent);
    }

    createModal(title, fields) {
        // Placeholder for modal creation
        console.log('Modal:', title, fields);
    }

    showCustomModal(title, content) {
        const overlay = document.createElement('div');
        overlay.className = 'storyboard-modal-overlay';
        overlay.innerHTML = `
            <div class="storyboard-modal">
                <div class="storyboard-modal-header">${title}</div>
                <div class="storyboard-modal-content">${content}</div>
            </div>
        `;

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        document.body.appendChild(overlay);
    }

    /* ════════════════════════════════════════════════════════
       10. DATA PERSISTENCE
    ════════════════════════════════════════════════════════ */

    saveStoredData() {
        const data = {
            frames: Array.from(this.frames.entries()),
            frameCounter: this.frameCounter,
            settings: this.settings
        };
        localStorage.setItem('storyboard2d_data', JSON.stringify(data));
    }

    loadStoredData() {
        try {
            const stored = localStorage.getItem('storyboard2d_data');
            if (stored) {
                const data = JSON.parse(stored);
                this.frames = new Map(data.frames);
                this.frameCounter = data.frameCounter || 0;
                if (data.settings) {
                    this.settings = { ...this.settings, ...data.settings };
                }
                this.refreshUI();
            }
        } catch (error) {
            console.warn('Error loading storyboard data:', error);
        }
    }

    switchTab(tabElement) {
        document.querySelectorAll('.storyboard-tab').forEach(t => t.classList.remove('active'));
        tabElement.classList.add('active');
    }

    activate() {
        this.isActive = true;
        this.container.style.display = 'flex';
    }

    deactivate() {
        this.isActive = false;
        this.container.style.display = 'none';
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.storyboard2DManager = new Storyboard2DManager();
    });
} else {
    window.storyboard2DManager = new Storyboard2DManager();
}
