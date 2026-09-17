/**
 * GAME-UI/widgets/UIPanel.js
 */
(function () {
    'use strict';

    class UIPanel extends window.UIWidget {
        constructor(options = {}) {
            super({
                type: 'panel',
                name: 'Panel',
                width: 300,
                height: 200,
                ...options
            });

            this.background = options.background ?? 'rgba(30,30,30,0.85)';
            this.borderColor = options.borderColor ?? 'transparent';
            this.borderWidth = Number(options.borderWidth ?? 0);
            this.borderRadius = Number(options.borderRadius ?? 0);
            this.clipChildren = options.clipChildren ?? false;
        }

        createElement() {
            const element = document.createElement('div');
            element.className = 'game-ui-widget game-ui-panel';
            return element;
        }

        applyElementState(element = this._element) {
            super.applyElementState(element);
            if (!element) return null;

            element.style.background = this.background;
            element.style.border = `${this.borderWidth}px solid ${this.borderColor}`;
            element.style.borderRadius = `${this.borderRadius}px`;
            element.style.overflow = this.clipChildren ? 'hidden' : 'visible';

            return element;
        }

        serialize() {
            return {
                ...super.serialize(),
                background: this.background,
                borderColor: this.borderColor,
                borderWidth: this.borderWidth,
                borderRadius: this.borderRadius,
                clipChildren: this.clipChildren
            };
        }
    }

    window.UIPanel = UIPanel;
})();