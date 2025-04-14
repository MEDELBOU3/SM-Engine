class AudioStudio {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.source = null;
        this.masterGain = this.audioContext.createGain();

        // Audio nodes
        this.inputGain = this.audioContext.createGain();
        this.stereoEnhancer = this.audioContext.createStereoPanner();
        this.multibandSplitter = [
            this.audioContext.createBiquadFilter(),
            this.audioContext.createBiquadFilter(),
            this.audioContext.createBiquadFilter()
        ];
        this.multibandGains = [
            this.audioContext.createGain(),
            this.audioContext.createGain(),
            this.audioContext.createGain()
        ];

        // Analysis nodes
        this.inputAnalyser = this.audioContext.createAnalyser();
        this.outputAnalyser = this.audioContext.createAnalyser();
        this.stereoAnalyser = this.audioContext.createAnalyser();
        this.splitter = this.audioContext.createChannelSplitter(2);

        // Effects chain
        this.eqNodes = [];
        this.dynamics = this.audioContext.createDynamicsCompressor();
        this.reverb = this.audioContext.createConvolver();
        this.reverbGain = this.audioContext.createGain();
        this.dryGain = this.audioContext.createGain();
        this.saturation = this.audioContext.createWaveShaper();

        // State
        this.isPlaying = false;
        this.startTime = 0;
        this.currentTime = 0;
        this.loop = false;
        this.effectsEnabled = { eq: true, dynamics: true, reverb: true, saturation: true };

        // Analysis setup
        this.inputAnalyser.fftSize = 4096;
        this.outputAnalyser.fftSize = 4096;
        this.stereoAnalyser.fftSize = 2048;
        this.freqData = new Uint8Array(this.inputAnalyser.frequencyBinCount);
        this.timeData = new Float32Array(this.inputAnalyser.frequencyBinCount);
        this.outputData = new Float32Array(this.outputAnalyser.frequencyBinCount);
        this.leftData = new Float32Array(this.stereoAnalyser.frequencyBinCount);
        this.rightData = new Float32Array(this.stereoAnalyser.frequencyBinCount);

        // Canvas contexts
        this.spectrumCtx = this.initCanvas('spectrumCanvas');
        this.waveformCtx = this.initCanvas('waveformCanvas');
        this.phaseCtx = this.initCanvas('phaseCanvas');
        this.eqCtx = this.initCanvas('eqCanvas');
        this.dynamicsCtx = this.initCanvas('dynamicsCanvas');

        this.initUI();
        this.setupEventListeners();
        this.setupEffects();
        this.generateImpulseResponse();
        this.createSaturationCurve();
        this.connectNodes();
        this.animate();
    }

    initCanvas(canvasId) {
        const canvas = document.getElementById(canvasId);
        console.log(`${canvasId} dimensions: ${canvas.offsetWidth}x${canvas.offsetHeight}`);
        canvas.width = canvas.offsetWidth * window.devicePixelRatio;
        canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        const ctx = canvas.getContext('2d');
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
    }

    setupEventListeners() {
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.stopBtn.addEventListener('click', () => this.stop());
        this.loopBtn.addEventListener('click', () => this.toggleLoop());
        document.getElementById('fileInput').addEventListener('change', (e) => this.loadAudio(e));
        document.getElementById('eqToggle').addEventListener('click', () => this.toggleEffect('eq'));
        document.getElementById('dynToggle').addEventListener('click', () => this.toggleEffect('dynamics'));
        document.getElementById('reverbToggle').addEventListener('click', () => this.toggleEffect('reverb'));

        // Dynamics controls
        const dynamicsControls = document.querySelector('.dynamics-controls');
        dynamicsControls.innerHTML = `
            <div class="slider-container">
                <div class="slider-label">
                    <span>Threshold</span>
                    <span>-24 dB</span>
                </div>
                <input type="range" id="threshold" min="-60" max="0" value="-24" step="0.1">
            </div>
            <div class="slider-container">
                <div class="slider-label">
                    <span>Ratio</span>
                    <span>4:1</span>
                </div>
                <input type="range" id="ratio" min="1" max="20" value="4" step="0.1">
            </div>
        `;
        document.getElementById('threshold').addEventListener('input', (e) => {
            this.dynamics.threshold.value = parseFloat(e.target.value);
            e.target.previousElementSibling.querySelector('span:last-child').textContent = `${e.target.value} dB`;
        });
        document.getElementById('ratio').addEventListener('input', (e) => {
            this.dynamics.ratio.value = parseFloat(e.target.value);
            e.target.previousElementSibling.querySelector('span:last-child').textContent = `${e.target.value}:1`;
        });

        // Reverb controls
        const reverbControls = document.querySelector('.reverb-controls');
        reverbControls.innerHTML = `
            <div class="slider-container">
                <div class="slider-label">
                    <span>Decay</span>
                    <span>2.0s</span>
                </div>
                <input type="range" id="decay" min="0.1" max="5" value="2" step="0.1">
            </div>
            <div class="slider-container">
                <div class="slider-label">
                    <span>Wet</span>
                    <span>0.3</span>
                </div>
                <input type="range" id="wet" min="0" max="1" value="0.3" step="0.01">
            </div>
        `;
        document.getElementById('decay').addEventListener('input', (e) => {
            this.generateImpulseResponse(parseFloat(e.target.value));
            e.target.previousElementSibling.querySelector('span:last-child').textContent = `${e.target.value}s`;
        });
        document.getElementById('wet').addEventListener('input', (e) => {
            this.reverbGain.gain.value = parseFloat(e.target.value);
            this.dryGain.gain.value = 1 - parseFloat(e.target.value);
            e.target.previousElementSibling.querySelector('span:last-child').textContent = e.target.value;
        });
    }

    setupEffects() {
        const eqFrequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        const eqContainer = document.querySelector('.eq-controls');

        eqFrequencies.forEach((freq, index) => {
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.Q.value = 1.8;
            filter.gain.value = 0;
            this.eqNodes.push(filter);

            const sliderDiv = document.createElement('div');
            sliderDiv.className = 'slider-container';
            sliderDiv.style.width = '90px';
            sliderDiv.innerHTML = `
                <div class="slider-label">
                    <span>${freq > 1000 ? freq/1000 + 'k' : freq}</span>
                    <span>0 dB</span>
                </div>
                <input type="range" min="-18" max="18" value="0" step="0.1">
            `;
            eqContainer.appendChild(sliderDiv);

            const slider = sliderDiv.querySelector('input');
            slider.addEventListener('input', (e) => {
                filter.gain.value = parseFloat(e.target.value);
                sliderDiv.querySelector('span:last-child').textContent = `${e.target.value} dB`;
            });
        });

        // Multiband setup
        this.multibandSplitter[0].type = 'lowpass';
        this.multibandSplitter[0].frequency.value = 200;
        this.multibandSplitter[1].type = 'bandpass';
        this.multibandSplitter[1].frequency.value = 1000;
        this.multibandSplitter[2].type = 'highpass';
        this.multibandSplitter[2].frequency.value = 4000;

        this.multibandGains[0].gain.value = 1;
        this.multibandGains[1].gain.value = 1;
        this.multibandGains[2].gain.value = 1;

        // Dynamics setup
        this.dynamics.threshold.value = -24;
        this.dynamics.knee.value = 20;
        this.dynamics.ratio.value = 4;
        this.dynamics.attack.value = 0.002;
        this.dynamics.release.value = 0.1;

        // Reverb setup
        this.reverbGain.gain.value = 0.3;
        this.dryGain.gain.value = 0.7;

        // Stereo enhancer
        this.stereoEnhancer.pan.value = 0.2;

        // Master gain
        this.masterGain.gain.value = 1.0;
    }

    createSaturationCurve() {
        const samples = 44100;
        const curve = new Float32Array(samples);
        const k = 2;

        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = (x * (Math.abs(x) + k)) / (x * x + k - 1 + 1);
        }
        this.saturation.curve = curve;
        this.saturation.oversample = '4x';
    }

    generateImpulseResponse(decay = 2) {
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * decay;
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            const decayFactor = Math.exp(-t * 4 / decay);
            left[i] = (Math.random() * 2 - 1) * decayFactor;
            right[i] = (Math.random() * 2 - 1) * decayFactor;
        }

        this.reverb.buffer = impulse;
    }

    connectNodes() {
        if (this.source) {
            this.source.disconnect();
            let lastNode = this.source;

            // Input chain
            lastNode.connect(this.inputGain);
            lastNode = this.inputGain;

            // Multiband processing
            lastNode.connect(this.multibandSplitter[0]);
            lastNode.connect(this.multibandSplitter[1]);
            lastNode.connect(this.multibandSplitter[2]);
            this.multibandSplitter[0].connect(this.multibandGains[0]);
            this.multibandSplitter[1].connect(this.multibandGains[1]);
            this.multibandSplitter[2].connect(this.multibandGains[2]);
            
            const multibandMix = this.audioContext.createGain();
            this.multibandGains[0].connect(multibandMix);
            this.multibandGains[1].connect(multibandMix);
            this.multibandGains[2].connect(multibandMix);
            lastNode = multibandMix;

            // Analysis
            lastNode.connect(this.inputAnalyser);
            lastNode.connect(this.splitter);

            // Effects chain
            if (this.effectsEnabled.eq) {
                this.eqNodes.forEach(node => {
                    lastNode.connect(node);
                    lastNode = node;
                });
            }

            if (this.effectsEnabled.dynamics) {
                lastNode.connect(this.dynamics);
                lastNode = this.dynamics;
            }

            if (this.effectsEnabled.saturation) {
                lastNode.connect(this.saturation);
                lastNode = this.saturation;
            }

            if (this.effectsEnabled.reverb) {
                lastNode.connect(this.dryGain);
                lastNode.connect(this.reverb);
                this.reverb.connect(this.reverbGain);
                const reverbMix = this.audioContext.createGain();
                this.dryGain.connect(reverbMix);
                this.reverbGain.connect(reverbMix);
                lastNode = reverbMix;
            }

            // Output chain
            lastNode.connect(this.stereoEnhancer);
            lastNode = this.stereoEnhancer;
            lastNode.connect(this.masterGain);
            lastNode = this.masterGain;
            lastNode.connect(this.outputAnalyser);
            lastNode.connect(this.audioContext.destination);

            // Stereo analysis
            this.splitter.connect(this.stereoAnalyser, 0);
            this.splitter.connect(this.stereoAnalyser, 1);
        }
    }

    async loadAudio(event) {
        const file = event.target.files[0];
        if (!file) return;

        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        if (this.source) {
            this.source.stop();
            this.source.disconnect();
        }

        this.source = this.audioContext.createBufferSource();
        this.source.buffer = audioBuffer;
        this.source.loop = this.loop;
        this.connectNodes();
        this.stop();
    }

    togglePlay() {
        if (!this.source) return;

        if (this.isPlaying) {
            this.audioContext.suspend();
            this.isPlaying = false;
            this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        } else {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            if (this.currentTime === 0) {
                this.source.start(0);
                this.startTime = this.audioContext.currentTime;
            }
            this.isPlaying = true;
            this.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        }
    }

    stop() {
        if (this.source && this.isPlaying) {
            this.audioContext.suspend();
            this.isPlaying = false;
            this.currentTime = 0;
            this.source.stop();
            this.source = this.audioContext.createBufferSource();
            this.source.buffer = this.source.buffer;
            this.source.loop = this.loop;
            this.connectNodes();
            this.playBtn.textContent = '';
        }
    }

    toggleLoop() {
        this.loop = !this.loop;
        if (this.source) this.source.loop = this.loop;
        this.loopBtn.classList.toggle('active');
    }

    toggleEffect(effect) {
        this.effectsEnabled[effect] = !this.effectsEnabled[effect];
        this.connectNodes();
        document.getElementById(`${effect}Toggle`).classList.toggle('active');
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
    }

    drawSpectrum() {
        const { width, height } = this.spectrumCtx.canvas;
        this.spectrumCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.spectrumCtx.fillRect(0, 0, width, height);

       
        if (width === 0 || height === 0) {
            console.log('Spectrum canvas has no size');
            return;
        }

        this.inputAnalyser.getByteFrequencyData(this.freqData);
        if (!this.freqData.some(val => val > 0)) {
            console.log('No frequency data');
        }
        const barWidth = width / 256;
        let x = 0;

        for (let i = 0; i < 256; i++) {
            const value = this.freqData[i];
            const percent = value / 255;
            const barHeight = percent * height;
            const hue = i / 256 * 240;
            this.spectrumCtx.fillStyle = `hsl(${hue}, 100%, ${50 + percent * 40}%)`;
            this.spectrumCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
            x += barWidth;
        }

        this.spectrumCtx.shadowBlur = 10;
        this.spectrumCtx.shadowColor = 'var(--glow)';
    }

    drawWaveformAndVectorscope() {
        const { width, height } = this.waveformCtx.canvas;
        this.waveformCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.waveformCtx.fillRect(0, 0, width, height);

        this.inputAnalyser.getFloatTimeDomainData(this.timeData);
        this.waveformCtx.beginPath();
        this.waveformCtx.strokeStyle = 'var(--accent)';
        this.waveformCtx.lineWidth = 2;
        this.waveformCtx.shadowBlur = 8;
        this.waveformCtx.shadowColor = 'var(--glow)';

        const sliceWidth = width / this.timeData.length;
        let x = 0;

        for (let i = 0; i < this.timeData.length; i++) {
            const v = this.timeData[i];
            const y = (v + 1) * (height / 4) + height / 4;
            if (i === 0) this.waveformCtx.moveTo(x, y);
            else this.waveformCtx.lineTo(x, y);
            x += sliceWidth;
        }
        this.waveformCtx.stroke();

        this.stereoAnalyser.getFloatTimeDomainData(this.leftData);
        this.stereoAnalyser.getFloatTimeDomainData(this.rightData);

        this.waveformCtx.beginPath();
        this.waveformCtx.strokeStyle = 'rgba(0, 255, 204, 0.4)';
        this.waveformCtx.lineWidth = 1;
        this.waveformCtx.shadowBlur = 5;

        const centerX = width / 2;
        const centerY = height * 0.75;
        const scale = height / 3;

        for (let i = 0; i < this.leftData.length; i += 2) {
            const left = this.leftData[i];
            const right = this.rightData[i];
            const x = centerX + (left * scale);
            const y = centerY - (right * scale);
            if (i === 0) this.waveformCtx.moveTo(x, y);
            else this.waveformCtx.lineTo(x, y);
        }
        this.waveformCtx.stroke();
        this.waveformCtx.shadowBlur = 0;
    }

    drawPhaseCorrelation() {
        const { width, height } = this.phaseCtx.canvas;
        this.phaseCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.phaseCtx.fillRect(0, 0, width, height);

        this.stereoAnalyser.getFloatTimeDomainData(this.leftData);
        this.stereoAnalyser.getFloatTimeDomainData(this.rightData);

        let sum = 0;
        for (let i = 0; i < this.leftData.length; i++) {
            sum += this.leftData[i] * this.rightData[i];
        }
        const correlation = Math.max(-1, Math.min(1, sum / this.leftData.length));

        this.phaseCtx.fillStyle = 'rgba(31, 37, 37, 0.8)';
        this.phaseCtx.fillRect(width * 0.1, height / 2 - 15, width * 0.8, 30);

        this.phaseCtx.fillStyle = correlation > 0 ? 'var(--success)' : 'var(--warning)';
        this.phaseCtx.shadowBlur = 8;
        this.phaseCtx.shadowColor = correlation > 0 ? 'var(--success)' : 'var(--warning)';
        const barWidth = width * 0.8;
        const x = width * 0.1 + (correlation < 0 ? barWidth / 2 * (1 + correlation) : barWidth / 2);
        const barLength = correlation < 0 ? -barWidth / 2 * correlation : barWidth / 2 * correlation;
        this.phaseCtx.fillRect(x, height / 2 - 10, barLength, 20);

        this.phaseCtx.strokeStyle = 'var(--light)';
        this.phaseCtx.lineWidth = 1;
        this.phaseCtx.beginPath();
        this.phaseCtx.moveTo(width * 0.1, height / 2 - 15);
        this.phaseCtx.lineTo(width * 0.9, height / 2 - 15);
        this.phaseCtx.moveTo(width * 0.1, height / 2 + 15);
        this.phaseCtx.lineTo(width * 0.9, height / 2 + 15);
        this.phaseCtx.stroke();

        this.phaseCtx.fillStyle = 'var(--light)';
        this.phaseCtx.font = '14px monospace';
        this.phaseCtx.fillText('-1', width * 0.05, height / 2 + 5);
        this.phaseCtx.fillText('0', width / 2 - 5, height / 2 + 5);
        this.phaseCtx.fillText('+1', width * 0.9 + 5, height / 2 + 5);
        this.phaseCtx.shadowBlur = 0;
    }

    drawEQ() {
        const { width, height } = this.eqCtx.canvas;
        this.eqCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.eqCtx.fillRect(0, 0, width, height);

        this.eqCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        this.eqCtx.lineWidth = 1;
        for (let i = -18; i <= 18; i += 6) {
            const y = height / 2 - (i / 18) * (height / 2);
            this.eqCtx.beginPath();
            this.eqCtx.moveTo(0, y);
            this.eqCtx.lineTo(width, y);
            this.eqCtx.stroke();
        }

        this.eqCtx.beginPath();
        this.eqCtx.strokeStyle = 'var(--accent)';
        this.eqCtx.lineWidth = 3;
        this.eqCtx.shadowBlur = 10;
        this.eqCtx.shadowColor = 'var(--glow)';

        const freqMax = this.audioContext.sampleRate / 2;
        const points = 300;

        for (let i = 0; i <= points; i++) {
            const freq = Math.pow(freqMax / 20, i / points) * 20;
            let gain = 0;

            this.eqNodes.forEach(node => {
                const f = node.frequency.value;
                const g = node.gain.value;
                const q = node.Q.value;
                const bandwidth = Math.log(2) / 2 / q;
                const response = g * Math.exp(-Math.pow(Math.log(freq / f) / bandwidth, 2));
                gain += response;
            });

            const x = (Math.log2(freq / 20) / Math.log2(freqMax / 20)) * width;
            const y = height / 2 - (gain / 18) * (height / 2);
            if (i === 0) this.eqCtx.moveTo(x, y);
            else this.eqCtx.lineTo(x, y);
        }
        this.eqCtx.stroke();
        this.eqCtx.shadowBlur = 0;
    }

    drawDynamics() {
        const { width, height } = this.dynamicsCtx.canvas;
        this.dynamicsCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.dynamicsCtx.fillRect(0, 0, width, height);

        this.dynamicsCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        this.dynamicsCtx.lineWidth = 1;
        for (let i = 0; i <= 60; i += 10) {
            const y = height - (i / 60) * height;
            this.dynamicsCtx.beginPath();
            this.dynamicsCtx.moveTo(0, y);
            this.dynamicsCtx.lineTo(width, y);
            this.dynamicsCtx.stroke();
        }

        this.dynamicsCtx.beginPath();
        this.dynamicsCtx.strokeStyle = 'var(--accent)';
        this.dynamicsCtx.lineWidth = 3;
        this.dynamicsCtx.shadowBlur = 10;
        this.dynamicsCtx.shadowColor = 'var(--glow)';

        const threshold = this.dynamics.threshold.value;
        const ratio = this.dynamics.ratio.value;
        const knee = this.dynamics.knee.value;

        for (let x = 0; x < width; x++) {
            const input = ((x / width) * 60) - 60;
            let output = input;

            if (input > threshold) {
                output = threshold + ((input - threshold) / ratio);
            } else if (input > (threshold - knee)) {
                const over = input - (threshold - knee);
                output = input + ((1/ratio - 1) * over * over) / (2 * knee);
            }

            const y = height - (((output + 60) / 60) * height);
            if (x === 0) this.dynamicsCtx.moveTo(x, y);
            else this.dynamicsCtx.lineTo(x, y);
        }
        this.dynamicsCtx.stroke();

        const reduction = Math.abs(this.dynamics.reduction.value);
        this.dynamicsCtx.fillStyle = 'var(--warning)';
        this.dynamicsCtx.shadowBlur = 8;
        this.dynamicsCtx.shadowColor = 'var(--warning)';
        this.dynamicsCtx.fillRect(width - 30, height - (reduction / 60 * height), 20, reduction / 60 * height);
        this.dynamicsCtx.shadowBlur = 0;
    }

    updateMeters() {
        this.stereoAnalyser.getFloatTimeDomainData(this.leftData);
        this.stereoAnalyser.getFloatTimeDomainData(this.rightData);
        this.outputAnalyser.getFloatTimeDomainData(this.outputData);

        const leftPeak = Math.max(...this.leftData);
        const rightPeak = Math.max(...this.rightData);
        const masterPeak = Math.max(...this.outputData);

        this.leftMeter.style.height = `${Math.min(leftPeak * 100, 100)}%`;
        this.rightMeter.style.height = `${Math.min(rightPeak * 100, 100)}%`;
        this.masterMeter.style.height = `${Math.min(masterPeak * 100, 100)}%`;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        console.log('Animating - Playing:', this.isPlaying, 'Source exists:', !!this.source);

        if (this.isPlaying) {
            this.currentTime = this.audioContext.currentTime - this.startTime;
            this.timeDisplay.textContent = this.formatTime(this.currentTime);
        }

        this.drawSpectrum();
        this.drawWaveformAndVectorscope();
        this.drawPhaseCorrelation();
        this.drawEQ();
        this.drawDynamics();
        this.updateMeters();
    }
}

window.addEventListener('load', () => {
    const studio = new AudioStudio();
});
