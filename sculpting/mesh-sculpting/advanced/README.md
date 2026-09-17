# Advanced Mesh Sculpt

This folder is the mesh sculpting workspace. It operates only on ordinary `THREE.Mesh` geometry and does not import, update, or depend on `sculpting/terrain-sculpting/`.

## Included

- High-density sculpt sphere starter and selected-mesh activation.
- Draw, clay, inflate, smooth, flatten, scrape, pinch, grab, snake hook, crease, expand, and mask brushes.
- Pressure-style radius/strength/falloff controls, falloff profiles, mirror symmetry, isolate mode, and live brush cursor.
- Seam-safe edits for duplicated UV/hard-normal vertices.
- Full geometry snapshots for undo/redo, including mask data and topology changes.
- `Refine ×4`, uniform remesh/relax, mask extraction, and source-geometry revert.
- Memory-aware history limits for dense meshes.

## Structure

- `core/SMAdvancedSculptBrushEngine.js` — brush kernels, welded seams, spatial lookup.
- `core/SMAdvancedSculptHistory.js` — mesh and mask history.
- `topology/SMAdvancedSculptTopology.js` — refinement, uniform remesh, relaxation.
- `SMAdvancedMeshSculptWorkspace.js` — viewport ownership and mesh session lifecycle.
- `ui/SMAdvancedMeshSculptPanel.js` and `ui/advanced-mesh-sculpt.css` — inspector panel.

Terrain tools stay under `sculpting/terrain-sculpting/` and are deliberately not changed by this workspace.
