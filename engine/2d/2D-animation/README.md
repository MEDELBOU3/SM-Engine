# SM Engine 2D Animation

The 2D editor is split by responsibility. Runtime files use browser globals because the main editor currently loads scripts directly from `index.html`.

## Runtime layout

- `core/Animation2DManager.js` - drawing state, frames, layers, onion skins, brushes, camera and export.
- `core/Animation2DManagerAdvanced.js` - lighting, color, audio and advanced production features.
- `core/Anime2DWorkspace.js` - workspace lifecycle and Blender-style production controls.
- `viewport/` - 2D viewport, UV and 2D/3D integration helpers.
- `timeline/` - keyframe and curve editing.
- `rendering/` - anime line art, cel shading and post-processing.
- `storyboard/` - storyboard data, integration and panel handlers.
- `legacy/` - older hybrid sprite editor retained for compatibility.
- `examples/` - optional examples; not loaded by the editor.
- `docs/` - implementation and storyboard documentation.

## Script order

1. Legacy sprite compatibility.
2. Viewport helpers.
3. Base animation manager.
4. Timeline editor.
5. Advanced manager.
6. Anime rendering systems.
7. Storyboard systems.
8. Anime workspace controller.

Keep the base manager before the advanced manager because `Animation2DManagerAdvanced` extends `Animation2DManager`.