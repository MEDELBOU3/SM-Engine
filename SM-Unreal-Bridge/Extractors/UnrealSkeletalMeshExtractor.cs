using CUE4Parse.UE4.Assets.Exports.SkeletalMesh;
using CUE4Parse_Conversion.Dto;
using CUE4Parse_Conversion.Options;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge.Extractors;

/// <summary>
/// Extracts skeletal mesh geometry, bone hierarchy, and skinning influences
/// from a CUE4Parse <see cref="USkeletalMesh"/> asset.
/// </summary>
public static class UnrealSkeletalMeshExtractor
{
    /// <summary>
    /// Converts a <see cref="USkeletalMesh"/> into an <see cref="UnrealSkeletalMeshData"/>
    /// ready for GLB export, or returns a structured diagnostic on failure.
    /// </summary>
    public static (UnrealSkeletalMeshData? MeshData, UnrealDiagnosticError? Diagnostic) ExtractSkeletalMesh(
        USkeletalMesh skeletalMesh,
        string packagePath)
    {
        // ── 1. Convert via CUE4Parse MeshConverter ──────────────────────────────
        SkeletalMeshDto dto;
        try
        {
            bool converted = CUE4Parse_Conversion.Meshes.MeshConverter.TryConvert(
                skeletalMesh,
                out dto,
                EMeshQuality.Highest);

            if (!converted)
            {
                return (null, UnrealDiagnostics.PackageParseFailed(
                    packagePath,
                    "MeshConverter.TryConvert returned false for SkeletalMesh."));
            }
        }
        catch (Exception ex)
        {
            return (null, UnrealDiagnostics.PackageParseFailed(
                packagePath,
                $"Failed to extract SkeletalMeshDto: {ex.Message}"));
        }

        var meshData = new UnrealSkeletalMeshData
        {
            Type = "skeletal-mesh",
            Name = skeletalMesh.Name,
            Path = packagePath,
            SkeletonName = dto.SkeletonName ?? dto.SkeletonPathName ?? ""
        };

        // ── 2. Bounds ────────────────────────────────────────────────────────────
        var box = dto.Bounds;
        var min = box.Min;
        var max = box.Max;
        var origin = (min + max) * 0.5f;
        var extent = (max - min) * 0.5f;
        meshData.Bounds = new UnrealMeshBounds
        {
            Origin = new[] { origin.X, origin.Y, origin.Z },
            BoxExtent = new[] { extent.X, extent.Y, extent.Z },
            SphereRadius = extent.Size()
        };

        // ── 3. Morph target count ────────────────────────────────────────────────
        meshData.MorphTargetCount = dto.MorphTargets?.Length ?? 0;

        // ── 4. Bone hierarchy ────────────────────────────────────────────────────
        if (dto.Bones != null)
        {
            for (int b = 0; b < dto.Bones.Length; b++)
            {
                var bone = dto.Bones[b];
                var t = bone.Transform;

                // FTransform components: Translation (FVector), Rotation (FQuat), Scale3D (FVector)
                meshData.Bones.Add(new UnrealBoneData
                {
                    Index = b,
                    Name = bone.Name ?? $"Bone_{b}",
                    ParentIndex = bone.ParentIndex,
                    Position = new[] { t.Translation.X, t.Translation.Y, t.Translation.Z },
                    Rotation = new[] { t.Rotation.X, t.Rotation.Y, t.Rotation.Z, t.Rotation.W },
                    Scale = new[] { t.Scale3D.X, t.Scale3D.Y, t.Scale3D.Z }
                });
            }
        }

        // ── 5. Material slots ────────────────────────────────────────────────────
        var matExtractor = new UnrealMaterialExtractor();
        if (dto.Materials != null)
        {
            for (int i = 0; i < dto.Materials.Length; i++)
            {
                var mat = dto.Materials[i];
                var slotName = mat.SlotName ?? $"Slot_{i}";
                var matPath = mat.Material.Name ?? mat.Material.ToString() ?? "";

                meshData.Materials.Add(new UnrealMaterialSlot
                {
                    Slot = i,
                    Name = slotName,
                    Path = matPath
                });

                // Try to resolve the actual UUnrealMaterial for PBR parameter extraction
                CUE4Parse.UE4.Assets.Exports.Material.UUnrealMaterial? unrealMat = null;
                if (mat.Material.ResolvedObject?.Object?.Value is
                    CUE4Parse.UE4.Assets.Exports.Material.UUnrealMaterial um)
                {
                    unrealMat = um;
                }
                // Fallback: check LODMaterials on the skeletal mesh itself
                else if (skeletalMesh.Materials != null && i < skeletalMesh.Materials.Length)
                {
                    unrealMat = skeletalMesh.Materials[i].Material?.ResolvedObject?.Object?.Value
                        as CUE4Parse.UE4.Assets.Exports.Material.UUnrealMaterial;
                }

                var matDetail = matExtractor.Extract(unrealMat, i, slotName);
                if (string.IsNullOrEmpty(matDetail.VirtualPath) && !string.IsNullOrEmpty(matPath))
                    matDetail.VirtualPath = matPath;

                meshData.MaterialDetails.Add(matDetail);
            }
        }

        // ── 6. LOD geometry ──────────────────────────────────────────────────────
        if (dto.LODs == null || dto.LODs.Count == 0)
        {
            return (null, UnrealDiagnostics.PackageParseFailed(
                packagePath,
                "SkeletalMesh has no LODs or LOD list is empty."));
        }

        bool hasRenderableLOD = false;

        for (int l = 0; l < dto.LODs.Count; l++)
        {
            if (dto.LODs[l] is not MeshLodDto<SkinnedMeshVertex> rawLod) continue;
            if (rawLod.Vertices == null || rawLod.Vertices.Length == 0 ||
                rawLod.Indices == null || rawLod.Indices.Length == 0)
            {
                continue;
            }

            hasRenderableLOD = true;
            var vertexCount = rawLod.Vertices.Length;

            var positions = new float[vertexCount * 3];
            var normals   = new float[vertexCount * 3];
            var tangents  = new float[vertexCount * 3];
            var uvs       = new float[vertexCount * 2];
            var influences = new List<UnrealBoneInfluence[]>(vertexCount);

            for (int v = 0; v < vertexCount; v++)
            {
                var vert = rawLod.Vertices[v];
                int v3 = v * 3;
                int v2 = v * 2;

                positions[v3]     = vert.Position.X;
                positions[v3 + 1] = vert.Position.Y;
                positions[v3 + 2] = vert.Position.Z;

                normals[v3]     = vert.Normal.X;
                normals[v3 + 1] = vert.Normal.Y;
                normals[v3 + 2] = vert.Normal.Z;

                tangents[v3]     = vert.Tangent.X;
                tangents[v3 + 1] = vert.Tangent.Y;
                tangents[v3 + 2] = vert.Tangent.Z;

                uvs[v2]     = vert.Uv.U;
                uvs[v2 + 1] = vert.Uv.V;

                // Bone influences — up to 4 entries per vertex
                var infl = vert.Influences;
                if (infl != null && infl.Length > 0)
                {
                    var boneInfluences = new UnrealBoneInfluence[infl.Length];
                    for (int bi = 0; bi < infl.Length; bi++)
                    {
                        boneInfluences[bi] = new UnrealBoneInfluence
                        {
                            BoneIndex = infl[bi].BoneIndex,
                            Weight    = infl[bi].Weight
                        };
                    }
                    influences.Add(boneInfluences);
                }
                else
                {
                    // Fallback: bind to root bone with full weight
                    influences.Add(new[] { new UnrealBoneInfluence { BoneIndex = 0, Weight = 1.0f } });
                }
            }

            // Sections
            var sections = new List<UnrealMeshSection>();
            if (rawLod.Sections != null)
            {
                foreach (var sec in rawLod.Sections)
                {
                    sections.Add(new UnrealMeshSection
                    {
                        FirstIndex    = (uint)Math.Max(0, sec.FirstIndex),
                        IndexCount    = (uint)Math.Max(0, sec.NumFaces * 3),
                        MaterialIndex = sec.MaterialIndex,
                        MinVertexIndex = (uint)Math.Max(0, sec.FirstIndex),
                        MaxVertexIndex = (uint)Math.Max(0, sec.FirstIndex + sec.NumFaces * 3)
                    });
                }
            }

            var lodData = new UnrealSkeletalLodData
            {
                Level       = l,
                VertexCount = vertexCount,
                IndexCount  = rawLod.Indices.Length,
                Positions   = positions,
                Normals     = normals,
                Tangents    = tangents,
                Indices     = rawLod.Indices,
                Sections    = sections,
                Influences  = influences
            };
            lodData.Uvs.Add(uvs);

            meshData.Lods.Add(lodData);
        }

        if (!hasRenderableLOD)
        {
            return (null, UnrealDiagnostics.PackageParseFailed(
                packagePath,
                "SkeletalMesh has no renderable LOD (all LODs are empty or malformed)."));
        }

        return (meshData, null);
    }
}
