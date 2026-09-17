/**
 * GAME-UI/widgets/UIImage.js
 */
(function () {
    'use strict';

    class UIImage extends window.UIWidget {
        constructor(options = {}) {
            super({
                type: 'image',
                name: 'Image',
                width: 128,
                height: 128,
                ...options
            });

            this.src = options.src ?? '';
            this.objectFit = options.objectFit ?? 'contain';
            this.objectPosition = options.objectPosition ?? 'center';
            this.alt = options.alt ?? '';
            this.tint = options.tint ?? null;
        }

        createElement() {
            const wrapper = document.createElement('div');
            wrapper.className = 'game-ui-widget game-ui-image';

            const img = document.createElement('img');
            img.draggable = false;
            img.className = 'game-ui-image-element';
            wrapper.appendChild(img);

            return wrapper;
        }

        applyElementState(element = this._element) {
            super.applyElementState(element);
            if (!element) return null;

            const img = element.querySelector('img');
            if (img) {
                img.src = this.src || '';
                img.alt = this.alt;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = this.objectFit;
                img.style.objectPosition = this.objectPosition;
                img.style.pointerEvents = 'none';
                img.style.userSelect = 'none';
            }

            if (this.tint) {
                element.style.backgroundColor = this.tint;
                element.style.backgroundBlendMode = 'multiply';
            } else {
                element.style.backgroundColor = '';
                element.style.backgroundBlendMode = '';
            }

            return element;
        }

        serialize() {
            return {
                ...super.serialize(),
                src: this.src,
                objectFit: this.objectFit,
                objectPosition: this.objectPosition,
                alt: this.alt,
                tint: this.tint
            };
        }
    }

    window.UIImage = UIImage;
})();