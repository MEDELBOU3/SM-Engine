# Blender import contract

SM Engine keeps the `.blend` file as the source asset and asks Blender to export
a cached GLB for the viewport. GLB embeds supported images and preserves the
Principled BSDF material path. `export_sm.py` also writes metadata for material
assets, packed/external images, object properties, animation, and optional
viewport controls.

## Declarative viewport panels

Panels are data, never executable Python/HTML/JavaScript. Put JSON in either:

- a Scene, World, or Object custom property named `sm_ui_panels`,
  `sm_engine_ui`, or `sm_ui_panel`; or
- a Blender Text block whose name starts with `SM_UI` or `SM-ENGINE-UI`.

Example:

```json
{
  "panels": [
    {
      "id": "car-finish",
      "title": "Car Finish",
      "target": "CarBody",
      "placement": "top-right",
      "controls": [
        {
          "type": "slider",
          "label": "Roughness",
          "bind": "material.roughness",
          "min": 0,
          "max": 1,
          "step": 0.01
        },
        {
          "type": "color",
          "label": "Paint",
          "bind": "material.color"
        },
        {
          "type": "toggle",
          "label": "Visible",
          "bind": "visible"
        }
      ]
    }
  ]
}
```

Supported bindings are object visibility/transforms, an allowlist of PBR
material properties, and `userData.smControls.*` /
`userData.smBlender.customProperties.*`. Supported button actions are
`toggleVisibility`, `resetTransform`, `playAnimation`, and `stopAnimation`.
Anything else is imported disabled so a third-party `.blend` cannot execute
code in the editor.
