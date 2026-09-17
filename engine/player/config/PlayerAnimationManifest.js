/**
 * PlayerAnimationManifest.js
 * SM Engine — Motion Matching / Traversal animation catalog.
 * Paths match the animation files shown in assets/fbx-player-animation.
 */
window.SMPlayerAnimationManifest = {
    // ---------------------------------------------------------------------
    // Parkour / Traversal
    // ---------------------------------------------------------------------
    BIG_JUMP: {
        id: 'BIG_JUMP',
        file: 'assets/fbx-player-animation/Parkour/Big Jump.fbx',
        loop: false,
        timeScale: 1.0,
        motion: { category: 'traversal', traversal: 'BIG_JUMP', speed: 6.0, autoMatch: false }
    },
    CLIMB_UP_WALL: {
        id: 'CLIMB_UP_WALL',
        file: 'assets/fbx-player-animation/Parkour/Climbing Up Wall.fbx',
        loop: false,
        timeScale: 1.0,
        motion: { category: 'traversal', traversal: 'CLIMB_WALL', speed: 1.4, autoMatch: false }
    },
    CLIMB: {
        id: 'CLIMB',
        file: 'assets/fbx-player-animation/Parkour/Climbing.fbx',
        loop: false,
        timeScale: 1.0,
        motion: { category: 'traversal', traversal: 'CLIMB', speed: 1.2, autoMatch: false }
    },
    FALL_ROLL: {
        id: 'FALL_ROLL',
        file: 'assets/fbx-player-animation/Parkour/Falling To Roll.fbx',
        loop: false,
        timeScale: 1.0,
        motion: { category: 'traversal', traversal: 'LAND_ROLL', speed: 4.5, autoMatch: false }
    },
    UPHILL_SKIING: {
        id: 'UPHILL_SKIING',
        file: 'assets/fbx-player-animation/Parkour/Uphill skiing.fbx',
        loop: true,
        timeScale: 1.0,
        motion: { category: 'misc', autoMatch: false }
    },
    VAULT: {
        id: 'VAULT',
        file: 'assets/fbx-player-animation/Parkour/Vault Over Obstacle.fbx',
        loop: false,
        timeScale: 1.0,
        motion: { category: 'traversal', traversal: 'VAULT', speed: 4.8, autoMatch: false }
    },

    // ---------------------------------------------------------------------
    // Combat / actions
    // ---------------------------------------------------------------------
    FIRE: {
        id: 'FIRE',
        file: 'assets/fbx-player-animation/Firing Rifle.fbx',
        loop: false,
        timeScale: 1.0,
        motion: { category: 'action', autoMatch: false }
    },

    // ---------------------------------------------------------------------
    // Turns
    // ---------------------------------------------------------------------
    LEFT_TURN: {
        id: 'LEFT_TURN',
        file: 'assets/fbx-player-animation/Left Turn.fbx',
        loop: false,
        timeScale: 1.0,
        motion: { category: 'turn', speed: 0.0, forward: 0, right: -1, turn: -1, autoMatch: false }
    },
    RIGHT_TURN: {
        id: 'RIGHT_TURN',
        file: 'assets/fbx-player-animation/Right Turn.fbx',
        loop: false,
        timeScale: 1.0,
        motion: { category: 'turn', speed: 0.0, forward: 0, right: 1, turn: 1, autoMatch: false }
    },

    // ---------------------------------------------------------------------
    // Locomotion
    // ---------------------------------------------------------------------
    RUN_BACKWARD: {
        id: 'RUN_BACKWARD',
        file: 'assets/fbx-player-animation/Run Backwards.fbx',
        loop: true,
        timeScale: 1.0,
        motion: { category: 'locomotion', speed: 4.2, forward: -1, right: 0, sprint: true }
    },
    RUN_FORWARD_RIGHT: {
        id: 'RUN_FORWARD_RIGHT',
        file: 'assets/fbx-player-animation/Run Forward Right.fbx',
        loop: true,
        timeScale: 1.0,
        motion: { category: 'locomotion', speed: 5.2, forward: 0.72, right: 0.72, sprint: true }
    },
    RUNNING_BACKWARD: {
        id: 'RUNNING_BACKWARD',
        file: 'assets/fbx-player-animation/Running Backward.fbx',
        loop: true,
        timeScale: 1.0,
        motion: { category: 'locomotion', speed: 5.0, forward: -1, right: 0, sprint: true }
    },
    RUN_FORWARD: {
        id: 'RUN_FORWARD',
        file: 'assets/fbx-player-animation/Running forward.fbx',
        loop: true,
        timeScale: 1.0,
        motion: { category: 'locomotion', speed: 6.2, forward: 1, right: 0, sprint: true }
    },
    RUNNING_JUMP: {
        id: 'RUNNING_JUMP',
        file: 'assets/fbx-player-animation/Running Jump.fbx',
        loop: false,
        timeScale: 1.0,
        motion: { category: 'traversal', traversal: 'JUMP', speed: 5.5, autoMatch: false }
    },
    WALK_FORWARD: {
        id: 'WALK_FORWARD',
        file: 'assets/fbx-player-animation/Walk Forward.fbx',
        loop: true,
        timeScale: 1.0,
        motion: { category: 'locomotion', speed: 3.2, forward: 1, right: 0, sprint: false }
    },
    WALK_BACKWARD: {
        id: 'WALK_BACKWARD',
        file: 'assets/fbx-player-animation/Walking Backward.fbx',
        loop: true,
        timeScale: 1.0,
        motion: { category: 'locomotion', speed: 2.8, forward: -1, right: 0, sprint: false }
    },

    // ---------------------------------------------------------------------
    // Optional clips — loaded and callable, but not auto-selected by matcher.
    // ---------------------------------------------------------------------
    SIT_DRINK: {
        id: 'SIT_DRINK',
        file: 'assets/fbx-player-animation/Sitting Drinking.fbx',
        loop: false,
        timeScale: 1.0,
        motion: { category: 'misc', autoMatch: false }
    },
    WALK_BRIEFCASE: {
        id: 'WALK_BRIEFCASE',
        file: 'assets/fbx-player-animation/Walk With Briefcase.fbx',
        loop: true,
        timeScale: 1.0,
        motion: { category: 'misc', autoMatch: false }
    },
    WALK_SHOW_BACKWARD: {
        id: 'WALK_SHOW_BACKWARD',
        file: 'assets/fbx-player-animation/Walking and show Backwards.fbx',
        loop: true,
        timeScale: 1.0,
        motion: { category: 'misc', autoMatch: false }
    }
};