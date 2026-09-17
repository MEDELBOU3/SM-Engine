# engine/importers/blender/scripts/export_sm.py
# SM Engine — Blender headless exporter.
#
# Called by:
#   blender --background --disable-autoexec file.blend \
#       --python export_sm.py -- \
#       --output scene.glb --metadata metadata.json
#
# This script intentionally exports to GLB because glTF is the runtime exchange
# format; the original .blend remains the source asset.

import argparse
import datetime
import json
import math
import os
import sys
import traceback

import bpy


FORMAT_NAME = "SM_BLENDER_IMPORT_METADATA"
FORMAT_VERSION = 2


# The glTF exporter remains the authority for pixels and GPU-ready materials.
# These names are exported as metadata as well so SM Engine can rebuild native
# material assets, show useful diagnostics, and bind declarative UI controls.
PRINCIPLED_TEXTURE_SOCKETS = (
    (("Base Color",), "baseColor", True),
    (("Metallic",), "metallic", False),
    (("Roughness",), "roughness", False),
    (("Alpha",), "alpha", False),
    (("Normal",), "normal", False),
    (("Emission Color", "Emission"), "emissive", True),
    (("Coat Weight", "Clearcoat"), "clearcoat", False),
    (("Coat Roughness", "Clearcoat Roughness"), "clearcoatRoughness", False),
    (("Coat Normal", "Clearcoat Normal"), "clearcoatNormal", False),
    (("Transmission Weight", "Transmission"), "transmission", False),
    (("Specular IOR Level", "Specular"), "specular", False),
    (("Sheen Weight", "Sheen"), "sheen", False),
    (("Anisotropic IOR Level", "Anisotropic"), "anisotropy", False)
)


def _argv_after_double_dash():
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1:]


def _bool_arg(value):
    return str(value).strip().lower() not in ("0", "false", "no", "off")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Export Blender scene for SM Engine"
    )
    parser.add_argument("--output", required=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--apply-modifiers", default="1")
    parser.add_argument("--animations", default="1")
    parser.add_argument("--cameras", default="1")
    parser.add_argument("--lights", default="1")
    return parser.parse_args(_argv_after_double_dash())


def json_safe(value):
    if value is None:
        return None

    if isinstance(value, (bool, int, float, str)):
        if isinstance(value, float):
            if math.isnan(value) or math.isinf(value):
                return 0.0
        return value

    if isinstance(value, dict):
        return {
            str(k): json_safe(v)
            for k, v in value.items()
        }

    # Blender IDPropertyGroup is mapping-like but does not inherit dict.
    try:
        keys = value.keys()
        return {
            str(key): json_safe(value[key])
            for key in keys
        }
    except Exception:
        pass

    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]

    # Blender math types and ID property arrays are usually iterable.
    try:
        return [json_safe(v) for v in value]
    except Exception:
        return str(value)


def custom_properties(id_block):
    result = {}

    if not id_block:
        return result

    try:
        keys = id_block.keys()
    except Exception:
        return result

    for key in keys:
        if key == "_RNA_UI":
            continue

        try:
            result[str(key)] = json_safe(id_block[key])
        except Exception:
            pass

    return result


def socket_by_names(node, names):
    if not node:
        return None

    for name in names:
        try:
            socket = node.inputs.get(name)
        except Exception:
            socket = None
        if socket:
            return socket

    return None


def socket_default(node, names, fallback=None):
    socket = socket_by_names(node, names)
    if not socket:
        return fallback

    try:
        return json_safe(socket.default_value)
    except Exception:
        return fallback


def active_principled_node(material):
    if not material or not material.use_nodes or not material.node_tree:
        return None

    nodes = material.node_tree.nodes
    outputs = [
        node for node in nodes
        if node.type == "OUTPUT_MATERIAL"
        and getattr(node, "is_active_output", True)
    ]

    for output in outputs:
        surface = socket_by_names(output, ("Surface",))
        for link in getattr(surface, "links", []):
            if getattr(link.from_node, "type", "") == "BSDF_PRINCIPLED":
                return link.from_node

    return next(
        (node for node in nodes if node.type == "BSDF_PRINCIPLED"),
        None
    )


