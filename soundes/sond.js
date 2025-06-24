class AudioStudio {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.source = null;
        this.masterGain = this.audioContext.createGain();

        // Audio nodes
        this.inputGain = this.audioContext.createGain();
        this.stereoEnhancer = this.audioContext.createStereoPanner();
        
        // Analysis nodes
        this.inputAnalyser = this.audioContext.createAnalyser(); // For main spectrum, waveform (mixed input)
        this.outputAnalyser = this.audioContext.createAnalyser(); // For master output analysis
        this.splitter = this.audioContext.createChannelSplitter(2); // To get L/R channels

        // Dedicated L/R analysers for meters and stereo visualizations
        this.leftMeterAnalyser = this.audioContext.createAnalyser();
        this.rightMeterAnalyser = this.audioContext.createAnalyser();

        // Effects chain
        this.eqNodes = [];
        this.dynamics = this.audioContext.createDynamicsCompressor();
        this.reverb = this.audioContext.createConvolver();
        this.reverbGain = this.audioContext.createGain();
        this.dryGain = this.audioContext.createGain();
        this.saturation = this.audioContext.createWaveShaper();

        // State
        this.isPlaying = false;
        this.startTime = 0; // For tracking playback time relative to audioContext.currentTime
        this.pausedTime = 0; // To store playback position when paused
        this.loop = false;
        this.effectsEnabled = { eq: true, dynamics: true, reverb: true, saturation: true };

        // Analysis setup
        this.inputAnalyser.fftSize = 2048; // Adjusted for performance, 4096 is also good
        this.outputAnalyser.fftSize = 2048;
        this.leftMeterAnalyser.fftSize = 1024; // Smaller for meters is often fine
        this.rightMeterAnalyser.fftSize = 1024;

        this.freqData = new Uint8Array(this.inputAnalyser.frequencyBinCount);
        this.timeData = new Float32Array(this.inputAnalyser.frequencyBinCount);
        this.outputTimeData = new Float32Array(this.outputAnalyser.frequencyBinCount);
        this.leftTimeData = new Float32Array(this.leftMeterAnalyser.frequencyBinCount);
        this.rightTimeData = new Float32Array(this.rightMeterAnalyser.frequencyBinCount);

        // Canvas contexts - Initialized to null
        this.spectrumCtx = null;
        this.waveformCtx = null;
        this.phaseCtx = null;
        this.eqCtx = null;
        this.dynamicsCtx = null;

        this.initUI(); // Initialize references to DOM elements
        this.setupEventListeners(); // Setup basic event listeners
        this.setupEffects(); // Configure effect parameters
        this.generateImpulseResponse(); // Default reverb impulse
        this.createSaturationCurve(); // Default saturation

        this.connectNodes(); // Initial connection (source will be null)
        this.animate();      // Start animation loop
    }

    initializeVisualizations() {
        console.log("Attempting to initialize visualizations...");
        this.spectrumCtx = this.initCanvas('spectrumCanvas');
        this.waveformCtx = this.initCanvas('waveformCanvas');
        this.phaseCtx = this.initCanvas('phaseCanvas');
        this.eqCtx = this.initCanvas('eqCanvas');
        this.dynamicsCtx = this.initCanvas('dynamicsCanvas');

        let allInitialized = this.spectrumCtx && this.waveformCtx && this.phaseCtx && this.eqCtx && this.dynamicsCtx;
        if (!allInitialized) {
            console.warn("One or more canvas contexts could not be initialized. Visualizations might be incomplete or not appear. Ensure their parent container is visible and has dimensions.");
        } else {
            console.log("All visualization canvases initialized successfully.");
        }
    }

    initCanvas(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error(`Canvas with id '${canvasId}' not found.`);
            return null;
        }

        const displayWidth = canvas.offsetWidth;
        const displayHeight = canvas.offsetHeight;

        if (displayWidth === 0 || displayHeight === 0) {
            console.warn(`Canvas '${canvasId}' has zero dimensions (offsetWidth: ${displayWidth}, offsetHeight: ${displayHeight}) at init time. It (or its parent) might be hidden or lack CSS dimensions. Canvas will not be properly set up for drawing.`);
            return null; // Crucial: do not proceed if canvas has no renderable size
        }
        
        // console.log(`${canvasId} CSS dimensions: ${displayWidth}x${displayHeight}, DevicePixelRatio: ${window.devicePixelRatio}`);

        canvas.width = displayWidth * window.devicePixelRatio;
        canvas.height = displayHeight * window.devicePixelRatio;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error(`Could not get 2D context for ${canvasId}`);
            return null;
        }
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        return ctx;
    }

    initUI() {
        this.playBtn = document.getElementById('playBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.loopBtn = document.getElementById('loopBtn');
        this.timeDisplay = document.getElementById('currentTime');
        this.leftMeter = document.getElementById('leftMeter');
        this.rightMeter = document.getElementById('rightMeter');
        this.masterMeter = document.getElementById('masterMeter');

        if (!this.playBtn || !this.stopBtn || !this.loopBtn || !this.timeDisplay) {
            console.warn("One or more core transport UI elements are missing.");
        }
        if (!this.leftMeter || !this.rightMeter || !this.masterMeter) {
            console.warn("One or more meter display elements are missing.");
        }
    }

    setupEventListeners() {
        if (this.playBtn) this.playBtn.addEventListener('click', () => this.togglePlay());
        if (this.stopBtn) this.stopBtn.addEventListener('click', () => this.stop());
        if (this.loopBtn) this.loopBtn.addEventListener('click', () => this.toggleLoop());

        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.addEventListener('change', (e) => this.loadAudio(e));
        else console.warn("File input 'fileInput' not found.");

        ['eq', 'dynamics', 'reverb'].forEach(effectName => {
            const toggleButton = document.getElementById(`${effectName}Toggle`);
            if (toggleButton) {
                toggleButton.addEventListener('click', () => this.toggleEffect(effectName));
                // Set initial button state
                toggleButton.classList.toggle('active', this.effectsEnabled[effectName]);
                toggleButton.textContent = this.effectsEnabled[effectName] ? 'On' : 'Off';
            } else {
                console.warn(`Toggle button '${effectName}Toggle' not found.`);
            }
        });
        
        // Dynamics controls
        const dynamicsControlsContainer = document.querySelector('.dynamics-controls');
        if (dynamicsControlsContainer) {
            dynamicsControlsContainer.innerHTML = `
                <div class="slider-container">
                    <div class="slider-label"><span>Threshold</span><span id="thresholdValue">-24.0 dB</span></div>
                    <input type="range" id="threshold" min="-60" max="0" value="-24" step="0.1">
                </div>
                <div class="slider-container">
                    <div class.slider-label"><span>Ratio</span><span id="ratioValue">4.0:1</span></div>
                    <input type="range" id="ratio" min="1" max="20" value="4" step="0.1">
                </div>`;
            document.getElementById('threshold')?.addEventListener('input', (e) => {
                this.dynamics.threshold.value = parseFloat(e.target.value);
                document.getElementById('thresholdValue').textContent = `${parseFloat(e.target.value).toFixed(1)} dB`;
            });
            document.getElementById('ratio')?.addEventListener('input', (e) => {
                this.dynamics.ratio.value = parseFloat(e.target.value);
                document.getElementById('ratioValue').textContent = `${parseFloat(e.target.value).toFixed(1)}:1`;
            });
        }

        // Reverb controls
        const reverbControlsContainer = document.querySelector('.reverb-controls');
        if (reverbControlsContainer) {
            reverbControlsContainer.innerHTML = `
                <div class="slider-container">
                    <div class="slider-label"><span>Decay</span><span id="decayValue">2.0s</span></div>
                    <input type="range" id="decay" min="0.1" max="5" value="2" step="0.1">
                </div>
                <div class="slider-container">
                    <div class="slider-label"><span>Wet</span><span id="wetValue">0.30</span></div>
                    <input type="range" id="wet" min="0" max="1" value="0.3" step="0.01">
                </div>`;
            document.getElementById('decay')?.addEventListener('input', (e) => {
                this.generateImpulseResponse(parseFloat(e.target.value));
                document.getElementById('decayValue').textContent = `${parseFloat(e.target.value).toFixed(1)}s`;
            });
            document.getElementById('wet')?.addEventListener('input', (e) => {
                const wetVal = parseFloat(e.target.value);
                this.reverbGain.gain.value = wetVal;
                this.dryGain.gain.value = 1 - wetVal;
                document.getElementById('wetValue').textContent = wetVal.toFixed(2);
            });
        }
    }

    setupEffects() {
        const eqFrequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        const eqContainer = document.querySelector('.eq-controls');
        this.eqNodes = []; // Clear existing nodes if any

        if (eqContainer) {
            eqContainer.innerHTML = ''; // Clear previous sliders
            eqFrequencies.forEach((freq) => {
                const filter = this.audioContext.createBiquadFilter();
                filter.type = 'peaking';
                filter.frequency.value = freq;
                filter.Q.value = 1.414; // Reasonably broad Q
                filter.gain.value = 0;
                this.eqNodes.push(filter);

                const sliderId = `eqGainValue-${freq}`;
                const sliderDiv = document.createElement('div');
                sliderDiv.className = 'slider-container';
                sliderDiv.style.width = 'calc(10% - 10px)'; 
                sliderDiv.style.minWidth = '60px';
                sliderDiv.innerHTML = `
                    <div class="slider-label">
                        <span>${freq >= 1000 ? freq / 1000 + 'k' : freq}</span>
                        <span id="${sliderId}">0.0 dB</span>
                    </div>
                    <input type="range" min="-18" max="18" value="0" step="0.1" data-freq="${freq}">`;
                eqContainer.appendChild(sliderDiv);
                sliderDiv.querySelector('input').addEventListener('input', (e) => {
                    filter.gain.value = parseFloat(e.target.value);
                    document.getElementById(sliderId).textContent = `${parseFloat(e.target.value).toFixed(1)} dB`;
                });
            });
        } else { console.warn("EQ controls container '.eq-controls' not found.");}

        this.dynamics.threshold.value = -24;
        this.dynamics.knee.value = 30;
        this.dynamics.ratio.value = 4;
        this.dynamics.attack.value = 0.003;
        this.dynamics.release.value = 0.25;

        this.reverbGain.gain.value = 0.3;
        this.dryGain.gain.value = 0.7;
        this.stereoEnhancer.pan.value = 0;
        this.masterGain.gain.value = 0.8; // Default master gain
    }

    createSaturationCurve(amount = 2) { // amount controls intensity
        const k = typeof amount === 'number' ? amount : 2;
        const numSamples = 44100;
        const curve = new Float32Array(numSamples);
        const deg = Math.PI / 180;
        for (let i = 0; i < numSamples; ++i) {
            const x = i * 2 / numSamples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        this.saturation.curve = curve;
        this.saturation.oversample = '4x';
    }

    generateImpulseResponse(decayTime = 2, sampleRateOverride = null) {
        const sr = sampleRateOverride || this.audioContext.sampleRate;
        const len = sr * Math.max(0.01, decayTime); // ensure minimum length
        const impulse = this.audioContext.createBuffer(2, len, sr);

        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < len; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5); // Exponential decay
            }
        }
        this.reverb.buffer = impulse;
    }

    disconnectAll() {
        // Disconnect nodes that might be connected to multiple things or destination
        if (this.source) this.source.disconnect();
        this.inputGain.disconnect();
        this.splitter.disconnect();
        this.inputAnalyser.disconnect();
        this.leftMeterAnalyser.disconnect();
        this.rightMeterAnalyser.disconnect();
        this.eqNodes.forEach(node => node.disconnect());
        this.dynamics.disconnect();
        this.saturation.disconnect();
        this.reverb.disconnect();
        this.dryGain.disconnect();
        this.reverbGain.disconnect();
        this.stereoEnhancer.disconnect();
        this.masterGain.disconnect();
        this.outputAnalyser.disconnect();
    }

    connectNodes() {
        this.disconnectAll(); // Ensure clean slate

        if (!this.source) { // If no audio loaded, still connect master gain for potential output meter
            this.masterGain.connect(this.outputAnalyser);
            this.outputAnalyser.connect(this.audioContext.destination); // So master meter works even w/o source
            return;
        }

        let currentNode = this.source;

        currentNode.connect(this.inputGain);
        currentNode = this.inputGain;

        // Split for L/R analysis early for "Input Meters"
        currentNode.connect(this.splitter);
        this.splitter.connect(this.leftMeterAnalyser, 0);  // Left channel to left analyser
        this.splitter.connect(this.rightMeterAnalyser, 1); // Right channel to right analyser
        
        // Main signal path continues from inputGain (or splitter if you prefer to analyze pre-gain)
        // For main spectrum/waveform, take the mixed signal from inputGain
        currentNode.connect(this.inputAnalyser); 

        // Effects Chain
        if (this.effectsEnabled.eq && this.eqNodes.length > 0) {
            this.eqNodes.forEach(eqNode => {
                currentNode.connect(eqNode);
                currentNode = eqNode;
            });
        }
        if (this.effectsEnabled.dynamics) {
            currentNode.connect(this.dynamics);
            currentNode = this.dynamics;
        }
        if (this.effectsEnabled.saturation) {
            currentNode.connect(this.saturation);
            currentNode = this.saturation;
        }

        // Reverb Send/Return
        const reverbMix = this.audioContext.createGain();
        currentNode.connect(this.dryGain); // Dry path
        this.dryGain.connect(reverbMix);

        if (this.effectsEnabled.reverb) {
            currentNode.connect(this.reverb); // Wet path send
            this.reverb.connect(this.reverbGain);
            this.reverbGain.connect(reverbMix); // Wet path return
        }
        currentNode = reverbMix; // Mix is now the current node

        currentNode.connect(this.stereoEnhancer);
        currentNode = this.stereoEnhancer;

        currentNode.connect(this.masterGain);
        currentNode = this.masterGain;

        currentNode.connect(this.outputAnalyser); // For Master Output Meter
        currentNode.connect(this.audioContext.destination);
    }

    async loadAudio(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            this.stop(); // Stop any current playback and reset

            this.source = this.audioContext.createBufferSource();
            this.source.buffer = audioBuffer;
            this.source.loop = this.loop;
            
            this.connectNodes(); // Reconnect with the new source
            
            this.pausedTime = 0; // Reset pause time for new file
            if (this.playBtn) this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
            this.isPlaying = false;

            // Check if visualization panel is visible, if so, re-initialize canvases
            // This helps if canvases were not ready when panel was first shown but now a file is loaded
            const vizContainer = document.getElementById('sound-controls-vis');
            if (vizContainer && getComputedStyle(vizContainer).display !== 'none') {
                 requestAnimationFrame(() => this.initializeVisualizations());
            }

        } catch (e) {
            console.error("Error loading or decoding audio file:", e);
            alert("Error loading audio file. Check console for details.");
        }
    }

    togglePlay() {
        if (!this.source || !this.source.buffer) {
            alert("Please load an audio file first.");
            return;
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => this._actuallyTogglePlay());
        } else {
            this._actuallyTogglePlay();
        }
    }

    _actuallyTogglePlay() {
        if (this.isPlaying) { // Pause
            this.source.stop(); // This makes the source unusable for future 'start'
            this.pausedTime += this.audioContext.currentTime - this.startTime; // Accumulate played duration
            this.isPlaying = false;
            if (this.playBtn) this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        } else { // Play or Resume
            // Create a new source node because the old one cannot be restarted after stop()
            const oldBuffer = this.source.buffer;
            const oldLoop = this.source.loop;
            
            this.source = this.audioContext.createBufferSource();
            this.source.buffer = oldBuffer;
            this.source.loop = oldLoop;
            this.connectNodes(); // Reconnect new source to the graph

            this.startTime = this.audioContext.currentTime; // Reset start time reference for this play segment
            this.source.start(0, this.pausedTime % (this.source.buffer.duration || Infinity)); // Start from pausedTime, modulo duration for loops
            
            this.isPlaying = true;
            if (this.playBtn) this.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        }
    }

    stop() {
        if (this.source) {
            try {
                this.source.stop(); // Makes source unusable for future 'start'
            } catch (e) { /* Might already be stopped or not started */ }
        }
        this.isPlaying = false;
        this.pausedTime = 0; // Reset paused time
        if (this.playBtn) this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        if (this.timeDisplay) this.timeDisplay.textContent = this.formatTime(0);

        // If a source buffer exists, prepare a new source node for next play
        if (this.source && this.source.buffer) {
            const oldBuffer = this.source.buffer;
            const oldLoop = this.source.loop;
            this.source = this.audioContext.createBufferSource();
            this.source.buffer = oldBuffer;
            this.source.loop = oldLoop;
            this.connectNodes(); // Reconnect the new, ready-to-play source
        }
    }

    toggleLoop() {
        this.loop = !this.loop;
        if (this.source) this.source.loop = this.loop;
        if (this.loopBtn) this.loopBtn.classList.toggle('active', this.loop);
    }

    toggleEffect(effectName) {
        this.effectsEnabled[effectName] = !this.effectsEnabled[effectName];
        this.connectNodes(); // Re-wire the audio graph
        const button = document.getElementById(`${effectName}Toggle`);
        if (button) {
            button.classList.toggle('active', this.effectsEnabled[effectName]);
            button.textContent = this.effectsEnabled[effectName] ? 'On' : 'Off';
        }
    }

    formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const milliseconds = Math.floor((totalSeconds % 1) * 100);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    }

    // --- Drawing Methods ---
    // Each drawing method now checks for context and canvas dimensions.
    // Uses `canvas.offsetWidth` and `offsetHeight` for layout dimensions,
    // as `canvas.width/height` are the scaled drawing surface.

    drawSpectrum() {
        if (!this.spectrumCtx || this.spectrumCtx.canvas.offsetWidth === 0) return;
        const ctx = this.spectrumCtx;
        const { offsetWidth: cssWidth, offsetHeight: cssHeight } = ctx.canvas;

        ctx.fillStyle = 'rgba(10, 15, 15, 0.7)';
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        this.inputAnalyser.getByteFrequencyData(this.freqData);
        
        const numBars = 128; // Display fewer bars for clarity
        const barWidth = cssWidth / numBars;
        let x = 0;

        for (let i = 0; i < numBars; i++) {
            // Logarithmic mapping of freqData bins to bars might be better here.
            // Simple linear mapping for now:
            const dataIndex = Math.floor(i * (this.freqData.length / numBars));
            const value = this.freqData[dataIndex] || 0;
            const percent = value / 255;
            const barHeight = percent * cssHeight;
            const hue = (i / numBars) * 260 + 180; // Blues to Greens to Yellows

            ctx.fillStyle = `hsl(${hue % 360}, 90%, ${Math.max(15, 40 + percent * 40)}%)`;
            ctx.fillRect(x, cssHeight - barHeight, barWidth - 1, barHeight);
            x += barWidth;
        }
    }

    drawWaveformAndVectorscope() {
        if (!this.waveformCtx || this.waveformCtx.canvas.offsetWidth === 0) return;
        const ctx = this.waveformCtx;
        const { offsetWidth: cssWidth, offsetHeight: cssHeight } = ctx.canvas;

        ctx.fillStyle = 'rgba(10, 15, 15, 0.7)';
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        // Waveform (Top half)
        this.inputAnalyser.getFloatTimeDomainData(this.timeData);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'var(--accent)';
        ctx.beginPath();
        const waveformSliceWidth = cssWidth / this.timeData.length;
        let wx = 0;
        const waveformHeight = cssHeight / 2;
        for (let i = 0; i < this.timeData.length; i++) {
            const v = this.timeData[i];
            const wy = (v * waveformHeight * 0.9) / 2 + waveformHeight / 2; // Center in top half
            if (i === 0) ctx.moveTo(wx, wy);
            else ctx.lineTo(wx, wy);
            wx += waveformSliceWidth;
        }
        ctx.stroke();

        // Vectorscope (Bottom half - Lissajous)
        this.leftMeterAnalyser.getFloatTimeDomainData(this.leftTimeData);
        this.rightMeterAnalyser.getFloatTimeDomainData(this.rightTimeData);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0, 255, 204, 0.7)';
        ctx.beginPath();
        const scopeCenterX = cssWidth / 2;
        const scopeCenterY = cssHeight * 0.75; // Center of bottom half
        const scopeScale = cssHeight / 5;   // Scale for vectorscope in bottom half
        const numPoints = Math.min(this.leftTimeData.length, this.rightTimeData.length);

        for (let i = 0; i < numPoints; i += 2) { // Draw fewer points for performance
            const l = this.leftTimeData[i];
            const r = this.rightTimeData[i];
            // Standard X-Y plot: X = (L-R)/sqrt(2), Y = (L+R)/sqrt(2) (rotated)
            // Or simpler: X = L, Y = R (unrotated)
            // Common vectorscope: X for sum (mono), Y for difference (stereo width)
            const plotX = scopeCenterX + (l - r) * scopeScale * 0.707; 
            const plotY = scopeCenterY - (l + r) * scopeScale * 0.707; // Y is inverted

            if (i === 0) ctx.moveTo(plotX, plotY);
            else ctx.lineTo(plotX, plotY);
        }
        ctx.stroke();
    }

    drawPhaseCorrelation() {
        if (!this.phaseCtx || this.phaseCtx.canvas.offsetWidth === 0) return;
        const ctx = this.phaseCtx;
        const { offsetWidth: cssWidth, offsetHeight: cssHeight } = ctx.canvas;

        ctx.fillStyle = 'rgba(10, 15, 15, 0.7)';
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        this.leftMeterAnalyser.getFloatTimeDomainData(this.leftTimeData);
        this.rightMeterAnalyser.getFloatTimeDomainData(this.rightTimeData);

        let sumLR = 0, sumL2 = 0, sumR2 = 0;
        const len = Math.min(this.leftTimeData.length, this.rightTimeData.length);
        if (len === 0) return;

        for (let i = 0; i < len; i++) {
            sumLR += this.leftTimeData[i] * this.rightTimeData[i];
            sumL2 += this.leftTimeData[i] * this.leftTimeData[i];
            sumR2 += this.rightTimeData[i] * this.rightTimeData[i];
        }
        const norm = Math.sqrt(sumL2 * sumR2);
        const correlation = norm === 0 ? 0 : Math.max(-1, Math.min(1, sumLR / norm));

        const barAreaWidth = cssWidth * 0.8;
        const barAreaX = cssWidth * 0.1;
        const barHeightVal = 20;
        const barY = cssHeight / 2 - barHeightVal / 2;

        ctx.fillStyle = 'rgba(94, 92, 92, 0.6)';
        ctx.fillRect(barAreaX, barY, barAreaWidth, barHeightVal);
        
        const meterZeroX = barAreaX + barAreaWidth / 2;
        const indicatorWidth = (correlation * barAreaWidth) / 2;
        ctx.fillStyle = correlation >= 0 ? 'var(--success)' : 'var(--error)';
        if (correlation >= 0) ctx.fillRect(meterZeroX, barY, indicatorWidth, barHeightVal);
        else ctx.fillRect(meterZeroX + indicatorWidth, barY, -indicatorWidth, barHeightVal);

        ctx.strokeStyle = 'var(--light)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(meterZeroX, barY - 5); ctx.lineTo(meterZeroX, barY + barHeightVal + 5); ctx.stroke();
        ctx.fillStyle = 'var(--light)'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
        ctx.fillText("-1", barAreaX, barY + barHeightVal + 15);
        ctx.fillText("0", meterZeroX, barY + barHeightVal + 15);
        ctx.fillText("+1", barAreaX + barAreaWidth, barY + barHeightVal + 15);
    }

    drawEQ() {
        if (!this.eqCtx || this.eqCtx.canvas.offsetWidth === 0 || this.eqNodes.length === 0) return;
        const ctx = this.eqCtx;
        const { offsetWidth: cssWidth, offsetHeight: cssHeight } = ctx.canvas;

        ctx.fillStyle = 'rgba(10, 15, 15, 0.7)';
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        const gainRange = 18; // Max gain display in dB
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 0.5;
        for (let i = -gainRange; i <= gainRange; i += 6) {
            const y = cssHeight / 2 - (i / gainRange) * (cssHeight / 2);
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cssWidth, y); ctx.stroke();
            if (i === 0) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cssWidth, y); ctx.stroke();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            }
        }
        // TODO: Add vertical log-scaled frequency lines

        ctx.beginPath(); ctx.strokeStyle = 'var(--accent)'; ctx.lineWidth = 2;
        const nyquist = this.audioContext.sampleRate / 2;
        const minFreq = 20;
        
        const frequencies = new Float32Array(cssWidth);
        const magResponse = new Float32Array(cssWidth);
        const phaseResponse = new Float32Array(cssWidth); // Not used here but required by getFrequencyResponse

        for(let i=0; i<cssWidth; i++){
            frequencies[i] = minFreq * Math.pow(nyquist/minFreq, i/(cssWidth-1));
        }
        
        // Calculate combined response
        // Start with a flat response (0 dB gain = magnitude 1)
        let overallMag = new Float32Array(cssWidth).fill(1);

        this.eqNodes.forEach(filterNode => {
            if(filterNode.gain.value !== 0) { // Only compute for active bands
                filterNode.getFrequencyResponse(frequencies, magResponse, phaseResponse);
                for(let i=0; i<cssWidth; i++){
                    overallMag[i] *= magResponse[i]; // Multiply magnitudes
                }
            }
        });

        for (let i = 0; i < cssWidth; i++) {
            const dbGain = 20 * Math.log10(overallMag[i] || 0.00001); // Convert magnitude to dB
            const gain = Math.max(-gainRange, Math.min(gainRange, dbGain));
            const x = i;
            const y = cssHeight / 2 - (gain / gainRange) * (cssHeight / 2);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    drawDynamics() {
        if (!this.dynamicsCtx || this.dynamicsCtx.canvas.offsetWidth === 0) return;
        const ctx = this.dynamicsCtx;
        const { offsetWidth: cssWidth, offsetHeight: cssHeight } = ctx.canvas;

        ctx.fillStyle = 'rgba(10, 15, 15, 0.7)';
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        const minDb = -60, maxDb = 0, dbRange = maxDb - minDb;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 0.5;
        for (let db = minDb; db <= maxDb; db += 10) {
            const y = cssHeight - ((db - minDb) / dbRange) * cssHeight;
            const xVal = cssWidth - ((db - minDb) / dbRange) * cssWidth; // For diagonal ref line
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cssWidth, y); ctx.stroke(); // Horizontal
            ctx.beginPath(); ctx.moveTo(xVal, 0); ctx.lineTo(xVal, cssHeight); ctx.stroke(); // Vertical
        }
        
        ctx.beginPath(); ctx.strokeStyle = 'var(--accent)'; ctx.lineWidth = 2;
        const T = this.dynamics.threshold.value;
        const R = this.dynamics.ratio.value;
        const W = this.dynamics.knee.value;

        for (let i = 0; i <= cssWidth; i++) {
            const inputDb = minDb + (i / cssWidth) * dbRange;
            let outputDb;
            if (2 * (inputDb - T) < -W) outputDb = inputDb;
            else if (2 * Math.abs(inputDb - T) <= W) outputDb = inputDb + ((1 / R - 1) * Math.pow(inputDb - T + W / 2, 2)) / (2 * W);
            else outputDb = T + (inputDb - T) / R;
            
            const plotX = i;
            const plotY = cssHeight - ((outputDb - minDb) / dbRange) * cssHeight;
            if (i === 0) ctx.moveTo(plotX, plotY); else ctx.lineTo(plotX, plotY);
        }
        ctx.stroke();

        // Gain Reduction Meter
        const reduction = this.dynamics.reduction.value; // Is negative or 0
        if (reduction < -0.1) { // Only show if there's some reduction
            const reductionHeight = (Math.abs(reduction) / dbRange) * cssHeight;
            ctx.fillStyle = 'var(--warning)';
            ctx.fillRect(cssWidth - 20, cssHeight - reductionHeight, 15, reductionHeight);
        }
    }

    updateMeters() {
        if (!this.leftMeter || !this.rightMeter || !this.masterMeter) return;

        let leftPeak = 0, rightPeak = 0, masterPeak = 0;

        if (this.isPlaying && this.source) {
            if (this.leftMeterAnalyser) {
                this.leftMeterAnalyser.getFloatTimeDomainData(this.leftTimeData);
                leftPeak = this.leftTimeData.reduce((max, val) => Math.max(max, Math.abs(val)), 0);
            }
            if (this.rightMeterAnalyser) {
                this.rightMeterAnalyser.getFloatTimeDomainData(this.rightTimeData);
                rightPeak = this.rightTimeData.reduce((max, val) => Math.max(max, Math.abs(val)), 0);
            }
            if (this.outputAnalyser) {
                this.outputAnalyser.getFloatTimeDomainData(this.outputTimeData);
                masterPeak = this.outputTimeData.reduce((max, val) => Math.max(max, Math.abs(val)), 0);
            }
        }
        
        this.leftMeter.style.height = `${Math.min(leftPeak * 100, 100)}%`;
        this.rightMeter.style.height = `${Math.min(rightPeak * 100, 100)}%`;
        this.masterMeter.style.height = `${Math.min(masterPeak * 100, 100)}%`;

        // Peak flash (CSS will handle animation of '.peak' class)
        [this.leftMeter, this.rightMeter, this.masterMeter].forEach((meter, i) => {
            const peakVal = [leftPeak, rightPeak, masterPeak][i];
            if (peakVal > 0.95 && !meter.classList.contains('peak-hold')) {
                meter.classList.add('peak');
                meter.classList.add('peak-hold'); // Prevent re-triggering immediately
                setTimeout(() => meter.classList.remove('peak'), 50); // Short visual flash
                setTimeout(() => meter.classList.remove('peak-hold'), 500); // Hold time
            }
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.isPlaying && this.audioContext.state === 'running') {
            const currentElapsed = this.pausedTime + (this.audioContext.currentTime - this.startTime);
            if (this.timeDisplay) this.timeDisplay.textContent = this.formatTime(currentElapsed);
            
            // Handle manual loop timing if source.loop is problematic with frequent start/stop
            if (this.source && this.source.buffer && this.loop && currentElapsed >= this.source.buffer.duration) {
                this.pausedTime = (currentElapsed % this.source.buffer.duration);
                this.source.stop(); // Stop current source
                
                // Create and start new source for loop segment
                const oldBuffer = this.source.buffer;
                this.source = this.audioContext.createBufferSource();
                this.source.buffer = oldBuffer;
                this.source.loop = this.loop; // This might be redundant if we handle looping manually
                this.connectNodes();
                this.startTime = this.audioContext.currentTime;
                this.source.start(0, this.pausedTime);
            }
        }

        if (this.spectrumCtx) this.drawSpectrum();
        if (this.waveformCtx) this.drawWaveformAndVectorscope();
        if (this.phaseCtx) this.drawPhaseCorrelation();
        if (this.eqCtx && this.effectsEnabled.eq) this.drawEQ();
        if (this.dynamicsCtx && this.effectsEnabled.dynamics) this.drawDynamics();
        
        this.updateMeters();
    }
}


