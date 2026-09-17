/**
 * GAME-UI/widgets/UIButton.js
 */
(function () {
    'use strict';

    class UIButton extends window.UIWidget {
        constructor(options = {}) {
            super({
                type: 'button',
                name: 'Button',
                width: 180,
                height: 46,
                interactable: true,
                ...options
            });

            this.text = options.text ?? 'Button';
            this.fontFamily = options.fontFamily ?? 'Inter, Arial, sans-serif';
            this.fontSize = Number(options.fontSize ?? 16);
            this.fontWeight = options.fontWeight ?? 600;
            this.textColor = options.textColor ?? '#ffffff';

            this.background = options.background ?? '#3d3d3d';
            this.hoverBackground = options.hoverBackground ?? '#4b4b4b';
            this.activeBackground = options.activeBackground ?? '#2f2f2f';
            this.disabledBackground = options.disabledBackground ?? '#2b2b2b';

            this.borderColor = options.borderColor ?? 'transparent';
            this.borderWidth = Number(options.borderWidth ?? 0);
            this.borderRadius = Number(options.borderRadius ?? 4);
        }

        createElement() {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'game-ui-widget game-ui-button';
            return button;
        }

        applyElementState(element = this._element) {
            super.applyElementState(element);
            if (!element) return null;

            element.textContent = this.text;
            element.disabled = !this.enabled;
            element.style.fontFamily = this.fontFamily;
            element.style.fontSize = `${this.fontSize}px`;
            element.style.fontWeight = `${this.fontWeight}`;
            element.style.color = this.textColor;
            element.style.background = this.enabled ? this.background : this.disabledBackground;
            element.style.border = `${this.borderWidth}px solid ${this.borderColor}`;
            element.style.borderRadius = `${this.borderRadius}px`;
            element.style.cursor = this.enabled && this.interactable ? 'pointer' : 'default';

            if (!element.__gameUIBound) {
                element.__gameUIBound = true;

                element.addEventListener('mouseenter', () => {
                    if (this.enabled) element.style.background = this.hoverBackground;
                });

                element.addEventListener('mouseleave', () => {
                    element.style.background = this.enabled ? this.background : this.disabledBackground;
                });

                element.addEventListener('mousedown', () => {
                    if (this.enabled) element.style.background = this.activeBackground;
                });

                element.addEventListener('mouseup', () => {
                    if (this.enabled) element.style.background = this.hoverBackground;
                });
            }

            return element;
        }

        serialize() {
            return {
                ...super.serialize(),
                text: this.text,
                fontFamily: this.fontFamily,
                fontSize: this.fontSize,
                fontWeight: this.fontWeight,
                textColor: this.textColor,
                background: this.background,
                hoverBackground: this.hoverBackground,
                activeBackground: this.activeBackground,
                disabledBackground: this.disabledBackground,
                borderColor: this.borderColor,
                borderWidth: this.borderWidth,
                borderRadius: this.borderRadius
            };
        }
    }

    window.UIButton = UIButton;
})();