def upstream_node(socket, wanted_types, visited=None, depth=0):
    if not socket or depth > 20:
        return None

    visited = visited or set()

    for link in getattr(socket, "links", []):
        node = getattr(link, "from_node", None)
        if not node:
            continue

        node_key = id(node)
        if node_key in visited:
            continue
        visited.add(node_key)

        if node.type in wanted_types:
            return node

        for input_socket in getattr(node, "inputs", []):
            found = upstream_node(
                input_socket,
                wanted_types,
                visited,
                depth + 1
            )
            if found:
                return found

    return None


def image_mime_type(image):
    image_format = str(getattr(image, "file_format", "") or "").upper()
    return {
        "JPEG": "image/jpeg",
        "JPG": "image/jpeg",
        "WEBP": "image/webp",
        "BMP": "image/bmp",
        "TARGA": "image/tga",
        "TARGA_RAW": "image/tga",
        "OPEN_EXR": "image/x-exr",
        "HDR": "image/vnd.radiance",
        "TIFF": "image/tiff"
    }.get(image_format, "image/png")


def image_record(image):
    if not image:
        return None

    raw_path = str(getattr(image, "filepath_raw", "") or "")
    absolute_path = ""
    relative_path = raw_path

    if raw_path:
        try:
            absolute_path = bpy.path.abspath(raw_path)
        except Exception:
            absolute_path = raw_path

        blend_dir = os.path.dirname(bpy.data.filepath or "")
        if blend_dir and absolute_path:
            try:
                relative_path = os.path.relpath(absolute_path, blend_dir)
            except Exception:
                pass

    packed = bool(
        getattr(image, "packed_file", None)
        or getattr(image, "packed_files", None)
    )
    size = list(getattr(image, "size", [0, 0]))

    return {
        "name": image.name,
        "source": str(getattr(image, "source", "FILE")),
        "filepath": raw_path or None,
        "relativePath": relative_path or None,
        "absolutePath": absolute_path or None,
        "packed": packed,
        "mimeType": image_mime_type(image),
        "width": int(size[0]) if len(size) > 0 else 0,
        "height": int(size[1]) if len(size) > 1 else 0,
        "colorspace": str(
            getattr(getattr(image, "colorspace_settings", None), "name", "")
            or ""
        ),
        "alphaMode": str(getattr(image, "alpha_mode", "STRAIGHT")),
        "channels": int(getattr(image, "channels", 0) or 0),
        "fileFormat": str(getattr(image, "file_format", "") or "")
    }


def texture_transform_record(image_node):
    result = {
        "extension": str(getattr(image_node, "extension", "REPEAT")),
        "interpolation": str(getattr(image_node, "interpolation", "Linear")),
        "projection": str(getattr(image_node, "projection", "FLAT")),
        "uvMap": None,
        "offset": [0.0, 0.0],
        "scale": [1.0, 1.0],
        "rotation": 0.0
    }

    vector_socket = socket_by_names(image_node, ("Vector",))
    uv_node = upstream_node(vector_socket, {"UVMAP"})
    if uv_node:
        result["uvMap"] = str(getattr(uv_node, "uv_map", "") or "") or None

    mapping = upstream_node(vector_socket, {"MAPPING"})
    if mapping:
        location = socket_default(mapping, ("Location",), [0.0, 0.0, 0.0])
        scale = socket_default(mapping, ("Scale",), [1.0, 1.0, 1.0])
        rotation = socket_default(mapping, ("Rotation",), [0.0, 0.0, 0.0])
        result["offset"] = [float(location[0]), float(location[1])]
        result["scale"] = [float(scale[0]), float(scale[1])]
        result["rotation"] = float(rotation[2])

    return result


def texture_record(image_node, semantic, color_texture, socket_name=None):
    image = getattr(image_node, "image", None)
    if not image:
        return None

    return {
        "name": image_node.name,
        "label": image_node.label or image.name,
        "semantic": semantic,
        "socket": socket_name,
        "colorTexture": bool(color_texture),
        "image": image_record(image),
        "transform": texture_transform_record(image_node),
        "customProperties": custom_properties(image_node)
    }


def material_texture_records(material, principled):
    if not material or not material.use_nodes or not material.node_tree:
        return []

    records = []
    mapped_nodes = set()

    for socket_names, semantic, color_texture in PRINCIPLED_TEXTURE_SOCKETS:
        socket = socket_by_names(principled, socket_names)
        image_node = upstream_node(socket, {"TEX_IMAGE"})
        if not image_node:
            continue

        record = texture_record(
            image_node,
            semantic,
            color_texture,
            socket.name if socket else socket_names[0]
        )
        if record:
            records.append(record)
            mapped_nodes.add(id(image_node))

    # Preserve image nodes not connected to the active Principled shader. They
    # are useful to the asset browser even when glTF cannot bind them directly.
    for node in material.node_tree.nodes:
        if node.type != "TEX_IMAGE" or id(node) in mapped_nodes:
            continue
        record = texture_record(node, "unmapped", False)
        if record:
            records.append(record)

    return records