// --- Global Scope Example ---
window.addEventListener('DOMContentLoaded', () => {
    const studio = new AudioStudio();

    // Example: Logic to show the visualization panel and then initialize canvases
    const vizPanelContainer = document.getElementById('sound-controls-vis');
    const metersPanelContainer = document.getElementById('sound-controls-meter');

    // Assume you have buttons to toggle these panels, or they are visible by default
    // For this example, let's assume they become visible via some UI interaction or are default.
    // You would replace this with your actual UI logic.

    // --- If panels are toggled by buttons (Example IDs: toggleVizBtn, toggleMetersBtn) ---
    const toggleVizBtn = document.getElementById('yourToggleVizButtonId'); // REPLACE with actual ID
    if (toggleVizBtn && vizPanelContainer) {
        toggleVizBtn.addEventListener('click', () => {
            const isHidden = vizPanelContainer.classList.contains('hidden') || getComputedStyle(vizPanelContainer).display === 'none';
            if (isHidden) {
                vizPanelContainer.style.display = 'flex'; // Or your default display style
                vizPanelContainer.classList.remove('hidden');
                // IMPORTANT: Initialize canvases AFTER the container is visible and rendered
                requestAnimationFrame(() => {
                    studio.initializeVisualizations();
                });
            } else {
                vizPanelContainer.style.display = 'none';
                vizPanelContainer.classList.add('hidden');
            }
        });
    } else if (vizPanelContainer && getComputedStyle(vizPanelContainer).display !== 'none') {
        // --- If viz panel is visible by default (no 'display:none' in HTML/CSS for it initially) ---
        console.log("Visualization panel is visible by default, initializing canvases.");
        requestAnimationFrame(() => { // Defer to ensure DOM is fully ready
            studio.initializeVisualizations();
        });
    } else {
         console.log("Visualization panel is initially hidden or its toggle button not found. Canvases will initialize when panel is shown.");
    }

    // Similar logic for meters if they also have complex init or are toggled
    if (metersPanelContainer && getComputedStyle(metersPanelContainer).display === 'none') {
        console.log("Meters panel is initially hidden.");
        // If you have a button to show meters, add event listener.
        // document.getElementById('yourToggleMetersButtonId').addEventListener('click', () => {
        //     metersPanelContainer.style.display = 'flex'; // Or your default
        // });
    }

});
