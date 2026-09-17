class SMPlayerAnimationStateMachine {
    constructor(state, input, animationController) {
        this.state = state;
        this.input = input;
        this.animation = animationController;
        this.current = '';
        this.fireLocked = false;
        this.idleThreshold = 0.12;
        this._onMixerFinished =
            this._onMixerFinished.bind(this);
        this.animation.mixer.addEventListener(
            'finished',
            this._onMixerFinished
        );
    }
    _onMixerFinished(event) {
        const fireAction =
            this.animation.actions.get('FIRE');
        if (event.action === fireAction) {
            this.fireLocked = false;
            this.state.firing = false;
            this.current = '';
        }
    }
    _getLocomotionState() {
        const speed =
            Number(this.state.speed || 0);
        const forward =
            Number(this.input.forward || 0);
        const right =
            Number(this.input.right || 0);
        if (speed < this.idleThreshold) {
            if (this.animation.has('IDLE')) {
                return {
                    state: 'IDLE',
                    clip: 'IDLE',
                    referenceSpeed: 0
                };
            }
            return null;
        }
        if (
            forward < 0 &&
            this.animation.has('RUN_BACKWARD')
        ) {
            return {
                state: 'RUN_BACKWARD',
                clip: 'RUN_BACKWARD',
                referenceSpeed:
                    window.SMPlayerConfig?.backwardSpeed ?? 4.2
            };
        }
        if (
            forward > 0 &&
            right > 0 &&
            this.animation.has('RUN_FORWARD_RIGHT')
        ) {
            return {
                state: 'RUN_FORWARD_RIGHT',
                clip: 'RUN_FORWARD_RIGHT',
                referenceSpeed:
                    window.SMPlayerConfig?.diagonalRunSpeed ?? 5.2
            };
        }
        if (
            forward > 0 &&
            this.input.sprint &&
            this.animation.has('RUN_FORWARD_RIGHT')
        ) {
            return {
                state: 'RUN_FORWARD',
                clip: 'RUN_FORWARD_RIGHT',
                referenceSpeed:
                    window.SMPlayerConfig?.runSpeed ?? 6.2
            };
        }
        if (this.animation.has('WALK_FORWARD')) {
            return {
                state: 'WALK_FORWARD',
                clip: 'WALK_FORWARD',
                referenceSpeed:
                    window.SMPlayerConfig?.walkSpeed ?? 3.2
            };
        }
        return null;
    }
    _updatePlaybackSpeed(state) {
        if (!state) return;
        if (state.clip === 'IDLE') return;
        const action =
            this.animation.actions.get(state.clip);
        if (!action) return;
        const referenceSpeed = Math.max(
            0.01,
            state.referenceSpeed || 1
        );
        const actualSpeed = Math.max(
            0,
            this.state.speed || 0
        );
        const ratio =
            actualSpeed / referenceSpeed;
        const animationSpeed =
            THREE.MathUtils.clamp(
                ratio,
                0.65,
                1.25
            );
        action.setEffectiveTimeScale(
            animationSpeed
        );
    }
    update() {
        if (!this.animation.enabled) return;
        if (
            this.input.consumeJustFired() &&
            !this.fireLocked &&
            this.animation.has('FIRE')
        ) {
            this.fireLocked = true;
            this.state.firing = true;
            this.current = 'FIRE';
            this.state.setState('FIRE');
            this.animation.playOneShot(
                'FIRE',
                {
                    fade: 0.07
                }
            );
            return;
        }
        if (this.fireLocked) return;
        const next =
            this._getLocomotionState();
        if (!next) return;
        if (next.state !== this.current) {
            this.current = next.state;
            this.state.setState(
                next.state
            );
            this.animation.play(
                next.clip,
                {
                    fade: 0.10
                }
            );
        }
        this._updatePlaybackSpeed(next);
    }
    forceIdle() {
        this.fireLocked = false;
        this.state.firing = false;
        this.current = '';
        if (!this.animation.has('IDLE')) {
            return false;
        }
        this.current = 'IDLE';
        this.state.setState('IDLE');
        this.animation.play(
            'IDLE',
            {
                fade: 0.08,
                restart: true
            }
        );
        return true;
    }
    reset() {
        this.fireLocked = false;
        this.state.firing = false;
        this.current = '';
    }
    dispose() {
        this.animation.mixer.removeEventListener(
            'finished',
            this._onMixerFinished
        );
    }
}
window.SMPlayerAnimationStateMachine =
    SMPlayerAnimationStateMachine;