def parse_json_value(value):
    safe = json_safe(value)
    if not isinstance(safe, str):
        return safe

    try:
        return json.loads(safe)
    except Exception:
        return None


def collect_ui_panels(scene):
    """Collect only declarative UI; Blender/Python code is never exported."""
    panels = []

    def append_payload(payload, source, target=None):
        parsed = parse_json_value(payload)
        if parsed is None:
            return

        candidates = parsed.get("panels", []) if isinstance(parsed, dict) and isinstance(parsed.get("panels"), list) else parsed
        if not isinstance(candidates, list):
            candidates = [candidates]

        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            record = dict(candidate)
            record.setdefault("source", source)
            if target:
                record.setdefault("target", target)
            panels.append(json_safe(record))

    owners = [(scene, "scene", None)]
    if scene.world:
        owners.append((scene.world, "world", None))
    owners.extend((obj, "object", obj.name) for obj in scene.objects)

    for owner, source, target in owners:
        properties = custom_properties(owner)
        for key in ("sm_ui_panels", "sm_engine_ui", "sm_ui_panel"):
            if key in properties:
                append_payload(properties[key], source, target)

    for text in bpy.data.texts:
        name = str(text.name or "")
        lowered = name.lower()
        if not (lowered.startswith("sm_ui") or lowered.startswith("sm-engine-ui")):
            continue
        try:
            append_payload(text.as_string(), "text:" + name)
        except Exception:
            pass

    return panels


def vec(value):
    return [
        float(value[0]),
        float(value[1]),
        float(value[2])
    ]


def quat(value):
    return [
        float(value[0]),
        float(value[1]),
        float(value[2]),
        float(value[3])
    ]


def transform_record(obj):
    return {
        "location": vec(obj.location),
        "rotationMode": obj.rotation_mode,
        "rotationEuler": vec(obj.rotation_euler),
        "rotationQuaternion": quat(obj.rotation_quaternion),
        "scale": vec(obj.scale),
        "matrixWorld": [
            [float(v) for v in row]
            for row in obj.matrix_world
        ]
    }


def mesh_record(obj):
    mesh = obj.data if obj.type == "MESH" else None
    if not mesh:
        return None

    triangles = 0
    try:
        mesh.calc_loop_triangles()
        triangles = len(mesh.loop_triangles)
    except Exception:
        pass

    return {
        "name": mesh.name,
        "vertices": len(mesh.vertices),
        "edges": len(mesh.edges),
        "polygons": len(mesh.polygons),
        "triangles": triangles,
        "uvLayers": [layer.name for layer in mesh.uv_layers],
        "colorAttributes": [
            layer.name
            for layer in getattr(mesh, "color_attributes", [])
        ],
        "shapeKeys": (
            [
                block.name
                for block in mesh.shape_keys.key_blocks
            ]
            if mesh.shape_keys
            else []
        )
    }


def armature_record(obj):
    if obj.type != "ARMATURE":
        return None

    arm = obj.data

    return {
        "name": arm.name,
        "bones": [
            {
                "name": bone.name,
                "parent": bone.parent.name if bone.parent else None,
                "useDeform": bool(bone.use_deform)
            }
            for bone in arm.bones
        ]
    }


def animation_record(obj):
    data = obj.animation_data

    if not data:
        return None

    action = getattr(data, "action", None)

    return {
        "action": action.name if action else None,
        "nlaTracks": [
            {
                "name": track.name,
                "muted": bool(track.mute),
                "strips": [
                    {
                        "name": strip.name,
                        "action": (
                            strip.action.name
                            if strip.action
                            else None
                        ),
                        "frameStart": float(strip.frame_start),
                        "frameEnd": float(strip.frame_end)
                    }
                    for strip in track.strips
                ]
            }
            for track in data.nla_tracks
        ]
    }


def camera_record(obj):
    if obj.type != "CAMERA":
        return None

    camera = obj.data

    return {
        "name": camera.name,
        "type": camera.type,
        "lens": float(camera.lens),
        "sensorWidth": float(camera.sensor_width),
        "clipStart": float(camera.clip_start),
        "clipEnd": float(camera.clip_end),
        "orthoScale": float(camera.ortho_scale)
    }


