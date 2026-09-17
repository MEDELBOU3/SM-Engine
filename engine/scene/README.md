# SM Engine World / Scene Architecture

This folder contains the editor-facing scene architecture. It does not create
a second transform graph: the live `THREE.Object3D` hierarchy remains the
spatial source of truth, while `SMEntity` provides stable identity, metadata,
queries, lifecycle operations, and component access around each object.

## Ownership

- `window.scene` owns the live Three.js object graph and all local/world
  transforms.
- `window.smSceneManager` owns entity identity and indices. Every authored
  `Object3D` is registered as exactly one `SMEntity`.
- `object.components` (`SMComponentContainer`) owns runtime components. Its
  serialized descriptors are mirrored in `object.userData.components` for
  compatibility with old editor and scripting code.
- `SMWorldSceneSerializer` owns the canonical `SM_WORLD_SCENE` save format.
- Existing terrain, water, player, animation, physics, audio, and asset systems
  continue to own their specialized runtime data. The scene serializer records
  their authoring references rather than replacing those systems.

Legacy `window.objects`, `addObjectToScene`, `removeObjectFromScene`, and
`ScenePersistenceManager` remain as adapters. They delegate to the manager and
must not be treated as independent entity stores.

## Core API

```js
const entity = smSceneManager.createEntity({
  name: 'Crate',
  object: new THREE.Mesh(geometry, material),
  tags: ['interactable'],
  layer: 'Gameplay',
  category: 'Mesh'
});

entity.addComponent('SMCustomComponent', {
  customType: 'Breakable',
  properties: { health: 100 }
});

const same = findEntityById(entity.id);
const tagged = queryEntities({ tag: 'interactable', active: true });
reparentEntity(entity, parentEntity, { preserveWorld: true });
const copy = duplicateEntity(entity);
destroyEntity(copy);
```

All mutations emit manager events and `sm:scene-*` DOM events so the Outliner,
Inspector, autosave/project state, diagnostics, physics, and runtime registry
can refresh without polling. `active` controls component/runtime execution;
`visible` controls rendering. They are intentionally separate.

## Components

Native object features appear as read-only architecture components:

- `Transform` — backed directly by Object3D local/world matrices.
- `MeshRenderer`, `Camera`, `Light` — backed by native Three.js objects.
- `Physics`, `Collider`, `Script`, `Animator`, `Terrain`, `Water`, and `Player`
  — adapters over their existing subsystem authoring data.
- Runtime components — constructed by `SMComponentRegistry` and stored in an
  `SMComponentContainer`.
- `SMCustomComponent` — serializable user-defined data for scripts and future
  plugin component types.

Register a component class through `SMComponentRegistry.register(type, ctor,
metadata)`. The Inspector component picker discovers registry entries
automatically. Component instances should keep serializable authoring values in
their own `serialize()` output and use lifecycle hooks (`onAttach`, `onEnable`,
`update`, `onDisable`, `onDetach`) for behavior.

## Scene format

`SM_WORLD_SCENE` version 1 stores flat entity records:

- stable entity ID, name, parent ID, sibling order;
- active/visible/static flags, tags, layer/category and metadata;
- native local transform plus an informational world transform;
- component descriptors;
- an Object3D/prefab-style node descriptor;
- asset references and a dependency manifest.

The flat layout restores parents in a second pass, so forward references and
arbitrary hierarchy depth are safe. Primitive geometry and referenced assets
remain compact. Unreferenced procedural `BufferGeometry` gets an inline fallback
so save/load does not silently lose custom meshes.

```js
const payload = smSceneManager.serialize();
await smSceneManager.load(payload, { clearExisting: true });
```

Project scene capture is version 2 and delegates to this format. Version 1
project captures and old `ScenePersistenceManager` data still load through
explicit migration paths.

## Editor and runtime boundary

The manager exists during editing and play. Entering play mode still creates the
runtime world, whose object registry uses the same stable entity IDs. Editor
helpers and runtime-owned objects are marked non-serializable/system objects.
Prefab serialization uses the same component and resource descriptors, which
keeps the architecture ready for reusable prefab assets and per-instance
overrides without requiring a hierarchy rewrite.

## Rules for new features

1. Add/remove/rename/reparent authored objects through `smSceneManager`.
2. Never copy Object3D transforms into a second mutable transform model.
3. Put reusable behavior in a registered component, not in an Outliner row.
4. Store large resources in the asset system and serialize references.
5. Mark temporary helpers with `isSystemObject`, `isEditorHelper`,
   `runtimeOwned`, or `projectSerializable: false`.
6. Listen for manager/DOM events instead of scanning the scene every frame.

## Verification

Run the focused architecture regression test from the repository root:

```powershell
node tests/scene-architecture.test.js
```

It covers stable identity, hierarchy, component attachment, duplication,
world-preserving reparent, canonical round-trip serialization, project v2, and
legacy project v1 loading.
