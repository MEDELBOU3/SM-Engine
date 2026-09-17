window.UAL2MotionLibrary = window.UAL2MotionLibrary || {
    packName: 'Mixamo Retargeted Motion Set',
    source: 'mixamo-retargeted',
    version: '1.2.0',
    root: 'assets/offline-cdn/retargeted-animations/',
    autoLoad: true,

    animations: [
        // --- Ground Locomotion ---
        {
            name: 'mixamo_idle',
            path: 'idle.json',
            state: 'idle',
            tags: ['idle'],
            speed: 0,
            directionAngle: 0,
            stripRootMotion: 'xz'
        },
        {
            name: 'mixamo_walk_forward',
            path: 'walk_forward.json',
            state: 'walk',
            tags: ['walk'],
            speed: 0.42,
            directionAngle: 0,
            stripRootMotion: 'xz'
        },
        {
            name: 'mixamo_walk_backward',
            path: 'walk_backward.json',
            state: 'walk',
            tags: ['walk', 'backward'],
            speed: 0.32,
            directionAngle: 180,
            stripRootMotion: 'xz'
        },
        {
            name: 'mixamo_run_forward',
            path: 'run_forward.json',
            state: 'run',
            tags: ['run'],
            speed: 1.0,
            directionAngle: 0,
            stripRootMotion: 'xz'
        },

        // --- Turns (loop while key held, NOT oneShot) ---
        {
            name: 'mixamo_turn_left',
            path: 'turn_left_90.json',
            state: 'turn',
            tags: ['turn', 'left'],
            speed: 0,
            directionAngle: -90,
            stripRootMotion: 'xz'
            // isOneShot intentionally omitted — loops while turning
        },
        {
            name: 'mixamo_turn_right',
            path: 'turn_right_90.json',
            state: 'turn',
            tags: ['turn', 'right'],
            speed: 0,
            directionAngle: 90,
            stripRootMotion: 'xz'
        },

        // --- Air States (REQUIRED or jump/fall will break) ---
        {
            name: 'mixamo_jump',
            path: 'jump.json',
            state: 'jump',
            tags: ['jump'],
            speed: 0.35,
            directionAngle: 0,
            isOneShot: true,     // jump plays once then holds last frame
            stripRootMotion: 'xyz' // strip Y too — no vertical root drift
        },
        {
            name: 'mixamo_fall',
            path: 'fall.json',
            state: 'fall',
            tags: ['fall'],
            speed: 0.35,
            directionAngle: 0,
            stripRootMotion: 'xyz'
        }
    ]
};