def light_record(obj):
    if obj.type != "LIGHT":
        return None

    light = obj.data

    return {
        "name": light.name,
        "type": light.type,
        "energy": float(light.energy),
        "color": [
            float(light.color.r),
            float(light.color.g),
            float(light.color.b)
        ],
        "shadowSoftSize": float(
            getattr(light, "shadow_soft_size", 0.0)
        ),
        "spotSize": float(
            getattr(light, "spot_size", 0.0)
        ),
        "spotBlend": float(
            getattr(light, "spot_blend", 0.0)
        )
    }


def object_record(obj):
    return {
        "name": obj.name,
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "collections": [
            collection.name
            for collection in obj.users_collection
        ],
        "materials": [
            slot.material.name
            for slot in obj.material_slots
            if slot.material
        ],
        "modifiers": [
            {
                "name": modifier.name,
                "type": modifier.type,
                "showViewport": bool(modifier.show_viewport),
                "showRender": bool(modifier.show_render)
            }
            for modifier in obj.modifiers
        ],
        "customProperties": custom_properties(obj),
        "transform": transform_record(obj),
        "mesh": mesh_record(obj),
        "armature": armature_record(obj),
        "animation": animation_record(obj),
        "camera": camera_record(obj),
        "light": light_record(obj)
    }


def material_record(material):
    principled = active_principled_node(material)
    textures = material_texture_records(material, principled)
    normal_node = upstream_node(
        socket_by_names(principled, ("Normal",)),
        {"NORMAL_MAP", "BUMP"}
    )
    normal_strength = socket_default(
        normal_node,
        ("Strength",),
        1.0
    )

    base_color = socket_default(
        principled,
        ("Base Color",),
        json_safe(getattr(material, "diffuse_color", [1.0, 1.0, 1.0, 1.0]))
    )
    emissive = socket_default(
        principled,
        ("Emission Color", "Emission"),
        [0.0, 0.0, 0.0, 1.0]
    )

    return {
        "name": material.name,
        "useNodes": bool(material.use_nodes),
        "blendMethod": str(
            getattr(material, "surface_render_method", None)
            or getattr(material, "blend_method", "OPAQUE")
        ),
        "doubleSided": not bool(
            getattr(material, "use_backface_culling", False)
        ),
        "alphaThreshold": float(getattr(material, "alpha_threshold", 0.5)),
        "diffuseColor": json_safe(
            getattr(material, "diffuse_color", [1.0, 1.0, 1.0, 1.0])
        ),
        "pbr": {
            "baseColor": base_color,
            "metallic": socket_default(principled, ("Metallic",), 0.0),
            "roughness": socket_default(principled, ("Roughness",), 0.5),
            "alpha": socket_default(principled, ("Alpha",), 1.0),
            "emissive": emissive,
            "emissiveStrength": socket_default(
                principled,
                ("Emission Strength",),
                1.0
            ),
            "normalStrength": normal_strength,
            "ior": socket_default(principled, ("IOR",), 1.5),
            "transmission": socket_default(
                principled,
                ("Transmission Weight", "Transmission"),
                0.0
            ),
            "clearcoat": socket_default(
                principled,
                ("Coat Weight", "Clearcoat"),
                0.0
            ),
            "clearcoatRoughness": socket_default(
                principled,
                ("Coat Roughness", "Clearcoat Roughness"),
                0.0
            ),
            "specular": socket_default(
                principled,
                ("Specular IOR Level", "Specular"),
                0.5
            ),
            "sheen": socket_default(
                principled,
                ("Sheen Weight", "Sheen"),
                0.0
            ),
            "anisotropy": socket_default(
                principled,
                ("Anisotropic IOR Level", "Anisotropic"),
                0.0
            )
        },
        "textures": textures,
        "customProperties": custom_properties(material),
        "nodeSummary": (
            [
                {
                    "name": node.name,
                    "label": node.label,
                    "type": node.type
                }
                for node in material.node_tree.nodes
            ]
            if material.use_nodes and material.node_tree
            else []
        )
    }


def action_record(action):
    frame_start, frame_end = action.frame_range

    return {
        "name": action.name,
        "frameStart": float(frame_start),
        "frameEnd": float(frame_end),
        "fcurves": len(getattr(action, "fcurves", []))
    }


