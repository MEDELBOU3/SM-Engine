class SMPlayerInputController {
    constructor() {
        this.enabled = false;
        this.keys = new Set();
        this.forward = 0;
        this.right = 0;
        this.sprint = false;
        this.fire = false;
        this.justFired = false;
        this.jump = false;
        this.justJumpPressed = false;
        this._bound = false;

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onBlur = this._onBlur.bind(this);
        this.bind();
    }

    bind() {
        if (this._bound) return;
        this._bound = true;
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
        window.addEventListener('blur', this._onBlur);
    }

    _isTyping() {
        const active = document.activeElement;
        const tag = active?.tagName?.toLowerCase();
        return tag === 'input' || tag === 'textarea' || active?.isContentEditable;
    }

    _onKeyDown(event) {
        if (!this.enabled || this._isTyping()) return;

        if (event.code === 'Space') {
            if (!this.keys.has('Space') && !event.repeat) {
                this.justJumpPressed = true;
            }
            event.preventDefault();
        }

        this.keys.add(event.code);
    }

    _onKeyUp(event) {
        this.keys.delete(event.code);
        if (event.code === 'Space') {
            this.jump = false;
        }
    }

    _onMouseDown(event) {
        if (!this.enabled) return;
        if (event.button === 0) {
            if (!this.fire) this.justFired = true;
            this.fire = true;
        }
    }

    _onMouseUp(event) {
        if (event.button === 0) {
            this.fire = false;
        }
    }

    _onBlur() {
        this.keys.clear();
        this.forward = 0;
        this.right = 0;
        this.sprint = false;
        this.fire = false;
        this.justFired = false;
        this.jump = false;
        this.justJumpPressed = false;
    }

    update() {
        if (!this.enabled) {
            this.forward = 0;
            this.right = 0;
            this.fire = false;
            this.jump = false;
            this.justFired = false;
            this.justJumpPressed = false;
            return;
        }

        this.forward = (
            this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0
        ) - (
            this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0
        );

        this.right = (
            this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0
        ) - (
            this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0
        );

        this.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
        this.jump = this.keys.has('Space');
    }

    consumeJustFired() {
        const result = this.justFired;
        this.justFired = false;
        return result;
    }

    consumeJumpPressed() {
        const result = this.justJumpPressed;
        this.justJumpPressed = false;
        return result;
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
        if (!this.enabled) this._onBlur();
    }

    dispose() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mouseup', this._onMouseUp);
        window.removeEventListener('blur', this._onBlur);
        this._bound = false;
    }
}
window.SMPlayerInputController = SMPlayerInputController;