/**
 * GAME-UI/widgets/UIText.js
 */
(function () {
    'use strict';

    class UIText extends window.UIWidget {
        constructor(options = {}) {
            super({
                type: 'text',
                name: 'Text',
                width: 220,
                height: 40,
                ...options
            });

            this.text = options.text ?? 'Text';
            this.fontFamily = options.fontFamily ?? 'Inter, Arial, sans-serif';
            this.fontSize = Number(options.fontSize ?? 24);
            this.fontWeight = options.fontWeight ?? 400;
            this.color = options.color ?? '#ffffff';
            this.textAlign = options.textAlign ?? 'left';
            this.verticalAlign = options.verticalAlign ?? 'middle';
            this.lineHeight = options.lineHeight ?? 1.2;
            this.whiteSpace = options.whiteSpace ?? 'pre-wrap';
            this.textShadow = options.textShadow ?? 'none';
        }

        createElement() {
            const element = document.createElement('div');
            element.className = 'game-ui-widget game-ui-text';
            return element;
        }

        applyElementState(element = this._element) {
            super.applyElementState(element);
            if (!element) return null;

            element.textContent = this.text;
            element.style.fontFamily = this.fontFamily;
            element.style.fontSize = `${this.fontSize}px`;
            element.style.fontWeight = `${this.fontWeight}`;
            element.style.color = this.color;
            element.style.textAlign = this.textAlign;
            element.style.lineHeight = `${this.lineHeight}`;
            element.style.whiteSpace = this.whiteSpace;
            element.style.textShadow = this.textShadow;
            element.style.display = this.visible ? 'flex' : 'none';

            const verticalMap = {
                top: 'flex-start',
                middle: 'center',
                bottom: 'flex-end'
            };

            element.style.alignItems = verticalMap[this.verticalAlign] || 'center';

            if (this.textAlign === 'center') element.style.justifyContent = 'center';
            else if (this.textAlign === 'right') element.style.justifyContent = 'flex-end';
            else element.style.justifyContent = 'flex-start';

            return element;
        }

        serialize() {
            return {
                ...super.serialize(),
                text: this.text,
                fontFamily: this.fontFamily,
                fontSize: this.fontSize,
                fontWeight: this.fontWeight,
                color: this.color,
                textAlign: this.textAlign,
                verticalAlign: this.verticalAlign,
                lineHeight: this.lineHeight,
                whiteSpace: this.whiteSpace,
                textShadow: this.textShadow
            };
        }
    }

    window.UIText = UIText;
})();