def scene_metadata():
    scene = bpy.context.scene

    units = scene.unit_settings

    materials = [
        material_record(material)
        for material in bpy.data.materials
    ]
    images_by_name = {}
    for material in materials:
        for texture in material.get("textures", []):
            image = texture.get("image")
            if image and image.get("name"):
                images_by_name[image["name"]] = image

    return {
        "format": FORMAT_NAME,
        "version": FORMAT_VERSION,
        "blenderVersion": bpy.app.version_string,
        "source": bpy.data.filepath or None,
        "exportedAt": (
            datetime.datetime.utcnow()
            .replace(microsecond=0)
            .isoformat() + "Z"
        ),
        "scene": {
            "name": scene.name,
            "frameStart": int(scene.frame_start),
            "frameEnd": int(scene.frame_end),
            "frameCurrent": int(scene.frame_current),
            "fps": float(scene.render.fps),
            "unitSystem": units.system,
            "unitScale": float(units.scale_length),
            "gravity": vec(scene.gravity),
            "customProperties": custom_properties(scene)
        },
        "collections": [
            {
                "name": collection.name,
                "objects": [
                    obj.name
                    for obj in collection.objects
                ],
                "children": [
                    child.name
                    for child in collection.children
                ]
            }
            for collection in bpy.data.collections
        ],
        "materials": materials,
        "images": list(images_by_name.values()),
        "uiPanels": collect_ui_panels(scene),
        "actions": [
            action_record(action)
            for action in bpy.data.actions
        ],
        "objects": [
            object_record(obj)
            for obj in scene.objects
        ]
    }


def supported_operator_kwargs(operator, kwargs):
    """
    Blender changes glTF exporter arguments between versions.
    Filter kwargs against the operator RNA schema instead of hard-failing.
    """
    try:
        properties = operator.get_rna_type().properties
        allowed = {
            prop.identifier
            for prop in properties
        }
        return {
            key: value
            for key, value in kwargs.items()
            if key in allowed
        }
    except Exception:
        return kwargs


def export_glb(
    output_path,
    apply_modifiers=True,
    export_animations=True,
    export_cameras=True,
    export_lights=True
):
    os.makedirs(
        os.path.dirname(output_path),
        exist_ok=True
    )

    kwargs = {
        "filepath": output_path,
        "export_format": "GLB",
        "use_selection": False,
        "export_apply": bool(apply_modifiers),
        "export_animations": bool(export_animations),
        "export_cameras": bool(export_cameras),
        "export_lights": bool(export_lights),
        "export_yup": True,
        "export_texcoords": True,
        "export_normals": True,
        "export_tangents": True,
        "export_materials": "EXPORT",
        "export_image_format": "AUTO",
        "export_jpeg_quality": 95,
        "export_colors": True,
        "export_skins": True,
        "export_morph": True,
        "export_extras": True,
        "export_try_sparse_sk": True
    }

    filtered = supported_operator_kwargs(
        bpy.ops.export_scene.gltf,
        kwargs
    )

    result = bpy.ops.export_scene.gltf(
        **filtered
    )

    if "FINISHED" not in result:
        raise RuntimeError(
            "Blender glTF exporter did not finish successfully."
        )


def write_json(path, data):
    os.makedirs(
        os.path.dirname(path),
        exist_ok=True
    )

    with open(
        path,
        "w",
        encoding="utf-8"
    ) as handle:
        json.dump(
            data,
            handle,
            indent=2,
            ensure_ascii=False
        )


def main():
    args = parse_args()

    output_path = os.path.abspath(args.output)
    metadata_path = os.path.abspath(args.metadata)

    metadata = scene_metadata()

    write_json(
        metadata_path,
        metadata
    )

    export_glb(
        output_path,
        apply_modifiers=_bool_arg(
            args.apply_modifiers
        ),
        export_animations=_bool_arg(
            args.animations
        ),
        export_cameras=_bool_arg(
            args.cameras
        ),
        export_lights=_bool_arg(
            args.lights
        )
    )

    print(
        "[SM Blender Export] COMPLETE"
    )
    print(
        json.dumps(
            {
                "output": output_path,
                "metadata": metadata_path,
                "objects": len(metadata["objects"]),
                "materials": len(metadata["materials"]),
                "actions": len(metadata["actions"])
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(
            "[SM Blender Export] FAILED",
            file=sys.stderr
        )
        traceback.print_exc()
        sys.exit(1)
