/** Selects the best available traversal clip from geometry and approach data. */
class SMPlayerTraversalAnimationSelector {
    constructor(manifest = window.SMPlayerAnimationManifest, config = window.SMPlayerConfig) {
        this.manifest = manifest || {};
        this.config = config || {};
        this.preferred = {
            VAULT: 'VAULT',
            CLIMB: 'CLIMB',
            CLIMB_WALL: 'CLIMB_UP_WALL',
            BIG_JUMP: 'BIG_JUMP',
            JUMP: 'RUNNING_JUMP'
        };
    }

    select(plan, hasClip = () => true) {
        if (!plan?.type) return null;
        const type = String(plan.type).toUpperCase();
        const preferred = this.preferred[type];
        const candidates = Object.entries(this.manifest)
            .filter(([key, definition]) => {
                const traversal = String(definition?.motion?.traversal || '').toUpperCase();
                return traversal === type && hasClip(key);
            })
            .map(([key, definition]) => {
                const referenceSpeed = Math.max(0.1, Number(definition.motion?.speed || 1));
                const speedError = Math.abs(Number(plan.approachSpeed || 0) - referenceSpeed);
                return {
                    key,
                    definition,
                    score: speedError + (key === preferred ? -1.0 : 0)
                };
            })
            .sort((a, b) => a.score - b.score);

        let choice = candidates[0];
        if (!choice && preferred && hasClip(preferred)) {
            choice = { key: preferred, definition: this.manifest[preferred] || {}, score: 0 };
        }
        if (!choice) return null;

        const referenceSpeed = Math.max(0.5, Number(choice.definition?.motion?.speed || 1));
        const approachSpeed = Math.max(0, Number(plan.approachSpeed || 0));
        let playRate = Number(choice.definition?.timeScale ?? 1);
        if (type === 'VAULT' || type === 'JUMP' || type === 'BIG_JUMP') {
            playRate *= THREE.MathUtils.clamp(0.88 + approachSpeed / (referenceSpeed * 9), 0.88, 1.16);
        } else {
            const heightReference = type === 'CLIMB_WALL' ? 2.4 : 1.45;
            playRate *= THREE.MathUtils.clamp(0.92 + Number(plan.topHeight || 0) / (heightReference * 10), 0.90, 1.12);
        }

        return {
            clip: choice.key,
            playRate,
            blendIn: type === 'VAULT' ? 0.12 : 0.16,
            blendOut: 0.18,
            score: choice.score
        };
    }
}

window.SMPlayerTraversalAnimationSelector = SMPlayerTraversalAnimationSelector;
