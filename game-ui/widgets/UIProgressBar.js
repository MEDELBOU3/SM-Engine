/**
 * GAME-UI/widgets/UIProgressBar.js
 */
(function () {
    'use strict';

    class UIProgressBar extends window.UIWidget {
        constructor(options = {}) {
            super({
                type: 'progressBar',
                name: 'Progress Bar',
                width: 260,
                height: 18,
                ...options
            });

            this.min = Number(options.min ?? 0);
            this.max = Number(options.max ?? 100);
            this.value = Number(options.value ?? 100);

            this.background = options.background ?? 'rgba(0,0,0,0.5)';
            this.fillColor = options.fillColor ?? '#ffffff';
            this.borderColor = options.borderColor ?? 'transparent';
            this.borderWidth = Number(options.borderWidth ?? 0);
            this.borderRadius = Number(options.borderRadius ?? 0);

            this.direction = options.direction ?? 'left-to-right';
            this.showText = options.showText ?? false;
            this.textFormat = options.textFormat ?? '{value}';
            this.textColor = options.textColor ?? '#ffffff';
            this.fontSize = Number(options.fontSize ?? 12);
        }

        setValue(value) {
            this.value = Number(value) || 0;
            this.markDirty();
            return this;
        }

        getNormalizedValue() {
            const range = this.max - this.min;
            if (range === 0) return 0;
            return Math.max(0, Math.min(1, (this.value - this.min) / range));
        }

        createElement() {
            const element = document.createElement('div');
            element.className = 'game-ui-widget game-ui-progress';

            const fill = document.createElement('div');
            fill.className = 'game-ui-progress-fill';

            const label = document.createElement('span');
            label.className = 'game-ui-progress-label';

            element.appendChild(fill);
            element.appendChild(label);

            return element;
        }

        applyElementState(element = this._element) {
            super.applyElementState(element);
            if (!element) return null;

            const normalized = this.getNormalizedValue();
            const percent = normalized * 100;
            const fill = element.querySelector('.game-ui-progress-fill');
            const label = element.querySelector('.game-ui-progress-label');

            element.style.background = this.background;
            element.style.border = `${this.borderWidth}px solid ${this.borderColor}`;
            element.style.borderRadius = `${this.borderRadius}px`;
            element.style.overflow = 'hidden';

            if (fill) {
                fill.style.position = 'absolute';
                fill.style.background = this.fillColor;

                if (this.direction === 'right-to-left') {
                    fill.style.right = '0';
                    fill.style.left = 'auto';
                    fill.style.top = '0';
                    fill.style.width = `${percent}%`;
                    fill.style.height = '100%';
                } else if (this.direction === 'bottom-to-top') {
                    fill.style.left = '0';
                    fill.style.bottom = '0';
                    fill.style.width = '100%';
                    fill.style.height = `${percent}%`;
                } else if (this.direction === 'top-to-bottom') {
                    fill.style.left = '0';
                    fill.style.top = '0';
                    fill.style.width = '100%';
                    fill.style.height = `${percent}%`;
                } else {
                    fill.style.left = '0';
                    fill.style.top = '0';
                    fill.style.width = `${percent}%`;
                    fill.style.height = '100%';
                }
            }

            if (label) {
                label.style.position = 'absolute';
                label.style.inset = '0';
                label.style.display = this.showText ? 'flex' : 'none';
                label.style.alignItems = 'center';
                label.style.justifyContent = 'center';
                label.style.pointerEvents = 'none';
                label.style.fontSize = `${this.fontSize}px`;
                label.style.color = this.textColor;
                label.textContent = this.textFormat
                    .replaceAll('{value}', String(Math.round(this.value)))
                    .replaceAll('{max}', String(Math.round(this.max)))
                    .replaceAll('{percent}', String(Math.round(percent)));
            }

            return element;
        }

        serialize() {
            return {
                ...super.serialize(),
                min: this.min,
                max: this.max,
                value: this.value,
                background: this.background,
                fillColor: this.fillColor,
                borderColor: this.borderColor,
                borderWidth: this.borderWidth,
                borderRadius: this.borderRadius,
                direction: this.direction,
                showText: this.showText,
                textFormat: this.textFormat,
                textColor: this.textColor,
                fontSize: this.fontSize
            };
        }
    }

    window.UIProgressBar = UIProgressBar;
})();