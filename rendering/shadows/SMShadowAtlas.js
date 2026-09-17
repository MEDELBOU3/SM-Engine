(function (global) {
    'use strict';

    class SMShadowAtlas {
        constructor(options = {}) {
            this.width = options.width ?? 4096;
            this.height = options.height ?? 4096;

            this.entries = new Map();
            this.cursorX = 0;
            this.cursorY = 0;
            this.rowHeight = 0;
        }

        reset() {
            this.entries.clear();
            this.cursorX = 0;
            this.cursorY = 0;
            this.rowHeight = 0;
        }

        allocate(key, width, height) {
            if (this.entries.has(key)) {
                return this.entries.get(key);
            }

            width = Math.max(1, width | 0);
            height = Math.max(1, height | 0);

            if (width > this.width || height > this.height) {
                return null;
            }

            if (this.cursorX + width > this.width) {
                this.cursorX = 0;
                this.cursorY += this.rowHeight;
                this.rowHeight = 0;
            }

            if (this.cursorY + height > this.height) {
                return null;
            }

            const entry = {
                x: this.cursorX,
                y: this.cursorY,
                width,
                height,
                u0: this.cursorX / this.width,
                v0: this.cursorY / this.height,
                u1: (this.cursorX + width) / this.width,
                v1: (this.cursorY + height) / this.height
            };

            this.entries.set(key, entry);

            this.cursorX += width;
            this.rowHeight = Math.max(this.rowHeight, height);

            return entry;
        }
    }

    global.SMShadowAtlas = SMShadowAtlas;
})(window);
