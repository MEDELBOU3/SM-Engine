class AdvancedColorPicker {
    constructor() {
        this.isOpen = false;
        this.targetInput = null;
        this.color = { h: 0, s: 0, v: 1, a: 1 };
        this.lastColor = { h: 0, s: 0, v: 1, a: 1 };
        this.swatches = JSON.parse(localStorage.getItem('acp_swatches')) || ['#FF0000', '#00FF00', '#0000FF', '#FFFFFF', '#000000'];
        this.harmonyMode = 'complementary';

        this.initUI();
        this.attachGlobalListeners();
    }

    // --- COLOR MATH & CONVERSIONS ---
    static hsvToRgb(h, s, v) {
        let r, g, b, i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v, g = t, b = p; break; case 1: r = q, g = v, b = p; break; case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break; case 4: r = t, g = p, b = v; break; case 5: r = v, g = p, b = q; break;
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }

    static rgbToHsv(r, g, b) {
        r /= 255, g /= 255, b /= 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s, v = max, d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max !== min) {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h, s, v };
    }

    static rgbaToHex(r, g, b, a = 1) {
        const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}${a < 1 ? toHex(a * 255) : ''}`.toUpperCase();
    }

    static hexToRgba(hex) {
        let r = 0, g = 0, b = 0, a = 1;
        hex = hex.replace('#', '');
        if (hex.length === 3) { r = parseInt(hex[0]+hex[0], 16); g = parseInt(hex[1]+hex[1], 16); b = parseInt(hex[2]+hex[2], 16); }
        else if (hex.length === 6) { r = parseInt(hex.substring(0,2), 16); g = parseInt(hex.substring(2,4), 16); b = parseInt(hex.substring(4,6), 16); }
        else if (hex.length === 8) { r = parseInt(hex.substring(0,2), 16); g = parseInt(hex.substring(2,4), 16); b = parseInt(hex.substring(4,6), 16); a = parseInt(hex.substring(6,8), 16) / 255; }
        return { r, g, b, a };
    }

    initUI() {
        this.container = document.createElement('div');
        this.container.className = 'advanced-color-picker-modal';
        this.container.style.display = 'none';

        this.container.innerHTML = `
            <div class="acp-header">
                <span class="acp-title">Color Picker</span>
                <i class="fas fa-times acp-close" title="Close"></i>
            </div>
            
            <div class="acp-body">
                <!-- COL 1: WHEEL -->
                <div class="acp-col-wheel">
                    <div class="acp-wheel-container">
                        <canvas class="acp-wheel-canvas" width="200" height="200"></canvas>
                        <div class="acp-wheel-cursor"></div>
                    </div>
                    <div class="acp-v-slider" id="acp-val-slider" title="Value (Lightness)">
                        <div class="acp-v-fill" id="acp-val-fill"></div>
                        <div class="acp-cursor-hline" id="acp-val-cursor"></div>
                    </div>
                    <div class="acp-v-slider" id="acp-alpha-slider" title="Alpha (Opacity)">
                        <div class="acp-v-fill" id="acp-alpha-fill"></div>
                        <div class="acp-cursor-hline" id="acp-alpha-cursor"></div>
                    </div>
                </div>

                <!-- COL 2: CENTER CONTROLS -->
                <div class="acp-col-center">
                    <div class="acp-preview-box">
                        <div class="acp-preview-half acp-preview-old" id="acp-prev-old" title="Revert to original color"></div>
                        <div class="acp-preview-half acp-preview-new" id="acp-prev-new" title="Current color"></div>
                    </div>
                    
                    <div class="acp-hex-row">
                        <button class="acp-eye-dropper" title="Pick color from screen"><i class="fas fa-eye-dropper"></i></button>
                        <input type="text" class="acp-hex-input" id="acp-hex-input" value="#FFFFFF">
                    </div>
                    
                    <span class="acp-section-title">SWATCHES</span>
                    <div class="acp-swatch-grid" id="acp-swatch-grid"></div>

                    <span class="acp-section-title">HARMONY</span>
                    <select class="acp-dropdown" id="acp-harmony-mode">
                        <option value="complementary">Complementary</option>
                        <option value="analogous">Analogous</option>
                        <option value="triadic">Triadic</option>
                        <option value="split">Split Complementary</option>
                        <option value="tetradic">Tetradic</option>
                    </select>
                    <div class="acp-swatch-grid" id="acp-harmony-grid"></div>
                </div>

                <!-- COL 3: SLIDERS & BUTTONS -->
                <div class="acp-col-sliders">
                    <div class="acp-sliders-group">
                        ${['h', 's', 'v'].map(t => this.createInputRow(t)).join('')}
                        <div class="acp-separator"></div>
                        ${['r', 'g', 'b', 'a'].map(t => this.createInputRow(t)).join('')}
                    </div>

                    <div class="acp-footer-actions">
                        <button class="acp-btn acp-btn-cancel">Cancel</button>
                        <button class="acp-btn acp-btn-ok">OK</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(this.container);
        this.cacheElements();
        this.setupInteractions();
        this.renderSwatches();
    }

    createInputRow(type) {
        return `
            <div class="acp-input-row" data-type="${type}">
                <span class="acp-label">${type.toUpperCase()}</span>
                <div class="acp-slider-container acp-slider-${type}">
                    <div class="acp-slider-bg" id="acp-bg-${type}"></div>
                    <div class="acp-slider-handle" id="acp-handle-${type}"></div>
                </div>
                <input type="number" class="acp-number-input" id="acp-input-${type}">
            </div>
        `;
    }

    cacheElements() {
        this.wheelCanvas = this.container.querySelector('.acp-wheel-canvas');
        this.wheelCursor = this.container.querySelector('.acp-wheel-cursor');
        
        this.sliders = {
            v: this.container.querySelector('#acp-val-slider'),
            a: this.container.querySelector('#acp-alpha-slider')
        };
        
        this.previews = {
            old: this.container.querySelector('#acp-prev-old'),
            new: this.container.querySelector('#acp-prev-new')
        };

        this.inputs = {};
        this.bgs = {};
        this.handles = {};
        ['r', 'g', 'b', 'a', 'h', 's', 'v'].forEach(t => {
            this.inputs[t] = this.container.querySelector(`#acp-input-${t}`);
            this.bgs[t] = this.container.querySelector(`#acp-bg-${t}`);
            this.handles[t] = this.container.querySelector(`#acp-handle-${t}`);
        });

        this.hexInput = this.container.querySelector('#acp-hex-input');
        this.harmonySelect = this.container.querySelector('#acp-harmony-mode');
        this.harmonyGrid = this.container.querySelector('#acp-harmony-grid');
        this.swatchGrid = this.container.querySelector('#acp-swatch-grid');
        
        this.drawWheel();
    }

    drawWheel() {
        const ctx = this.wheelCanvas.getContext('2d');
        const w = 200, h = 200, cx = 100, cy = 100, r = 100;
        const imgData = ctx.createImageData(w, h);
        const data = imgData.data;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const dx = x - cx, dy = y - cy, dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= r) {
                    const angle = Math.atan2(dy, dx);
                    const hue = (angle + Math.PI) / (2 * Math.PI), sat = dist / r;
                    const rgb = AdvancedColorPicker.hsvToRgb(hue, sat, 1);
                    const i = (y * w + x) * 4;
                    data[i] = rgb.r; data[i + 1] = rgb.g; data[i + 2] = rgb.b; data[i + 3] = 255;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    setupInteractions() {
        // Buttons
        this.container.querySelector('.acp-close').onclick = () => this.close();
        this.container.querySelector('.acp-btn-cancel').onclick = () => {
            if(this.targetInput) { this.targetInput.value = AdvancedColorPicker.rgbaToHex(this.lastColor.r, this.lastColor.g, this.lastColor.b, 1).substring(0, 7); }
            this.close();
        };
        this.container.querySelector('.acp-btn-ok').onclick = () => { this.applyColor(); this.close(); };
        this.previews.old.onclick = () => { this.color = {...this.lastColor}; this.updateUI(); };

        // Eye Dropper
        const btnEye = this.container.querySelector('.acp-eye-dropper');
        if (!window.EyeDropper) { btnEye.style.display = 'none'; }
        else {
            btnEye.onclick = async () => {
                try {
                    const eyeDropper = new EyeDropper();
                    const result = await eyeDropper.open();
                    const rgba = AdvancedColorPicker.hexToRgba(result.sRGBHex);
                    this.color = { ...AdvancedColorPicker.rgbToHsv(rgba.r, rgba.g, rgba.b), a: 1 };
                    this.updateUI();
                } catch (e) {} 
            };
        }

        // Wheel Drag
        this.attachDrag(this.wheelCanvas, (e) => {
            const rect = this.wheelCanvas.getBoundingClientRect(), r = rect.width / 2;
            const dx = e.clientX - rect.left - r, dy = e.clientY - rect.top - r;
            const dist = Math.min(Math.sqrt(dx * dx + dy * dy), r);
            this.color.h = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
            this.color.s = dist / r;
            this.updateUI();
        });

        // Vertical Sliders
        this.attachDrag(this.sliders.v, (e) => {
            const rect = this.sliders.v.getBoundingClientRect();
            this.color.v = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            this.updateUI();
        });
        
        this.attachDrag(this.sliders.a, (e) => {
            const rect = this.sliders.a.getBoundingClientRect();
            this.color.a = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            this.updateUI();
        });

        // Horizontal Sliders
        ['r', 'g', 'b', 'a', 'h', 's', 'v'].forEach(type => {
            const row = this.container.querySelector(`.acp-input-row[data-type="${type}"]`);
            const slider = row.querySelector('.acp-slider-container');
            
            this.attachDrag(slider, (e) => {
                const rect = slider.getBoundingClientRect();
                this.updateFromInput(type, (e.clientX - rect.left) / rect.width, true);
            });

            this.inputs[type].onchange = () => {
                let max = type === 'h' ? 360 : (['s', 'v', 'a'].includes(type) ? 100 : 255);
                this.updateFromInput(type, parseFloat(this.inputs[type].value) / max, false);
            };
        });

        this.hexInput.onchange = () => {
            const rgba = AdvancedColorPicker.hexToRgba(this.hexInput.value);
            this.color = { ...AdvancedColorPicker.rgbToHsv(rgba.r, rgba.g, rgba.b), a: rgba.a };
            this.updateUI();
        };

        this.harmonySelect.onchange = () => {
            this.harmonyMode = this.harmonySelect.value;
            this.updateUI();
        };
    }

    attachDrag(el, callback) {
        let isDrag = false;
        const down = (e) => { isDrag = true; callback(e); };
        const move = (e) => { if (isDrag) { callback(e); e.preventDefault(); } };
        const up = () => { isDrag = false; };
        el.addEventListener('mousedown', down);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    }

    updateFromInput(type, normalizedVal, fromSlider) {
        normalizedVal = Math.max(0, Math.min(1, normalizedVal));
        if (['h', 's', 'v', 'a'].includes(type)) {
            this.color[type] = normalizedVal;
        } else {
            const rgb = AdvancedColorPicker.hsvToRgb(this.color.h, this.color.s, this.color.v);
            rgb[type] = normalizedVal * 255;
            const hsv = AdvancedColorPicker.rgbToHsv(rgb.r, rgb.g, rgb.b);
            this.color = { ...this.color, ...hsv };
        }
        this.updateUI(fromSlider ? null : type);
    }

    updateUI(skipInputType = null) {
        const rgb = AdvancedColorPicker.hsvToRgb(this.color.h, this.color.s, this.color.v);
        const hex = AdvancedColorPicker.rgbaToHex(rgb.r, rgb.g, rgb.b, this.color.a);
        const pureRGB = AdvancedColorPicker.hsvToRgb(this.color.h, this.color.s, 1);
        
        // 1. Update Wheel Cursor
        const r2 = 100, angle = this.color.h * 2 * Math.PI - Math.PI;
        this.wheelCursor.style.left = (r2 + Math.cos(angle) * this.color.s * r2) + 'px';
        this.wheelCursor.style.top = (r2 + Math.sin(angle) * this.color.s * r2) + 'px';

        // 2. Update Vertical Sliders
        this.container.querySelector('#acp-val-cursor').style.top = (1 - this.color.v) * 100 + '%';
        this.container.querySelector('#acp-alpha-cursor').style.top = (1 - this.color.a) * 100 + '%';
        this.container.querySelector('#acp-val-fill').style.background = `linear-gradient(to bottom, rgb(${pureRGB.r}, ${pureRGB.g}, ${pureRGB.b}), #000)`;
        this.container.querySelector('#acp-alpha-fill').style.background = `linear-gradient(to bottom, rgb(${rgb.r}, ${rgb.g}, ${rgb.b}), transparent)`;

        // 3. Update Previews & Hex
        this.previews.new.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${this.color.a})`;
        if(skipInputType !== 'hex') this.hexInput.value = hex;

        // 4. Update Dynamic Background Gradients
        const c = (r, g, b) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
        this.bgs.r.style.background = `linear-gradient(to right, ${c(0, rgb.g, rgb.b)}, ${c(255, rgb.g, rgb.b)})`;
        this.bgs.g.style.background = `linear-gradient(to right, ${c(rgb.r, 0, rgb.b)}, ${c(rgb.r, 255, rgb.b)})`;
        this.bgs.b.style.background = `linear-gradient(to right, ${c(rgb.r, rgb.g, 0)}, ${c(rgb.r, rgb.g, 255)})`;
        this.bgs.a.style.background = `linear-gradient(to right, rgba(${rgb.r},${rgb.g},${rgb.b},0), rgba(${rgb.r},${rgb.g},${rgb.b},1))`;
        
        this.bgs.h.style.background = `linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)`;
        this.bgs.s.style.background = `linear-gradient(to right, ${c(...Object.values(AdvancedColorPicker.hsvToRgb(this.color.h, 0, this.color.v)))}, ${c(...Object.values(AdvancedColorPicker.hsvToRgb(this.color.h, 1, this.color.v)))})`;
        this.bgs.v.style.background = `linear-gradient(to right, #000, ${c(...Object.values(AdvancedColorPicker.hsvToRgb(this.color.h, this.color.s, 1)))})`;

        // 5. Update Numbers & Handles
        const vals = { r: rgb.r/255, g: rgb.g/255, b: rgb.b/255, a: this.color.a, h: this.color.h, s: this.color.s, v: this.color.v };
        const disp = { r: rgb.r, g: rgb.g, b: rgb.b, a: Math.round(this.color.a*100), h: Math.round(this.color.h*360), s: Math.round(this.color.s*100), v: Math.round(this.color.v*100) };
        
        Object.keys(this.inputs).forEach(t => {
            this.handles[t].style.left = (vals[t] * 100) + '%';
            if (skipInputType !== t) this.inputs[t].value = disp[t];
        });

        // 6. Output to target (Live Update)
        if (this.targetInput && this.isOpen) {
            this.targetInput.value = hex.substring(0, 7); // Standard HTML inputs only take 6-digit hex without alpha
            this.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        this.generateHarmonies();
    }

    generateHarmonies() {
        const h = this.color.h, s = this.color.s, v = this.color.v;
        let rules = [];
        
        switch(this.harmonyMode) {
            case 'complementary': rules = [(h + 0.5) % 1]; break;
            case 'analogous': rules = [(h + 0.08) % 1, (h - 0.08 + 1) % 1]; break;
            case 'triadic': rules = [(h + 0.333) % 1, (h + 0.666) % 1]; break;
            case 'split': rules = [(h + 0.416) % 1, (h + 0.583) % 1]; break;
            case 'tetradic': rules = [(h + 0.25) % 1, (h + 0.5) % 1, (h + 0.75) % 1]; break;
        }

        this.harmonyGrid.innerHTML = '';
        rules.forEach(hue => {
            const rgb = AdvancedColorPicker.hsvToRgb(hue, s, v);
            const hex = AdvancedColorPicker.rgbaToHex(rgb.r, rgb.g, rgb.b, 1);
            const swatch = document.createElement('div');
            swatch.className = 'acp-swatch';
            swatch.innerHTML = `<div class="acp-swatch-color" style="background-color: ${hex}"></div>`;
            swatch.onclick = () => { this.color.h = hue; this.updateUI(); };
            swatch.title = "Click to select";
            this.harmonyGrid.appendChild(swatch);
        });
    }

    renderSwatches() {
        this.swatchGrid.innerHTML = '';
        this.swatches.slice(0, 9).forEach((hex, index) => {
            const swatch = document.createElement('div');
            swatch.className = 'acp-swatch';
            swatch.innerHTML = `<div class="acp-swatch-color" style="background-color: ${hex}"></div>`;
            swatch.title = "Left Click to Apply\nRight Click to Remove";
            swatch.onclick = () => {
                const rgba = AdvancedColorPicker.hexToRgba(hex);
                this.color = { ...AdvancedColorPicker.rgbToHsv(rgba.r, rgba.g, rgba.b), a: rgba.a };
                this.updateUI();
            };
            swatch.oncontextmenu = (e) => {
                e.preventDefault();
                this.swatches.splice(index, 1);
                localStorage.setItem('acp_swatches', JSON.stringify(this.swatches));
                this.renderSwatches();
            };
            this.swatchGrid.appendChild(swatch);
        });

        // Add Button
        if (this.swatches.length < 10) {
            const addBtn = document.createElement('div');
            addBtn.className = 'acp-swatch acp-swatch-add';
            addBtn.innerHTML = '<i class="fas fa-plus"></i>';
            addBtn.title = "Save current color";
            addBtn.onclick = () => {
                const rgb = AdvancedColorPicker.hsvToRgb(this.color.h, this.color.s, this.color.v);
                const hex = AdvancedColorPicker.rgbaToHex(rgb.r, rgb.g, rgb.b, this.color.a);
                if (!this.swatches.includes(hex)) {
                    this.swatches.push(hex);
                    localStorage.setItem('acp_swatches', JSON.stringify(this.swatches));
                    this.renderSwatches();
                }
            };
            this.swatchGrid.appendChild(addBtn);
        }
    }

    open(el, x, y) {
        this.targetInput = el;
        const rgba = AdvancedColorPicker.hexToRgba(el.value || "#FF8C00");
        this.color = { ...AdvancedColorPicker.rgbToHsv(rgba.r, rgba.g, rgba.b), a: rgba.a };
        this.lastColor = { ...this.color, r: rgba.r, g: rgba.g, b: rgba.b }; 
        
        this.previews.old.style.backgroundColor = AdvancedColorPicker.rgbaToHex(rgba.r, rgba.g, rgba.b, rgba.a);
        this.updateUI();
        
        // Smart Positioning
        let l = x + 15, t = y + 15;
        if (l + 620 > window.innerWidth) l = x - 640;
        if (t + 300 > window.innerHeight) t = window.innerHeight - 300;
        
        this.container.style.left = Math.max(10, l) + 'px';
        this.container.style.top = Math.max(10, t) + 'px';
        this.container.style.display = 'flex';
        this.isOpen = true;
    }

    close() { this.container.style.display = 'none'; this.isOpen = false; }

    applyColor() {
        if (!this.targetInput) return;
        const rgb = AdvancedColorPicker.hsvToRgb(this.color.h, this.color.s, this.color.v);
        this.targetInput.value = AdvancedColorPicker.rgbaToHex(rgb.r, rgb.g, rgb.b, 1).substring(0, 7);
        this.targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    attachGlobalListeners() {
        // Open on input click
        document.addEventListener('click', (e) => {
            const target = e.target.closest('input[type="color"]');
            if (target) {
                e.preventDefault();
                if(!this.isOpen) this.open(target, e.clientX, e.clientY);
            } else if (this.isOpen && !this.container.contains(e.target)) {
                // Click outside closes and applies
                this.applyColor();
                this.close();
            }
        }, true);
        
        // Drag header to move panel
        const header = this.container.querySelector('.acp-header');
        let isDraggingPanel = false, offsetX, offsetY;
        
        header.addEventListener('mousedown', (e) => {
            if(e.target.classList.contains('acp-close')) return;
            isDraggingPanel = true;
            offsetX = e.clientX - this.container.getBoundingClientRect().left;
            offsetY = e.clientY - this.container.getBoundingClientRect().top;
        });
        
        window.addEventListener('mousemove', (e) => {
            if(!isDraggingPanel) return;
            this.container.style.left = `${e.clientX - offsetX}px`;
            this.container.style.top = `${e.clientY - offsetY}px`;
        });
        window.addEventListener('mouseup', () => isDraggingPanel = false);
    }
}

// Auto-initialize
window.addEventListener('DOMContentLoaded', () => { window.advancedColorPicker = new AdvancedColorPicker(); });
