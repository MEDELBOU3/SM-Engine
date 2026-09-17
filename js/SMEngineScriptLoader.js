/**
 * SM ENGINE — CENTRAL SCRIPT LOADER
 * ---------------------------------------------------------------
 * Single source of truth for JavaScript load order.
 *
 * Rules:
 *  - Do not add engine <script src> tags directly to index.html.
 *  - Keep dependency-sensitive sections in the order defined here.
 *  - Do not alphabetically sort Runtime files.
 *  - Runtime source order and Runtime execution priority are separate.
 * ---------------------------------------------------------------
 */
(function () {
  "use strict";
  const PHASE_ORDER = Object.freeze(["head", "ammo", "app"]);
  const PHASES = {
    head: [
      // -----------------------------------------------------------------
      // CODE EDITOR / PARSERS
      // -----------------------------------------------------------------
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/codemirror.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/mode/javascript/javascript.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/mode/xml/xml.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/mode/css/css.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/addon/edit/closebrackets.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/addon/edit/matchbrackets.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/addon/fold/foldcode.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/addon/fold/foldgutter.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/addon/fold/brace-fold.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/addon/dialog/dialog.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/addon/search/search.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/addon/search/searchcursor.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.15/addon/hint/show-hint.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.15/addon/hint/javascript-hint.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.15/addon/hint/html-hint.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.15/addon/hint/css-hint.js",
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/xml-hint.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/acorn/8.7.0/acorn.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/tern/0.24.3/tern.min.js",
      // -----------------------------------------------------------------
      // THREE.JS CORE / CONTROLS / LOADERS / EXPORTERS
      // -----------------------------------------------------------------
      "https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/TransformControls.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/DragControls.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/FBXLoader.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/OBJLoader.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/RGBELoader.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/EXRLoader.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/DRACOLoader.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/TGALoader.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/FontLoader.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/utils/SkeletonUtils.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/exporters/GLTFExporter.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/exporters/OBJExporter.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/utils/BufferGeometryUtils.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/modifiers/SimplifyModifier.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/modifiers/SubdivisionModifier.js",
      // -----------------------------------------------------------------
      // GENERAL UTILITIES
      // -----------------------------------------------------------------
      "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js",
      "https://cdn.jsdelivr.net/npm/litegraph.js@0.7.9/build/litegraph.js",
      "https://cdn.jsdelivr.net/npm/vis-network@9.1.9/standalone/umd/vis-network.min.js",
      "https://unpkg.com/lucide@latest",
    ],
    ammo: ["https://cdn.jsdelivr.net/npm/ammo.js@0.0.10/ammo.js"],
    app: [
      // =================================================================
      // THIRD-PARTY APP LIBRARIES
      // =================================================================
      "https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.9/dat.gui.min.js",
      "https://cdn.jsdelivr.net/npm/lil-gui@0.19",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/helpers/RectAreaLightHelper.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/objects/Lensflare.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/cameras/StereoCamera.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/postprocessing/EffectComposer.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/postprocessing/RenderPass.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/postprocessing/OutlinePass.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/postprocessing/ShaderPass.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/postprocessing/UnrealBloomPass.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/postprocessing/SMAAPass.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/postprocessing/SSAOPass.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/shaders/FXAAShader.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/shaders/CopyShader.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/shaders/LuminosityHighPassShader.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/geometries/RoundedBoxGeometry.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/geometries/TextGeometry.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/exporters/FBXExporter.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/objects/MarchingCubes.js",
      "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/objects/Sky.js",
      "https://cdn.jsdelivr.net/npm/idb-keyval@6/dist/idb-keyval-iife.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/gl-matrix/2.8.1/gl-matrix-min.js",
      "https://cdn.jsdelivr.net/npm/simplex-noise@3.0.1/dist/simplex-noise.min.js",
      "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js",
      "https://cdn.jsdelivr.net/npm/three-spritetext@1.6.5/dist/three-spritetext.min.js",
      "https://unpkg.com/es-module-shims@1.8.0/dist/es-module-shims.js",
      "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js",
      "https://cdn.jsdelivr.net/npm/fflate@0.7.4/umd/index.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/noisejs/2.0.0/perlin.min.js",
      "https://unpkg.com/three-bvh-csg",
      "https://cdn.jsdelivr.net/npm/d3-delaunay@6",
      "https://cdn.jsdelivr.net/npm/three@0.159.0/examples/js/math/MeshSurfaceSampler.js",
      "https://cdnjs.cloudflare.com/ajax/libs/stats.js/r17/Stats.min.js",
      "https://unpkg.com/three-mesh-bvh@0.5.23/build/index.umd.js",
      // =================================================================
      // EDITOR CORE / UI BOOTSTRAP
      // =================================================================
      "ui-core/events.js",
      "ui-core/graph-editor-expand.js",
      "ui-core/modals.js",
      "js/app/app-bootstrap.js",

      "nodes/terrain-nodes/core/BaseTerrainNode.js",
      "nodes/terrain-nodes/core/NodeRegistry.js",
      "nodes/terrain-nodes/library/Generators.js",
      "nodes/terrain-nodes/library/ErosionGeology.js",
      "nodes/terrain-nodes/library/FiltersAndCombiners.js",
      "nodes/terrain-nodes/library/AdvancedGenerators.js",
      "nodes/terrain-nodes/library/AdvancedGeology.js",
      "nodes/terrain-nodes/library/Hydrology.js",
      "nodes/terrain-nodes/library/AdvancedAnalysisMasks.js",
      "nodes/terrain-nodes/NodeTerrainEditor.js",
      "nodes/terrain-nodes/AdvancedTerrainPresets.js",

      "processing/transform-controls.js",
      "processing/transform-controls/clipboard-ops.js",
      "js/core/engine-core-functions.js",
      "js/ui/context-menu/mode-context-menu.js",
      "modeling/modifiers/ModifiersToolbox.js",
      "js/scripting/code.js",
      "js/scripting/ScriptingSessionManager.js",
      "js/scripting/codeunivers.js",
      "js/core/export.js",
      "sculpting/hairSystem.js",
      // =================================================================
      // SCULPTING / TERRAIN
      // =================================================================
      "sculpting/terrain-sculpting/TerrainState.js",
      "sculpting/sculpt_wasm_bridge.js",
      "sculpting/terrain-sculpting/TerrainUtils.js",
      "sculpting/terrain-sculpting/TerrainSpatial.js",
      "sculpting/terrain-sculpting/TerrainSurfaceQuery.js",
      "sculpting/terrain-sculpting/TerrainData.js",
      "sculpting/terrain-sculpting/TerrainComponent.js",
      "sculpting/terrain-sculpting/TerrainComponentManager.js",
      "sculpting/terrain-sculpting/TerrainPlayerPlayBridge.js",
      "sculpting/terrain-sculpting/TerrainHistory.js",
      "sculpting/terrain-sculpting/TerrainBrushPreview.js",
      "sculpting/terrain-sculpting/TerrainBrushes.js",
      "sculpting/terrain-sculpting/TerrainInteraction.js",
      "sculpting/terrain-sculpting/TerrainGenerator.js",
      "sculpting/terrain-sculpting/TerrainUI.js",
      "sculpting/mesh-sculpting/SculptingSystem.js",
      "sculpting/terrain-sculpting/TerrainSculptingSystem.js",
      "sculpting/terrain-sculpting/material-painting/TerrainMaterialPainting.js",
      "sculpting/terrain-sculpting/material-painting/TerrainMaterialPaintPanel.js",
      "sculpting/mesh-sculpting/SculptingManager.js",
      "sculpting/vegetation/VegetationPresets.js",
      "sculpting/vegetation/VegetationSystem.js",
      "hilpers/canvas-selection.js",
      "animations/animation-path.js",
      "modeling/architecture-tools-v2.js",
      // =================================================================
      // TIMELINE / SEQUENCER
      // =================================================================
      "js/timeline/core/timeline-binary-evaluator.js",
      "js/timeline/core/timeline-events-audio.js",
      "js/timeline/core/timeline-data.js",
      "js/timeline/animation-converter.js",
      "js/timeline/sm-timeline-core.js",
      "js/timeline/sequencer/TimelineHistoryManager.js",
      "js/timeline/sequencer/TimelineSnapManager.js",
      "js/timeline/sequencer/TimelineMarkerRegionSystem.js",
      "js/timeline/sequencer/TimelineSequencerModel.js",
      "js/timeline/sequencer/TimelineSectionEditor.js",
      "js/timeline/sequencer/TimelineTrackStateManager.js",
      "js/timeline/sequencer/TimelineSequencerUI.js",
      "js/timeline/sequencer/TimelineSequencerSystem.js",
      "js/timeline/integration/TimelineAnimationClipBridge.js",
      "js/timeline/integration/TimelineEvaluatorBridge.js",
      "js/timeline/integration/TimelineSequencerAudioAdapter.js",
      "js/timeline/integration/TimelineSequencerEventAdapter.js",
      "js/scene/SceneSplitViewManager.js",
      "modefiers.js",
      // =================================================================
      // NODE EDITORS / GEOMETRY NODES
      // =================================================================
      "js/node-editor/GlobalNodeEditorManager.js",
      "nodes/MaterialNodeEditor.js",
      "nodes/geometry-nodes/core/NodeSocket.js",
      "nodes/geometry-nodes/core/GeometryData.js",
      "nodes/geometry-nodes/core/NodeRegistry.js",
      "nodes/geometry-nodes/core/NodeGraph.js",
      "nodes/geometry-nodes/core/NodeEvaluator.js",
      "nodes/geometry-nodes/core/NodeSerializer.js",
      "nodes/geometry-nodes/core/History.js",
      "nodes/geometry-nodes/runtime/GeometryOps.js",
      "nodes/geometry-nodes/runtime/GeometryCompiler.js",
      "nodes/geometry-nodes/registry/primitives.js",
      "nodes/geometry-nodes/registry/transform.js",
      "nodes/geometry-nodes/registry/modify.js",
      "nodes/geometry-nodes/registry/material.js",
      "nodes/geometry-nodes/registry/utility.js",
      "nodes/geometry-nodes/registry/curve.js",
      "nodes/geometry-nodes/registry/instances.js",
      "nodes/geometry-nodes/registry/attributes.js",
      "nodes/geometry-nodes/registry/fields.js",
      "nodes/geometry-nodes/registry/topology.js",
      "nodes/GeometryNodeEditor.js",
      "advanced-modeler/AdvancedCurveTangent.js",
      "advanced-modeler/TwoDProfileDrawer.js",
      "advanced-modeler/ProfileExtrusion.js",
      // =================================================================
      // WORKSPACE / ENVIRONMENT
      // =================================================================
      "engine/workspace/core/SMWorkspaceOwnership.js",
      "engine/workspace/core/SMWorkspaceVisibilityAuthority.js",
      "engine/workspace/core/SMWorkspaceTransitionCoordinator.js",
      "Environment/HDRI/SMHDRIEnvironmentConfig.js",
      "Environment/HDRI/SMHDRIPackage.js",
      "Environment/sky.js",
      "Environment/HDRI/SMAdvancedShaderSky.js",
      "engine/environment/sun/SMSunController.js",
      "engine/workspace/integration/SMWorkspaceEnvironmentAdapter.js",
      "engine/environment/sun/SMSunTimeOfDay.js",
      "engine/environment/sun/SMSunPresets.js",
      "engine/environment/sun/SMSunEnvironmentBridge.js",
      "engine/environment/sun/SMSunGizmo.js",
      "engine/environment/sun/SMSunOcclusion.js",
      "engine/environment/sun/SMSunGlare.js",
      "engine/environment/sun/SMSunLensFlare.js",
      "engine/environment/sun/SMSunEffectsBridge.js",
      "engine/environment/sun/SMSunViewportBridge.js",
      "Environment/HDRI/SMHDRILightingProfile.js",
      "Environment/HDRI/SMHDRIHierarchyAdapter.js",
      "assets/addObject/objects.js",
      "hilpers/selection/SelectionCore.js",
      // =================================================================
      // MODELING / SELECTION / TOOLS
      // =================================================================
      "processing/unified-modeling-system.js",
      "modeling/architecture-suite.js",
      "processing/edge_helpers_optimized.js",
      "modeling/advanced_modeling_tools.js",
      "modeling/advanced_modeling_ui.js",
      "modeling/architectural-tools/modeling-toolkit-controller.js",
      "modeling/fusion-tools/FusionLoftTool.js",
      "modeling/fusion-tools/FusionFilletTool.js",
      "modeling/fusion-tools/FusionShellTool.js",
      "modeling/fusion-tools/FusionDraftTool.js",
      "modeling/fusion-tools/FusionPatternTool.js",
      "modeling/fusion-tools/FusionModelingUI.js",
      "modeling/modeling-system-init.js",
      "hilpers/selection/SelectionManager.js",
      "hilpers/hierarchy-manager.js",
      "tools/tool.js",
      "engine/logic/nanite/NaniteSystem.js",
      "engine/soundes/sond.js",
      "physics/material-brush-system.js",
      "nodes/vfx/vfx.js",
      "nodes/vfx/VFXStudio.js",
      "hilpers/grid-hilpers.js",
      "hilpers/Keyboard-Shortcuts.js",
      "processing/spin-tool.js",
      "engine/2d/2D-animation/legacy/hybrid-sprite-editor.js",
      "processing/setting.js",
      "tools/navigation.js",
      "tools/node-expand.js",
      "hilpers/AdvancedMinimap.js",
      "animations/RigSysteme/RigManager.js",
      "animations/RigSysteme/AdvancedControlRig.js",
      "ui-core/material.js",
      "ui-core/initializeui.js",
      //"history/history.js",
      // =================================================================
      // ADVANCED HISTORY & TRANSACTION ENGINE
      // =================================================================
      "history/core/BaseCommand.js",
      "history/core/HistoryEvents.js",
      "history/core/MemoryBudget.js",
      "history/core/TransactionManager.js",
      "history/core/HistoryStack.js",
      "history/commands/CustomCallbackCommand.js",
      "history/commands/TransformCommand.js",
      "history/commands/PropertyCommand.js",
      "history/commands/MaterialCommand.js",
      "history/commands/LifecycleCommand.js",
      "history/commands/GeometryCommand.js",
      "history/commands/SculptCommand.js",
      "history/commands/Animation2DCommand.js",
      "history/core/HistoryManager.js",
      "history/serialization/DeltaCompressor.js",
      "history/serialization/GeometrySerializer.js",
      "history/serialization/ObjectSerializer.js",
      "history/adapters/TransformControlsAdapter.js",
      "history/adapters/ModelingSystemAdapter.js",
      "history/adapters/Animation2DAdapter.js",
      "history/ui/HistoryListRenderer.js",
      "history/ui/HistorySearchBar.js",
      "history/ui/KeyboardShortcuts.js",
      "history/ui/HistoryUIController.js",
      "history/index.js",
      "runtime/game-export-system.js",
      "processing/modefiers/CurveModifierSystem.js",
      "assets/addObject/scene-objects/camera-objects.js",
      "assets/addObject/scene-objects/light-objects.js",
      "assets/addObject/scene-objects/light-volumetrics.js",
      "assets/addObject/scene-objects/nspector-bindings.js",
      "assets/addObject/scene-objects/game-mode-meshes/SMShapeMaterialLibrary.js",
      "assets/addObject/scene-objects/game-mode-meshes/SMGameDevShapeFactory.js",
      "assets/addObject/scene-objects/game-mode-meshes/SMCubeGridTool.js",
      "assets/addObject/scene-objects/game-mode-meshes/editing-mode/SMMeshEditingMode.js",

      // =================================================================
      // 2D DRAWING & ANIMATION SUITE (Cartoons / Anime / Storyboard)
      // =================================================================
      "engine/2d/2D-animation/viewport/Viewport2DManager.js",
      "engine/2d/2D-animation/viewport/UVInspector.js",
      "engine/2d/2D-animation/core/Animation2DManager.js",
      "engine/2d/2D-animation/timeline/AdvancedKeyframeEditor.js",
      "engine/2d/2D-animation/core/Animation2DManagerAdvanced.js",
      "engine/2d/2D-animation/rendering/AnimeColoringSystem.js",
      "engine/2d/2D-animation/storyboard/Storyboard2DManager.js",
      "engine/2d/2D-animation/storyboard/Storyboard2DIntegration.js",
      "engine/2d/2D-animation/storyboard/BrushPanelButtonHandlers.js",
      "engine/2d/2D-animation/core/Anime2DWorkspace.js",

      // =================================================================
      // 2D GAME ENGINE & RUNTIME SYSTEMS (Clean Architecture)
      // =================================================================
      "engine/2d/camera/SMCamera2DShake.js",
      "engine/2d/camera/SMCamera2D.js",
      "engine/2d/environment/SMParallaxBackground.js",
      "engine/2d/environment/SM2DGraphGrid.js",
      "engine/2d/environment/SMTilemapSystem.js",
      "engine/2d/environment/SM2DGraphGrid_TILEMAP_SYNC.js",

      "engine/2d/sprites/SMSpriteRenderer2D.js",
      "engine/2d/core/SM2DCollisionSystem.js",
      "engine/2d/core/SM2DGameRuntime.js",
      "engine/2d/core/SM2DPlayPresentation.js",
      "engine/2d/sprites/SMSpriteSheetEditor.js",
      "engine/2d/sprites/SMSpriteEditorBridge.js",
      "engine/2d/SM2DEnvironmentSystem.js",
      //"engine/2d/editor/SMTilemapEditor.js",
      "engine/2d/SpriteSheet_RuntimeErrorFix.js",
      "engine/logic/Managers/AssetsPanel_TilemapIntegration.js",
      "engine/2d/environment/SMTilemapRuntimeBridge.js",
      "engine/2d/environment/SMTilemap2DToolbar.js",
      "engine/2d/environment/SMTilemap_LARGE_CANVAS_RUNTIME_PATCH.js",
      "engine/2d/environment/SMTilemapPaint2D.js",

      "assets/project-assets-manifest.js",
      "assets/game-obstacles/obstacle-library.js",
      "assets/game-obstacles/SMCityGenerator.js",
      "assets/MyGame/GameProjectAssetsBridge.js",
      "assets/MyGame/GameSceneAssetsBridge.js",
      "assets/MyGame/GameSceneLoaderBridge.js",
      "assets/MyGame/GameProjectStartupBridge.js",
      "assets/MyGame/GameProjectRuntimeBridge.js",
      "assets/MyGame/GameProjectAutoLoadBridge.js",
      "engine/logic/Managers/AssetStorageManager.js",
      "engine/logic/Managers/PhysicalGameProjectBridge.js",
      "engine/logic/Managers/AssetsPanelContextMenuUnified.js",
      "engine/logic/Managers/ThreeJSNativeProjectBridge.js",

      "engine/architecture-builder/core/SMBuildingSchema.js",
      "engine/architecture-builder/core/SMBuildingMapParser.js",
      "engine/architecture-builder/core/SMBuildingGraph.js",
      "engine/architecture-builder/materials/SMBuildingMaterialResolver.js",
      "engine/architecture-builder/geometry/SMArchitecturalGeometry.js",
      "engine/architecture-builder/geometry/SMOpeningLayout.js",
      "engine/architecture-builder/geometry/SMArchitecturalUV.js",
      "engine/architecture-builder/geometry/SMBuildingMeshOptimizer.js",

      "engine/architecture-builder/generators/SMWallGenerator.js",
      "engine/architecture-builder/generators/SMFloorGenerator.js",
      "engine/architecture-builder/generators/SMRoomGenerator.js",
      "engine/architecture-builder/generators/SMDoorGenerator.js",
      "engine/architecture-builder/generators/SMWindowGenerator.js",
      "engine/architecture-builder/generators/SMColumnGenerator.js",
      "engine/architecture-builder/generators/SMStairGenerator.js",
      "engine/architecture-builder/generators/SMRoofGenerator.js",
      "engine/architecture-builder/generators/SMBuildingGenerator.js",

      "engine/architecture-builder/importers/SMSVGFloorPlanImporter.js",
      "engine/architecture-builder/importers/SMDXFImporter.js",
      "engine/architecture-builder/importers/SMPlanVisionBridge.js",
      "engine/architecture-builder/integration/SMArchitectureAssetsBridge.js",
      "engine/architecture-builder/editor/SMBuildingPanel.js",
      "engine/architecture-builder/SMArchitectureBootstrap.js",

      // =================================================================
      // BLENDER FORMAT IMPORT PIPELINE
      // =================================================================
      "engine/importers/blender/BlenderDetector.js",
      "engine/importers/blender/BlenderProcessBridge.js",
      "engine/importers/blender/BlenderMetadataBridge.js",
      "engine/importers/blender/BlenderUIPanelBridge.js",
      "engine/importers/blender/SMBlenderTextureBridge.js",
      "engine/importers/blender/SMBlenderMaterialBridge.js",
      "engine/importers/blender/BlenderImporter.js",
      "engine/integrations/blendswap/BlendSwapClient.js",
      "engine/integrations/blendswap/BlendSwapAssetImporter.js",
      "engine/integrations/blendswap/BlendSwapLicense.js",
      "engine/integrations/blendswap/BlendSwapPanel.js",
      "engine/integrations/blendswap/BlendSwapBootstrap.js",
      // UNREAL ENGINE IMPORT PIPELINE
      "engine/importers/unreal/UnrealAssetTypes.js",
      "engine/importers/unreal/UnrealAssetBackend.js",
      "engine/importers/unreal/UnrealAssetRegistry.js",
      "engine/importers/unreal/UnrealAssetParser.js",
      "engine/importers/unreal/UnrealAssetConverter.js",
      "engine/importers/unreal/UnrealAssetMaterialBridge.js",
      "engine/importers/unreal/UnrealAssetLoader.js",
      "engine/importers/unreal/UnrealAssetRuntimeBridge.js",

      "engine/formats/smf/SMFormatConstants.js",
      "engine/formats/smf/SMAssetUUID.js",
      "engine/formats/smf/SMChecksum.js",
      "engine/formats/smf/SMFormatHeader.js",
      "engine/formats/smf/SMChunkTypes.js",
      "engine/formats/smf/SMCompression.js",
      "engine/formats/smf/SMStringTable.js",
      "engine/formats/smf/SMDependencyTable.js",
      "engine/formats/smf/SMChunkWriter.js",
      "engine/formats/smf/SMChunkReader.js",
      "engine/formats/smf/SMFormatWriter.js",
      "engine/formats/smf/SMFormatReader.js",
      "engine/formats/smf/SMFormatRegistry.js",

      "engine/formats/smf/formats/SMSceneFormat.js",
      "engine/formats/smf/formats/SMMeshFormat.js",
      "engine/formats/smf/formats/SMMaterialFormat.js",
      "engine/formats/smf/formats/SMPrefabFormat.js",
      "engine/formats/smf/formats/SMAnimationFormat.js",
      "engine/formats/smf/formats/SMTextureFormat.js",

      "engine/asset-pipeline/SMAssetDependencyGraph.js",
      "engine/asset-pipeline/SMAssetDatabase.js",
      "engine/asset-pipeline/SMAssetImporter.js",
      "engine/asset-pipeline/SMAssetCompiler.js",
      "engine/asset-pipeline/SMAssetCooker.js",

      // =================================================================
      // AUDIO / ASSET INTEGRATION
      // =================================================================
      "engine/audio/SMAudioAssetManager.js",
      "engine/audio/SMAudioBus.js",
      "engine/audio/SMAudioListenerManager.js",
      "engine/audio/SMAudioSource.js",
      "engine/audio/SMAudioZone.js",
      "engine/audio/SMAudioViewportHelper.js",
      "engine/audio/SMAudioSceneActor.js",
      "engine/audio/SMAudioSystem.js",
      "engine/audio/graph/SMMetaSoundRuntimeCompiler.js",
      "engine/soundes/MetaSoundEditor/MetaSoundEditor.js",
      "engine/audio/graph/SMMetaSoundAssetBridge.js",
      // ================================================================
      // MATERIAL AUTHORING / LIBRARY / UNIVERSAL MATERIAL PAINT
      // ================================================================
      "engine/materials/MaterialInstance.js",
      "engine/materials/MaterialLibrary.js",
      "engine/materials/shaders/SMUniversalMaterialBlendShader.js",
      "engine/materials/MaterialSystem.js",

      "engine/materials/material-painting/SMMaterialAssetBridge.js",
      "engine/materials/material-painting/SMUniversalMaterialPainter.js",
      "engine/materials/material-painting/SMMaterialPaintPanel.js",
      "engine/audio/integration/AssetsPanelAudioBridge.js",
      "engine/audio/SMAudioSceneRuntime.js",
      "engine/audio/integration/TimelineAudioBridge.js",
      "engine/logic/Managers/AssetDriveSources.js",
      "engine/logic/Managers/assets-manager/AssetsPanelCore.js",
      "engine/logic/Managers/assets-manager/AssetsPanelDrive.js",
      "engine/logic/Managers/assets-manager/AssetsPanelAssetsFolders.js",
      "engine/logic/Managers/assets-manager/AssetsPanelScenePreview.js",
      "engine/logic/Managers/assets-manager/AssetsPanelStorage.js",
      "engine/logic/Managers/assets-manager/AssetsPanelUIEventsLayout.js",
      "engine/logic/Managers/assets-manager/AssetsPanelImportPBR.js",
      "engine/logic/Managers/assets-manager/AssetsPanelRenderNavigation.js",
      "engine/logic/Managers/assets-manager/AssetsPanelContextMenus.js",
      "engine/logic/Managers/assets-manager/AssetsPanelMaterialApplication.js",
      "engine/logic/Managers/assets-manager/AssetsPanelAdvancedFeatures.js",
      "engine/logic/Managers/assets-manager/AssetsPanelScriptsBuiltins.js",
      "engine/logic/Managers/assets-manager/AssetsPanelBootstrap.js",
      "engine/logic/Managers/assets-manager/AssetsPanelBlenderBridge.js",
      "engine/logic/Managers/assets-manager/library-icons/AssetsPanelModelFormatIcons.js",
      "engine/logic/Managers/assets-manager/library-icons/AssetsPanelCodeFileIcons.js",
      "engine/logic/Managers/assets-manager/library-icons/AssetsPanelMediaFileIcons.js",
      "engine/logic/Managers/assets-manager/library-icons/AssetsPanelPackageIcon.js",
      "engine/logic/Managers/assets-manager/library-icons/AssetsPanelObstacleThumbnails.js",
      "engine/logic/Managers/assets-manager/library-icons/AssetsPanelLightPrimitiveThumbnails.js",
      "engine/logic/Managers/assets-manager/AssetsPanelRawSidecarBridge.js",
      "engine/logic/Managers/assets-manager/AssetsPanelImportQueue.js",

      // =================================================================
      // UNREAL / FAB ASSET IMPORTER SYSTEM
      // =================================================================
      "engine/importers/unreal/UnrealAssetTypes.js",
      "engine/importers/unreal/UnrealAssetRegistry.js",
      "engine/importers/unreal/UnrealAssetBackend.js",
      "engine/importers/unreal/UnrealAssetParser.js",
      "engine/importers/unreal/UnrealAssetConverter.js",
      "engine/importers/unreal/UnrealAssetImporter.js",
      "engine/importers/unreal/UnrealAssetMaterialBridge.js",
      "engine/importers/unreal/UnrealAssetLoader.js",
      "engine/importers/unreal/UnrealAssetRuntimeBridge.js",

      "Environment/HDRI/SMHDRIDefaultEnvironment.js",
      "engine/logic/Managers/AssetBrowserPro.js",
      "assets/MyGame/MyGamePackage.js",
      "assets/MyGame/scripts/MyGameRuntime.js",
      "js/BuiltinModels.js",
      "animations/camera-path.js",
      "advanced-modeler/AdvancedModeler.js",
      "advanced-modeler/MultiViewCanvas.js",
      "processing/persistence/ScenePersistenceManager.js",
      "js/ui/color-tools/AdvancedColorPicker.js",
      // =================================================================
      // RENDERING SYSTEM
      // =================================================================
      "rendering/core/SMRenderPass.js",
      "rendering/core/SMRenderContext.js",
      "rendering/core/SMRenderTargetPool.js",
      "rendering/core/SMRenderGraph.js",
      "rendering/passes/SMDepthPrePass.js",
      "rendering/passes/SMNormalPass.js",
      "rendering/passes/SMSkyPass.js",
      "rendering/passes/SMOpaquePass.js",
      "rendering/passes/SMTransparentPass.js",
      "rendering/passes/SMScenePass.js",
      "rendering/passes/SMFinalCompositePass.js",
      "rendering/materials/SMMaterialRegistry.js",
      "rendering/materials/SMTextureManager.js",
      "rendering/materials/SMPBRMaterial.js",
      "rendering/materials/SMMaterialCompiler.js",
      "rendering/materials/SMMaterialSystem.js",
      "rendering/lighting/SMDirectionalLighting.js",
      "rendering/lighting/SMPointLighting.js",
      "rendering/lighting/SMSpotLighting.js",
      "rendering/lighting/SMLightCulling.js",
      "rendering/lighting/SMLightingManager.js",
      "rendering/shadows/SMDirectionalShadow.js",
      "rendering/shadows/SMShadowAtlas.js",
      "rendering/shadows/SMContactShadows.js",
      "rendering/shadows/SMShadowManager.js",
      "rendering/environment/SMFogRenderer.js",
      "rendering/environment/SMHDRIManager.js",
      "rendering/environment/SMSkyRenderer.js",
      "rendering/environment/SMReflectionProbe.js",
      "rendering/environment/SMEnvironmentRenderer.js",
      "rendering/postprocessing/SMBloom.js",
      "rendering/postprocessing/SMAmbientOcclusion.js",
      "rendering/postprocessing/SMAntiAliasing.js",
      "rendering/postprocessing/SMColorGrading.js",
      "rendering/postprocessing/SMToneMapping.js",
      "rendering/exposure/SMLuminanceAnalyzer.js",
      "rendering/exposure/SMEyeAdaptation.js",
      "rendering/exposure/SMExposureVolume.js",
      "rendering/exposure/SMExposureVolumeManager.js",
      "rendering/exposure/SMExposureSystem.js",
      "rendering/postprocessing/SMPostProcessStack.js",
      "rendering/quality/SMGraphicsCapabilities.js",
      "rendering/quality/SMResolutionScaler.js",
      "rendering/quality/SMGraphicsQuality.js",
      "rendering/quality/SMRealisticRendering.js",
      "rendering/core/SMRenderer.js",
      "rendering/viewport-shading/ViewportShadingPresets.js",
      "rendering/viewport-shading/SMViewportShadingController.js",
      "rendering/viewport-shading/SMViewportRenderModeAdapter.js",
      "rendering/viewport-shading/SMViewportShadingBridge.js",
      "rendering/SMRenderPipeline.js",
      "rendering/render.js",
      "rendering/offline/SMImageExporter.js",
      "rendering/offline/SMVideoRenderer.js",
      "rendering/offline/SMOfflineRenderer.js",
      "rendering/debug/SMRenderStats.js",
      "rendering/debug/SMRenderDebugger.js",
      "js/app/WorkspaceManager.js",
      // =================================================================
      // PHYSICS SYSTEM
      // =================================================================
      "physics/advanced/core/SMPhysicsMath.js",
      "physics/advanced/core/SMPhysicsEventBus.js",
      "physics/advanced/core/SMPhysicsLayerManager.js",
      "physics/advanced/core/SMPhysicsMaterialLibrary.js",
      "physics/PhysicsSystem.js",
      "physics/physics-compat.js",
      "physics/advanced/collision/SMColliderGeometryBuilder.js",
      "physics/advanced/collision/SMCompoundCollider.js",
      "physics/advanced/collision/SMCollisionCooker.js",
      "physics/advanced/collision/SMColliderSerializer.js",
      "physics/advanced/queries/SMPhysicsQuerySystem.js",
      "physics/advanced/collision/SMPhysicsContactSystem.js",
      "physics/advanced/collision/SMPhysicsTriggerSystem.js",
      "physics/zones.js",
      "physics/advanced/collision/SMColliderVisualizer.js",
      "physics/advanced/collision/SMColliderGizmo.js",
      "physics/advanced/collision/SMColliderAuthoringSystem.js",
      "physics/advanced/constraints/SMConstraintManager.js",
      "physics/advanced/characters/SMCharacterMotor.js",
      "physics/RagdollSystem.js",
      "physics/advanced/vehicles/SMRaycastVehicleSystem.js",
      "physics/advanced/destruction/SMDestructionSystem.js",
      "physics/advanced/softbody/SMSoftBodyController.js",
      "physics/advanced/recording/SMPhysicsStateRecorder.js",
      "physics/advanced/performance/SMPhysicsPerformanceManager.js",
      "physics/advanced/debug/SMPhysicsDiagnostics.js",
      "physics/advanced/integration/SMAdvancedPhysics.js",
      "physics/advanced/collision/SMColliderAuthoringBootstrap.js",
      "physics/advanced/integration/SMAdvancedPhysicsBootstrap.js",
      "physics/main.js",
      "physics/ui/ColliderEditorPanel.js",
      "physics/ui/PhysicsUI.js",
      // =================================================================
      // SETTINGS / SYSTEM / ADD-ONS
      // =================================================================
      "engine/settings/settings-store.js",
      "engine/settings/system/SMHardwareInfo.js",
      "engine/settings/system/SMMemoryBudgetManager.js",
      "engine/settings/system/SMWorkerPoolManager.js",
      "engine/settings/system/SMSystemDiagnostics.js",
      "engine/settings/system/SMSystemSettingsManager.js",
      "engine/settings/system/SMSystemSettingsBridge.js",
      "engine/settings/file-paths/SMFilePathsManager.js",
      "engine/settings/file-paths/SMFilePathsSettingsBridge.js",
      "engine/settings/addons/core/SMAddonStorage.js",
      "engine/settings/addons/core/SMAddonRegistry.js",
      "engine/settings/addons/core/SMAddonContext.js",
      "engine/settings/addons/core/SMAddonManager.js",
      "engine/settings/addons/SMAddonSettingsBridge.js",
      "engine/settings/settings-appliers.js",
      "engine/settings/settings-engine.js",
      // =================================================================
      // GEMINI AI ASSISTANT / ENGINE TOOLS
      // =================================================================
      "engine/ai/SMAIPermissionPolicy.js",
      "engine/ai/SMAIToolRegistry.js",
      "engine/ai/SMAIContextBuilder.js",
      "engine/ai/SMAICommandExecutor.js",
      "engine/ai/tools/ObjectTools.js",
      "engine/ai/tools/MaterialTools.js",
      "engine/ai/tools/LightingTools.js",
      "engine/ai/tools/CameraTools.js",
      "engine/ai/tools/TerrainTools.js",
      "engine/ai/tools/AssetTools.js",
      "engine/ai/SMAIService.js",
      // =================================================================
      // PLUGIN FRAMEWORK
      // =================================================================
      "engine/plugins/core/SMPluginStorage.js",
      "engine/plugins/core/SMPluginRegistry.js",
      "engine/plugins/core/SMPluginContext.js",
      "engine/plugins/core/SMPluginManager.js",
      "engine/plugins/core/SMPluginLoader.js",
      "engine/plugins/core/SMPluginEngineBridge.js",
      "engine/plugins/core/SMPluginBootstrap.js",
      "engine/plugins/builtins/SceneNotes/SceneNotesPlugin.js",
      "engine/settings/addons/SMAddonEngineBridge.js",
      "engine/settings/addons/builtins/AssetValidatorAddon.js",
      "engine/settings/addons/builtins/MaterialAuditorAddon.js",
      "engine/settings/addons/builtins/PerformanceSentinelAddon.js",
      "engine/settings/addons/builtins/SceneDoctorAddon.js",
      "engine/settings/addons/builtins/TransformGuardAddon.js",
      "engine/settings/system/SMSystemSettingsUI.js",
      "engine/settings/file-paths/SMFilePathsSettingsUI.js",
      "engine/settings/addons/ui/SMAddonSettingsUI.js",
      "engine/settings/addons/core/SMAddonBootstrap.js",
      // =================================================================
      // EDITOR PANELS
      // =================================================================
      "panels/WelcomeModal.js",
      "panels/ToolbarPanel.js",
      "panels/SidebarPanel.js",
      "panels/HierarchyPanel.js",
      "navigation/PanelDockManager.js",
      "panels/InspectorPanel.js",
      "panels/ModelingPanel.js",
      "panels/fx/FXParticlesPanelView.js",
      "panels/fx/FXParticlesPanel.js",
      "modeling/modifiers/ModelingModifiersPanel.js",
      "panels/ScultpingPanel.js",
      "sculpting/global-sculpt/GlobalSculptMode.js",
      "sculpting/global-sculpt/GlobalSculptPanel.js",
      "sculpting/mesh-sculpting/advanced/core/SMAdvancedSculptHistory.js",
      "sculpting/mesh-sculpting/advanced/topology/SMAdvancedSculptTopology.js",
      "sculpting/mesh-sculpting/advanced/core/SMAdvancedSculptBrushEngine.js",
      "sculpting/mesh-sculpting/advanced/SMAdvancedMeshSculptWorkspace.js",
      "sculpting/mesh-sculpting/advanced/ui/SMAdvancedMeshSculptPanel.js",
      "panels/AssetPanel.js",
      "panels/CodeEditorPanel.js",
      "panels/consolePanel.js",
      "panels/spreadsheetPanel.js",
      "panels/TimelinePanel.js",
      "panels/BoneRigPanel.js",
      // =================================================================
      // PLAYER ANIMATION EDITOR PIPELINE
      // =================================================================
      "engine/player/animation/PlayerAnimationParameters.js",
      "engine/player/animation/PlayerAnimationActionAdapter.js",
      "engine/player/animation/PlayerAnimationActionAdapterRegistryPatch.js",
      "editor/animation/AnimationAssetProvider.js",
      "editor/animation/AnimationClipPickerBridge.js",
      "engine/player/animation/PlayerAnimationGraph.js",
      "engine/player/animation/PlayerAnimationStateMachine.js",
      "engine/player/animation/blending/PlayerBlendSpace1D.js",
      "engine/player/animation/blending/PlayerBlendSpace2D.js",
      "engine/player/animation/PlayerAnimationGraphCompiler.js",
      "engine/player/animation/PlayerAnimationGraphRuntime.js",
      "engine/player/animation/PlayerAnimationRuntimeBridge.js",
      // =================================================================
      // FX / PARTICLE RUNTIME
      // =================================================================
      "engine/fx/core/FXUtils.js",
      "engine/fx/core/FXSystem.js",
      "engine/fx/core/ParticlePool.js",
      "engine/fx/core/ParticleEmitter.js",
      "engine/fx/snow/SnowPresets.js",
      "engine/fx/snow/SnowMaterial.js",
      "engine/fx/snow/SnowEmitter.js",
      "engine/fx/snow/SnowSystem.js",
      "engine/fx/explosions/ExplosionPresets.js",
      "engine/fx/explosions/SparkEmitter.js",
      "engine/fx/explosions/DebrisEmitter.js",
      "engine/fx/explosions/ShockwaveEffect.js",
      "engine/fx/explosions/FireEmitter.js",
      "engine/fx/explosions/SmokeEmitter.js",
      "engine/fx/explosions/ExplosionEmitter.js",
      "engine/fx/explosions/ExplosionSystem.js",
      "engine/fx/particles/ParticlePresets.js",
      "engine/fx/particles/ParticleMaterial.js",
      "engine/fx/particles/CustomEmitter.js",
      "engine/fx/particles/ParticleSystem.js",
      "engine/fx/core/FXManager.js",
      "engine/fx/FXBootstrap.js",
      "editor/animation/AnimationGraphNode.js",
      "editor/animation/AnimationGraphConnection.js",
      "editor/animation/AnimationGraphEditor.js",
      "editor/animation/AnimationStateNode.js",
      "editor/animation/AnimationTransition.js",
      "editor/animation/AnimationStateMachineEditor.js",
      "editor/animation/AnimationBlendSpace2DEditor.js",
      "editor/animation/AnimationBlendSpaceEditor.js",
      // =================================================================
      // PROJECT PERSISTENCE
      // =================================================================
      "engine/project/SMProjectStorage.js",
      "engine/project/serializers/TerrainSerializer.js",
      "engine/project/serializers/SceneSerializer.js",
      "engine/project/serializers/WorkspaceSerializer.js",
      "engine/project/serializers/PlayerSerializer.js",
      "engine/project/SMProjectSerializer.js",
      "engine/project/SMProjectLoader.js",
      "engine/project/SMProjectAutosave.js",
      "engine/project/SMProjectManager.js",
      "engine/project/integration/SMLauncherProjectBridge.js",
      "engine/project/integration/SMProjectFilesystemSync.js",
      "engine/project/integration/SMProjectFilesystemImport.js",
      "engine/project/integration/SMWorkspaceProjectBridge.js",
      "engine/project/integration/SMAssetsProjectBridge.js",
      "engine/project/ProjectBootstrap.js",
      "panels/animationGraphPanel.js",
      "editor/animation/AnimationEditorBridge.js",
      "editor/animation/AnimationBlendSpaceBridge.js",
      "panels/NodeEditorPanel.js",
      "panels/VFXPanel.js",
      "panels/SecondaryPanels.js",
      "panels/AIAssistantPanel.js",
      "panels/PanelRegistry.js",
      "panels/VegetationPanel.js",
      "panels/CameraPanel.js",
      "panels/LightingPanel.js",
      "panels/settingsPanel.js",
      "engine/plugins/ui/SMPluginSettingsUI.js",
      "https://cdn.jsdelivr.net/npm/monaco-editor@latest/min/vs/loader.js",
      "js/app/editor-mode-rescue.js",
      "js/app/DocumentTabs.js",
      "js/app/SMEditorExpansion.js",
      "insights/SMInsightsPanel.js",
      "js/node-editor/TerrainNodeEditorUI.js",
      // =================================================================
      // OPTIMIZATION / PERFORMANCE
      // =================================================================
      "engine/optimization/PerformanceMonitor.js",
      "engine/optimization/GeometryBudgetManager.js",
      "engine/optimization/VisibilityManager.js",
      "engine/optimization/OcclusionManager.js",
      "engine/optimization/AdaptiveLODManager.js",
      "engine/optimization/MeshClusterManager.js",
      "engine/optimization/InstanceManager.js",
      "engine/optimization/DynamicResolutionManager.js",
      "engine/optimization/ShadowBudgetManager.js",
      "engine/optimization/MemoryBudgetManager.js",
      "engine/optimization/PerformanceManager.js",
      "engine/optimization/EngineSentinel.js",
      // =================================================================
      // LUMEN / GLOBAL ILLUMINATION
      // =================================================================
      "engine/lighting/lumen/LumenConfig.js",
      "engine/lighting/lumen/LumenCapabilities.js",
      "engine/lighting/lumen/buffers/LumenRenderTargets.js",
      "engine/lighting/lumen/buffers/LumenGBuffer.js",
      "engine/lighting/lumen/LumenObjectRegistry.js",
      "engine/lighting/lumen/LumenFrameScheduler.js",
      "engine/lighting/lumen/shaders/ssGi.vert.js",
      "engine/lighting/lumen/shaders/ssGi.frag.js",
      "engine/lighting/lumen/gi/ScreenSpaceGI.js",
      "engine/lighting/lumen/gi/RadianceProbeGrid.js",
      "engine/lighting/lumen/gi/RadianceCache.js",
      "engine/lighting/lumen/gi/EmissiveInjection.js",
      "engine/lighting/lumen/shaders/indirectDiffuse.vert.js",
      "engine/lighting/lumen/shaders/indirectDiffuse.frag.js",
      "engine/lighting/lumen/gi/IndirectDiffusePass.js",
      "engine/lighting/lumen/gi/SurfaceCache.js",
      "engine/lighting/lumen/gi/ProbeTextureAtlas.js",
      "engine/lighting/lumen/shaders/probeTrace.vert.js",
      "engine/lighting/lumen/shaders/probeTrace.frag.js",
      "engine/lighting/lumen/gi/ProbeTracePass.js",
      "engine/lighting/lumen/gi/VoxelScene.js",
      "engine/lighting/lumen/shaders/voxelTrace.frag.js",
      "engine/lighting/lumen/LumenLightingSystem.js",
      // =================================================================
      // ENGINE SCENE / GAME ENVIRONMENT / CAMERA
      // =================================================================
      "engine/globals.js",
      "engine/resources/SMResourceManager.js",
      "engine/resources/workers/SMTerrainWorkerBridge.js",
      "engine/game-mode-environment/GameModeEnvironmentConfig.js",
      "engine/game-mode-environment/GameModeBuildingKit.js",
      "engine/game-mode-environment/GameModeObstacleFactory.js",
      "engine/game-mode-environment/GameModeFacilityLayout.js",
      "engine/game-mode-environment/GameModeCollisionBridge.js",
      "engine/game-mode-environment/GameModeEnvironmentSystem.js",
      "js/mode-Manager/GameModeManager.js",
      "engine/grid-materials-obstacles.js",
      "engine/advanced-lighting.js",
      "engine/selection-viewport-utils.js",
      "engine/SMViewportSystem.js",
      "engine/camera/SMCameraBookmarkStore.js",
      "engine/camera-system.js",
      "engine/camera/SMCameraInputBridge.js",
      "engine/camera/SMCameraViewportBridge.js",
      "engine/camera/SMCameraBootstrap.js",
      // =================================================================
      // CLEAN VIEWPORT CORE
      // =================================================================
      "engine/viewport/SMViewportFrameLoop.js",
      "engine/viewport/SMViewportCameraRouter.js",
      "engine/viewport/SMViewportLayout.js",
      "engine/viewport/SMViewportInput.js",
      "engine/viewport/SMViewportOverlay.js",
      "engine/viewport/SMViewportModeBridge.js",
      "engine/viewport/SMViewport.js",
      "engine/animate-loop.js",
      "engine/Game-animation/SMGameplaySampleCourse.js",
      "engine/Game-animation/SMGameplaySampleEnvironment.js",
      // =================================================================
      // PLAYER SYSTEM
      // =================================================================
      "engine/player/config/PlayerConfig.js",
      "engine/player/config/PlayerAnimationManifest.js",
      "engine/player/utils/PlayerUtils.js",
      "engine/player/core/PlayerState.js",
      "engine/player/core/PlayerCharacter.js",
      "engine/player/input/PlayerInputController.js",
      "engine/player/movement/PlayerRotationController.js",
      "engine/player/movement/PlayerMovementController.js",
      "engine/player/movement/PlayerGrounding.js",
      "engine/player/physics/PlayerPhysicsController.js",
      "engine/player/camera/PlayerCameraController.js",
      "engine/player/animation/PlayerAnimationLoader.js",
      "engine/player/animation/PlayerAnimationClipRegistry.js",
      "engine/player/animation/PlayerAnimationLoaderIntegration.js",
      "engine/player/animation/PlayerAnimationController.js",
      "engine/player/motion-matching/PlayerMotionMatchingDatabase.js",
      "engine/player/motion-matching/PlayerTraversalDetector.js",
      "engine/player/motion-matching/PlayerTraversalAnalyzer.js",
      "engine/player/motion-matching/PlayerTraversalAnimationSelector.js",
      "engine/player/motion-matching/PlayerMotionWarper.js",
      "engine/player/motion-matching/PlayerMotionMatchingSystem.js",
      "engine/game-play/game-play-orchestrator.js",
      "engine/game-play/SMGameModeRuntime.js",
      "engine/game-play/SMGameCameraManager.js",
      "engine/player/SMPlayerSystem.js",
      "engine/player/debug/PlayerDebugOverlay.js",
      "engine/player/debug/PlayerDebugPanel.js",
      // =================================================================
      // LIVE CAPTURE / VIRTUAL PRODUCTION SYSTEM
      // =================================================================
      "engine/capture/core/SMCaptureDeviceManager.js",
      "engine/capture/core/SMCaptureSession.js",
      "engine/capture/core/SMCaptureSystem.js",
      "engine/capture/video/SMVideoTextureSource.js",
      "engine/capture/video/SMWebCameraInput.js",
      "engine/capture/video/SMPhoneCameraInput.js",
      "engine/capture/video/SMCaptureCardInput.js",
      "engine/capture/usb/SMUSBDeviceManager.js",
      "engine/capture/usb/SMUSBVideoReceiver.js",
      "engine/capture/usb/SMUSBTrackingReceiver.js",
      "engine/capture/usb/SMUSBPhoneBridge.js",
      "engine/capture/usb/SMUSBTetherTransport.js",
      "engine/capture/usb/SMUSBPhoneBridgeTetherPatch.js",
      "engine/capture/network/SMWebRTCReceiver.js",
      "engine/capture/network/SMRemoteCameraServer.js",
      "engine/capture/tracking/SMPhoneTracking.js",
      "engine/capture/tracking/SMCameraPoseTracker.js",
      "engine/capture/tracking/SMLensTracker.js",
      "engine/capture/recording/SMViewportRecorder.js",
      "engine/capture/recording/SMCaptureRecorder.js",
      "engine/capture/recording/SMCaptureTakeManager.js",
      "engine/capture/ui/LiveCapturePanel.js",
      // =================================================================
      // WATER SYSTEM
      // =================================================================
      "engine/water/WaterWaveSpectrum.js",
      "engine/water/WaterFFTSpectrum.js",
      "engine/water/WaterMaterial.js",
      "engine/water/WaterVolumeMaterial.js",
      "engine/water/WaterVolume.js",
      "engine/water/WaterBody.js",
      "engine/water/WaterEditor.js",
      "engine/water/WaterTerrainAdapter.js",
      "engine/water/WaterUnderwaterMaterial.js",
      "engine/water/WaterUnderwaterRenderer.js",
      "engine/water/WaterInteractionFX.js",
      "engine/water/WaterShorelineSampler.js",
      "engine/water/WaterShoreFoamMaterial.js",
      "engine/water/WaterShoreFoamSystem.js",
      "engine/water/WaterNodeGraph.js",
      "engine/water/WaterNodePanel.js",
      "engine/water/WaterSystem.js",
      "engine/native/water/NativeWaterWasmBridge.js",
      "engine/water/NativeWaterBridge.js",
      "engine/water/WaterPanel.js",
      // =================================================================
      // METAHUMAN
      // =================================================================
      "engine/metahuman/SMMetaHumanCamera.js",
      "engine/metahuman/SMMetaHumanMorphs.js",
      "engine/metahuman/SMMetaHumanCharacter.js",
      "engine/metahuman/SMMetaHumanPresets.js",
      "engine/metahuman/SMMetaHumanDNA.js",
      "engine/metahuman/SMMetaHumanFaceBoard.js",

      "engine/metahuman/SMMetaHumanAssetLoader.js",
      "engine/metahuman/SMMetaHumanAssetImporter.js",
      "engine/metahuman/SMMetaHumanAssetsPanelBridge.js",
      "engine/metahuman/SMMetaHumanCharacterAssembler.js",

      "engine/metahuman/SMMetaHumanFaceRig.js",
      "engine/metahuman/SMMetaHumanBodyRig.js",

      "engine/metahuman/SMMetaHumanSystem.js",

      "engine/ui/metahuman/metahuman-panel.js",
      "engine/ui/metahuman/metahuman-body-panel.js",
      "engine/ui/metahuman/metahuman-face-panel.js",
      // =================================================================
      // GAME UI SYSTEM
      // =================================================================
      "game-ui/core/GameUIDocument.js",
      "game-ui/widgets/UIWidget.js",
      "game-ui/widgets/UIPanel.js",
      "game-ui/widgets/UIText.js",
      "game-ui/widgets/UIImage.js",
      "game-ui/widgets/UIButton.js",
      "game-ui/widgets/UIProgressBar.js",
      "game-ui/widgets/UIWidgetLibrary.js",
      "game-ui/layout/UIAnchorSystem.js",
      "game-ui/layout/UIConstraintSystem.js",
      "game-ui/layout/UISafeAreaSystem.js",
      "game-ui/layout/UILayoutEngine.js",
      "game-ui/binding/UIDataBindingSystem.js",
      "game-ui/binding/UIEventBindingSystem.js",
      "game-ui/binding/UIBindingContext.js",
      "game-ui/animation/UIKeyframeEvaluator.js",
      "game-ui/animation/UIAnimationSystem.js",
      "game-ui/animation/UITransitionLibrary.js",
      "game-ui/input/UIFocusManager.js",
      "game-ui/input/UIEventSystem.js",
      "game-ui/input/UINavigationSystem.js",
      "game-ui/runtime/GameUIScreenRenderer.js",
      "game-ui/runtime/GameUIVisibilitySystem.js",
      "game-ui/runtime/GameUIRuntime.js",
      "game-ui/runtime/GameUIPIEBridge.js",
      "game-ui/core/GameUISerializer.js",
      "game-ui/core/GameUIManager.js",
      "game-ui/prefabs/UIPrefabManager.js",
      "game-ui/prefabs/UIPrefabInstance.js",
      "game-ui/prefabs/UIPresetLibrary.js",
      "game-ui/compiler/GameUICompiler.js",
      "game-ui/compiler/GameUIBuildPipeline.js",
      "game-ui/runtime/GameUIAssetLoader.js",
      "game-ui/runtime/GameUIEngineBridge.js",
      "game-ui/editor/GameUISelectionManager.js",
      "game-ui/editor/GameUICanvasEditor.js",
      "game-ui/editor/GameUIHierarchyPanel.js",
      "game-ui/editor/GameUIInspectorPanel.js",
      "game-ui/editor/GameUIToolbar.js",
      "game-ui/editor/GameUIEditorManager.js",
      "game-ui/editor/GameUIMode.js",
      "game-ui/GameUI.js",
      // =================================================================
      // SM RUNTIME FRAMEWORK
      // =================================================================
      "engine/assets/package-system/SMAssetPackageLoader.js",
      "engine/assets/package-system/AssetsPanelPackageBridge.js",
      "engine/runtime/SMRuntimeEventBus.js",
      "engine/runtime/SMRuntimeStateSnapshot.js",
      "engine/runtime/SMGameSession.js",
      "engine/runtime/SMPlayModeController.js",
      "engine/runtime/SMRuntimeManager.js",
      "engine/runtime/world/SMRuntimeObjectRegistry.js",
      "engine/runtime/world/SMRuntimeWorldSettings.js",
      "engine/runtime/world/SMRuntimeSpawner.js",
      "engine/runtime/world/SMRuntimeWorld.js",
      "engine/runtime/world/SMRuntimeWorldBridge.js",
      "engine/runtime/components/SMComponent.js",
      "engine/runtime/components/SMBehaviour.js",
      "engine/runtime/components/SMComponentRegistry.js",
      "engine/runtime/components/SMComponentContainer.js",
      "engine/runtime/components/SMComponentRuntimeBridge.js",
      "engine/runtime/components/builtin/SMHealthComponent.js",
      "engine/runtime/components/builtin/SMDamageableComponent.js",
      "engine/runtime/components/builtin/SMCharacterComponent.js",
      "engine/runtime/components/builtin/SMTriggerComponent.js",
      "engine/runtime/components/builtin/SMSpawnPointComponent.js",
      "engine/runtime/components/builtin/SMLifetimeComponent.js",
      "engine/runtime/components/builtin/SMRotatorComponent.js",
      "engine/runtime/prefabs/SMPrefab.js",
      "engine/runtime/prefabs/SMPrefabRegistry.js",
      "engine/runtime/prefabs/SMPrefabSerializer.js",
      "engine/runtime/prefabs/SMPrefabInstantiator.js",
      "engine/runtime/prefabs/SMPrefabRuntimeBridge.js",
      "engine/runtime/levels/SMLevel.js",
      "engine/runtime/levels/SMLevelRegistry.js",
      "engine/runtime/levels/SMLevelSerializer.js",
      "engine/runtime/levels/SMLevelManager.js",
      "engine/runtime/levels/SMLevelRuntimeBridge.js",
      "engine/scene/SMEntity.js",
      "engine/scene/SMCustomComponent.js",
      "engine/scene/SMSceneManager.js",
      "engine/scene/SMWorldSceneSerializer.js",
      "engine/scene/editor/SMSceneInspectorBridge.js",
      "engine/runtime/streaming/SMLevelStreamingVolume.js",
      "engine/runtime/streaming/SMDistanceStreaming.js",
      "engine/runtime/streaming/SMLevelStreamingManager.js",
      "engine/runtime/streaming/SMStreamingRuntimeBridge.js",
      "engine/runtime/game-mode/SMGameState.js",
      "engine/runtime/game-mode/SMPlayerController.js",
      "engine/runtime/game-mode/SMGameMode.js",
      "engine/runtime/game-mode/SMGameModeRegistry.js",
      "engine/runtime/game-mode/SMGameModeRuntimeBridge.js",
      "engine/runtime/input/SMInputAction.js",
      "engine/runtime/input/SMInputMap.js",
      "engine/runtime/input/SMInputContext.js",
      "engine/runtime/input/SMInputManager.js",
      "engine/runtime/input/SMInputRuntimeBridge.js",
      "engine/runtime/player/SMPawn.js",
      "engine/runtime/player/SMPlayerRuntime.js",
      "engine/runtime/player/SMPlayerSpawnManager.js",
      "engine/runtime/player/SMPlayerPossessionManager.js",
      "engine/runtime/player/SMPlayerRuntimeBridge.js",
      "engine/runtime/integration/SMRuntimePhysicsBridge.js",
      "engine/runtime/physics/SMColliderComponent.js",
      "engine/runtime/physics/SMRigidBodyComponent.js",
      "engine/runtime/physics/SMCharacterBodyComponent.js",
      "engine/runtime/physics/SMTriggerVolumeComponent.js",
      "engine/runtime/physics/SMPhysicsComponentBridge.js",
      "engine/runtime/gameplay/SMGameplayTags.js",
      "engine/runtime/gameplay/SMGameplayEvent.js",
      "engine/runtime/gameplay/SMGameplayEventManager.js",
      "engine/runtime/gameplay/SMTeamManager.js",
      "engine/runtime/gameplay/SMGameplayRuntimeBridge.js",
      "engine/runtime/integration/SMRuntimeScriptBridge.js",
      "engine/runtime/ai/SMBlackboard.js",
      "engine/runtime/ai/SMBehaviorTree.js",
      "engine/runtime/ai/SMNavigationAgent.js",
      "engine/runtime/ai/SMAIController.js",
      "engine/runtime/ai/SMAIPawnComponent.js",
      "engine/runtime/ai/SMAIRuntimeBridge.js",
      "engine/runtime/animation/SMAnimationParameterSet.js",
      "engine/runtime/animation/SMAnimationStateMachine.js",
      "engine/runtime/animation/SMAnimatorComponent.js",
      "engine/runtime/animation/SMAnimationRuntime.js",
      "engine/runtime/animation/SMAnimationRuntimeBridge.js",
      "engine/runtime/integration/SMRuntimeAudioBridge.js",
      "engine/runtime/save/SMSaveGame.js",
      "engine/runtime/save/SMSaveGameSerializer.js",
      "engine/runtime/save/SMSaveGameManager.js",
      "engine/runtime/save/SMSaveGameRuntimeBridge.js",
      "engine/runtime/integration/SMRuntimeUIBridge.js",
      "engine/runtime/integration/SMRuntimeEditorBridge.js",
      "engine/runtime/integration/SMRuntimeFrameBridge.js",
      "engine/runtime/integration/SMRuntimeToolbarBridge.js",
      // =================================================================
      // BUILD SYSTEM
      // =================================================================
      "engine/build/SMBuildConfig.js",
      "engine/build/SMBuildManifest.js",
      "engine/build/assets/SMAssetDependencyGraph.js",
      "engine/build/assets/SMAssetReferenceScanner.js",
      "engine/build/assets/SMAssetBuildCache.js",
      "engine/build/assets/SMAssetCooker.js",
      "engine/build/assets/SMAssetBundle.js",
      "engine/build/SMBuildValidator.js",
      "engine/build/SMBuildPipeline.js",
      "engine/build/SMBuildManager.js",
      // =================================================================
      // STANDALONE PLAYER RUNTIME
      // =================================================================
      "engine/player-runtime/SMGameManifestLoader.js",
      "engine/player-runtime/SMGameAssetLoader.js",
      "engine/player-runtime/SMGameLevelLoader.js",
      "engine/player-runtime/SMStandaloneRuntime.js",
      "engine/player-runtime/SMGameBootstrap.js",
      // =================================================================
      // EXPORT SYSTEM
      // =================================================================
      "engine/export/SMExportTarget.js",
      "engine/export/SMWebExporter.js",
      "engine/export/SMElectronExporter.js",
      "engine/export/SMExportPipeline.js",
      "engine/export/SMGameExporter.js",
      // =================================================================
      // BUILD / EXPORT EDITOR UI
      // =================================================================
      "panels/build/BuildSettingsPanel.js",
      "panels/build/BuildOutputPanel.js",
      "panels/build/BuildProgressPanel.js",
      "panels/build/BuildPanel.js",
      // =================================================================
      // VIDEO EDITING SYSTEM
      // =================================================================
      "video-editing/core/VideoProjectState.js",
      "video-editing/core/CanvasItemAdapter.js",
      "video-editing/core/CompositionRuntime.js",
      "video-editing/edit/sequencer/SequencerState.js",
      "video-editing/edit/sequencer/SequencerRenderer.js",
      "video-editing/edit/sequencer/SequencerSnap.js",
      "video-editing/edit/sequencer/SequencerInteraction.js",
      "video-editing/edit/sequencer/VideoClipInspector.js",
      "video-editing/edit/sequencer/SequencerManager.js",
      "video-editing/core/VideoEditingManager.js",
      "video-editing/core/VideoHistoryManager.js",
      "video-editing/edit/MediaPoolManager.js",
      "video-editing/edit/transitions/VideoTransitionsLibrary.js",
      "video-editing/edit/transitions/VideoTransitionEvaluator.js",
      "video-editing/edit/VideoTransitionsManager.js",
      "video-editing/edit/transitions/VideoTransitionsBrowserPanel.js",
      "video-editing/edit/transitions/VideoTransitionInspectorPanel.js",
      "video-editing/edit/transitions/VideoTransitionControlsPanel.js",
      "video-editing/edit/transitions/VideoTransitionsPresetManager.js",
      "video-editing/edit/transitions/VideoTransitionsDockManager.js",
      "video-editing/Effects/VideoEffectsLibrary.js",
      "video-editing/Effects/VideoEffectsStack.js",
      "video-editing/Effects/VideoEffectsManager.js",
      "video-editing/Effects/VideoEffectsBrowserPanel.js",
      "video-editing/Effects/VideoEffectsInspectorPanel.js",
      "video-editing/Effects/VideoEffectsMaskPanel.js",
      "video-editing/Effects/VideoEffectsPresetManager.js",
      "video-editing/Effects/VideoEffectsDockManager.js",
      "video-editing/color/ColorGradingManager.js",
      "video-editing/color/ColorWheelsPanel.js",
      "video-editing/color/ColorCurvesPanel.js",
      "video-editing/color/VideoScopesPanel.js",
      "video-editing/color/ColorInspectorPanel.js",
      "video-editing/color/ColorStudioDockManager.js",
      "video-editing/audio/AudioMixerPanel.js",
      "video-editing/audio/AudioEffectsRack.js",
      "video-editing/audio/AudioWaveformEditor.js",
      "video-editing/audio/AudioStudioManager.js",
      "video-editing/audio/AudioInspectorPanel.js",
      "video-editing/audio/AudioStudioDockManager.js",
      "video-editing/fusion/VideoNodeGraph.js",
      "video-editing/fusion/VideoNodeLibrary.js",
      "video-editing/fusion/VideoFusionEvaluator.js",
      "video-editing/fusion/VideoFusionShaderLibrary.js",
      "video-editing/fusion/VideoFusionGPUContext.js",
      "video-editing/fusion/VideoFusionGPUEvaluator.js",
      "video-editing/fusion/VideoFusionRuntimeBridge.js",
      "video-editing/fusion/VideoNodeRenderer.js",
      "video-editing/fusion/VideoNodeEditorManager.js",
      "video-editing/export/VideoExportCapabilities.js",
      "video-editing/export/VideoDeliverPresetLibrary.js",
      "video-editing/export/VideoExportManager.js",
      "video-editing/export/RenderQueueManager.js",
      "video-editing/export/VideoDeliverSettingsPanel.js",
      "video-editing/export/VideoDeliverPresetsPanel.js",
      "video-editing/export/VideoDeliverPreflightPanel.js",
      "video-editing/export/VideoDeliverQueuePanel.js",
      "video-editing/export/VideoDeliverInspectorPanel.js",
      "video-editing/export/VideoDeliverDockManager.js",
      "video-editing/edit/video-editor-advanced.js",
      "video-editing/project/VideoProjectContentManager.js",
      "video-editing/project/VideoProjectContentsPanel.js",
      "video-editing/project/VideoProjectSettingsPanel.js",
      "video-editing/project/VideoProjectInfoPanel.js",
      "video-editing/project/VideoProjectManagementPanel.js",
      "video-editing/project/VideoProjectInspectorPanel.js",
      "video-editing/project/VideoProjectDockManager.js",
      "video-editing/ui/VideoInspectorSidebarManager.js",
      "video-editing/core/VideoWorkspaceRouter.js",
      "video-editing/audio/AudioWorkspaceBridge.js",
      "video-editing/color/ColorWorkspaceBridge.js",
      "video-editing/edit/transitions/VideoTransitionsWorkspaceBridge.js",
      "video-editing/Effects/VideoEffectsWorkspaceBridge.js",
      "video-editing/project/VideoProjectWorkspaceBridge.js",
      "video-editing/export/VideoDeliverWorkspaceBridge.js",
      // =================================================================
      // FINAL APPLICATION BOOTSTRAP
      // =================================================================
      "index.js",
    ],
  };
  const loadedPhases = new Set();
  const completedPhases = new Set();
  const pendingPhases = new Map();
  const AMMO_CDN = "https://cdn.jsdelivr.net/npm/ammo.js@0.0.10/ammo.js";
  const AMMO_FALLBACK = "libs/ammo.js";
  function escapeAttribute(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function scriptTag(src) {
    return '<script src="' + escapeAttribute(src) + '"><\/script>';
  }
  function completionTag(phase) {
    return (
      "<script>window.SMEngineScripts&&window.SMEngineScripts._phaseComplete(" +
      JSON.stringify(phase) +
      ");<\/script>"
    );
  }
  function ammoFallbackTag() {
    const code =
      "if(typeof window.Ammo==='undefined'){document.write('<script src=\\\"" +
      AMMO_FALLBACK +
      "\\\"><\\\\/script>');}";
    return "<script>" + code + "<\/script>";
  }
  function parserLoad(phase, list) {
    let markup = "";
    for (const src of list) {
      markup += scriptTag(src);
      if (src === AMMO_CDN) markup += ammoFallbackTag();
    }
    markup += completionTag(phase);
    document.write(markup);
  }
  function appendScript(src) {
    return new Promise((resolve) => {
      const element = document.createElement("script");
      element.src = src;
      element.async = false;
      element.onload = () => resolve({ src, ok: true });
      element.onerror = () => {
        console.error("[SMEngineScripts] Failed to load:", src);
        resolve({ src, ok: false });
      };
      (document.head || document.body || document.documentElement).appendChild(
        element,
      );
    });
  }
  async function asyncLoad(phase, list) {
    for (const src of list) {
      const result = await appendScript(src);
      if (
        src === AMMO_CDN &&
        (!result.ok || typeof window.Ammo === "undefined")
      ) {
        await appendScript(AMMO_FALLBACK);
      }
    }
    api._phaseComplete(phase);
  }
  function loadPhase(phase) {
    const key = String(phase || "");
    const list = PHASES[key];
    if (!list) throw new Error("[SMEngineScripts] Unknown phase: " + key);
    if (completedPhases.has(key)) return Promise.resolve(true);
    if (pendingPhases.has(key)) return pendingPhases.get(key);
    loadedPhases.add(key);
    if (document.readyState === "loading") {
      let resolvePhase;
      const promise = new Promise((resolve) => {
        resolvePhase = resolve;
      });
      pendingPhases.set(key, promise);
      api._phaseResolvers.set(key, resolvePhase);
      parserLoad(key, list);
      return promise;
    }
    const promise = asyncLoad(key, list).then(() => true);
    pendingPhases.set(key, promise);
    return promise;
  }
  const api = {
    phases: PHASES,
    phaseOrder: PHASE_ORDER,
    _phaseResolvers: new Map(),
    loadPhase,
    loadAll: async function () {
      for (const phase of PHASE_ORDER) await loadPhase(phase);
      return true;
    },
    isLoaded: function (phase) {
      return completedPhases.has(String(phase));
    },
    getManifest: function () {
      return JSON.parse(JSON.stringify(PHASES));
    },
    getStats: function () {
      return {
        total: Object.values(PHASES).reduce(
          (sum, list) => sum + list.length,
          0,
        ),
        head: PHASES.head.length,
        ammo: PHASES.ammo.length,
        app: PHASES.app.length,
        loaded: Array.from(completedPhases),
      };
    },
    _phaseComplete: function (phase) {
      const key = String(phase);
      completedPhases.add(key);
      const resolver = api._phaseResolvers.get(key);
      if (resolver) {
        resolver(true);
        api._phaseResolvers.delete(key);
      }
      pendingPhases.delete(key);
      window.dispatchEvent(
        new CustomEvent("sm:scripts-phase-loaded", {
          detail: {
            phase: key,
            count: PHASES[key]?.length || 0,
          },
        }),
      );
      return true;
    },
  };
  window.SMEngineScripts = api;
  const current = document.currentScript;
  const initialPhase = current?.dataset?.smPhase;
  if (initialPhase) loadPhase(initialPhase);
})();
