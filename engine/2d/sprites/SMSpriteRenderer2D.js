// ============================================================================
// engine/2d/sprites/SMSpriteRenderer2D.js
// SM Engine - Runtime 2D Sprite Animator Component
// ============================================================================
(function (root) {
    'use strict';

    class SMSpriteRenderer2D {
        constructor(mesh, atlasData) {
            this.mesh = mesh;
            this.atlas = atlasData; // { image, size, frames: [], animations: [] }
            
            this.activeClip = null;
            this.currentFrameIdx = 0;
            this.elapsedTime = 0;
            this.isPlaying = true;
            this.flipX = false;

            this.uvAttribute = this.mesh?.geometry?.attributes?.uv || null;

            if (this.atlas?.animations?.length > 0) {
                this.play(this.atlas.animations[0].name);
            }
        }

        play(clipName, loop = true) {
            const clip = this.atlas?.animations?.find(a => a.name === clipName);
            if (!clip) return;

            this.activeClip = { ...clip, loop };
            this.currentFrameIdx = 0;
            this.elapsedTime = 0;
            this.isPlaying = true;

            this._applyCurrentFrameUV();
        }

        setFlipX(flip) {
            if (this.flipX === flip) return;
            this.flipX = flip;
            this._applyCurrentFrameUV();
        }

        update(delta = 1 / 60) {
            if (!this.isPlaying || !this.activeClip || this.activeClip.frames.length === 0) return;

            this.elapsedTime += delta;
            const frameDuration = 1 / Math.max(1, this.activeClip.fps || 12);

            if (this.elapsedTime >= frameDuration) {
                this.elapsedTime %= frameDuration;
                this.currentFrameIdx++;

                if (this.currentFrameIdx >= this.activeClip.frames.length) {
                    if (this.activeClip.loop) {
                        this.currentFrameIdx = 0;
                    } else {
                        this.currentFrameIdx = this.activeClip.frames.length - 1;
                        this.isPlaying = false;
                    }
                }

                this._applyCurrentFrameUV();
            }
        }

        _applyCurrentFrameUV() {
            if (!this.uvAttribute || !this.activeClip) return;

            const frameName = this.activeClip.frames[this.currentFrameIdx];
            const frameData = this.atlas.frames.find(f => f.filename === frameName);
            if (!frameData) return;

            const rect = frameData.frame;
            const texW = this.atlas.size.width;
            const texH = this.atlas.size.height;

            let u0 = rect.x / texW;
            let u1 = (rect.x + rect.w) / texW;
            const v0 = 1 - (rect.y + rect.h) / texH;
            const v1 = 1 - rect.y / texH;

            // Handle Horizontal Flip (Facing Left / Right)
            if (this.flipX) {
                const temp = u0;
                u0 = u1;
                u1 = temp;
            }

            // Map UVs to Quad Plane Geometry
            this.uvAttribute.setXY(0, u0, v1);
            this.uvAttribute.setXY(1, u1, v1);
            this.uvAttribute.setXY(2, u0, v0);
            this.uvAttribute.setXY(3, u1, v0);
            this.uvAttribute.needsUpdate = true;
        }
    }

    root.SMSpriteRenderer2D = SMSpriteRenderer2D;

})(window);