window.SMPlayerConfig = {
    modelPath: 'assets/models/player.fbx',
    animationRoot: 'assets/fbx-player-animation/',
    workspaceModes: ['GAME_DEV', 'GAMEPLAY_SAMPLE'],
    targetHeight: 1.8,
    // Spawn above the Game Development start pad. Starting at ground level
    // puts the capsule inside its collider; gravity will settle the player
    // safely onto whichever floor/platform is present.
    spawnPosition: [0, 2.5, 0],
    // Keep the legacy synthetic floor at world ground, not at the elevated
    // spawn height, for scenes that do not register a collision mesh yet.
    fallbackGroundY: 0.025,
    spawnRotation: [0, 0, 0],
    visualYawOffset: Math.PI,

    walkSpeed: 3.2,
    runSpeed: 6.2,
    backwardSpeed: 4.2,
    diagonalRunSpeed: 5.2,
    acceleration: 12,
    deceleration: 16,
    rotationSpeed: 18,

    animationFade: 0.16,
    animationTimeScale: 1,
    runtimePhysics: false,

    // Kinematic capsule / collision. The root stays at the character's feet;
    // animated bones expose lightweight hit bodies for weapons and gameplay.
    playerColliderRadius: 0.34,
    playerColliderHeight: 1.78,
    playerColliderSkin: 0.025,
    maxStepHeight: 0.45,
    groundOffset: 0.025,
    groundSnapDistance: 0.28,
    gravity: 22,
    terminalVelocity: 28,
    minGroundNormalY: 0.42,
    collisionCacheInterval: 0.20,

    playerCameraFov: 65,
    playerCameraNear: 0.05,
    playerCameraFar: 1500,
    cameraDistance: 4.5,
    cameraHeight: 1.55,
    cameraShoulderOffset: 0.45,
    cameraLookAhead: 0.35,
    cameraSensitivity: 0.0025,
    cameraSmoothing: 16,
    cameraMinPitch: -0.35,
    cameraMaxPitch: 0.85,

    // ---------------------------------------------------------------------
    // Motion Matching v1
    // ---------------------------------------------------------------------
    motionMatchingEnabled: true,
    motionMatchingWorkspaceOnly: 'GAMEPLAY_SAMPLE',
    motionMatchInterval: 0.05,
    motionContinuityBias: 0.16,
    motionMinimumHold: 0.12,
    motionSwitchThreshold: 0.07,
    locomotionBlendTime: 0.16,
    locomotionRateSmoothing: 10,
    motionDirectionWeight: 1.35,
    motionSpeedWeight: 1.0,
    motionSprintWeight: 0.30,
    motionTrajectoryWeight: 0.70,

    // ---------------------------------------------------------------------
    // Traversal
    // ---------------------------------------------------------------------
    autoTraversal: true,
    traversalMinAutoSpeed: 1.1,
    traversalProbeDistance: 1.85,
    traversalCooldown: 0.24,
    traversalPlayerRadius: 0.34,
    traversalLandingOffset: 0.55,
    traversalClearance: 0.22,
    traversalMinDuration: 0.45,
    traversalMaxDuration: 3.4,
    vaultMaxHeight: 1.15,
    vaultMaxDepth: 1.45,
    climbMaxHeight: 2.05,
    wallClimbMaxHeight: 3.15,
    jumpDistance: 3.4,
    bigJumpDistance: 5.2,
    jumpArcHeight: 1.0,
    bigJumpArcHeight: 1.55,
    landingRollMinDrop: 1.15,
    uphillAnimationMinAngle: 11,
    uphillAnimationMinDot: 0.20,

    motionMatchingDebug: false,
    debug: false
};
