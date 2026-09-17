using CUE4Parse.UE4.Assets.Exports.StaticMesh;
using CUE4Parse_Conversion.Dto;
using CUE4Parse_Conversion.Options;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge;

public static class UnrealMeshExtractor
{
    public static (UnrealMeshData? MeshData, UnrealDiagnosticError? Diagnostic) ExtractStaticMesh(
        UStaticMesh staticMesh,
        string packagePath)
    {
        StaticMeshDto dto;
        try
        {
            dto = new StaticMeshDto(staticMesh, EMeshQuality.Highest, ENaniteMeshFormat.NaniteFirst, null);
        }
        catch (Exception ex)
        {
            return (null, UnrealDiagnostics.PackageParseFailed(packagePath, $"Failed to extract StaticMesh DTO: {ex.Message}"));
        }

        var meshData = new UnrealMeshData
        {
            Type = "static-mesh",
            Name = staticMesh.Name,
            Path = packagePath
        };

        // Extract bounds
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

        // Extract Material Slots
        if (dto.Materials != null)
        {
            var matExtractor = new Extractors.UnrealMaterialExtractor();
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

                CUE4Parse.UE4.Assets.Exports.Material.UUnrealMaterial? unrealMat = null;
                if (mat.Material.ResolvedObject?.Object?.Value is CUE4Parse.UE4.Assets.Exports.Material.UUnrealMaterial um)
                {
                    unrealMat = um;
                }
                else if (staticMesh.StaticMaterials != null && i < staticMesh.StaticMaterials.Length)
                {
                    unrealMat = staticMesh.StaticMaterials[i].MaterialInterface.ResolvedObject?.Object?.Value as CUE4Parse.UE4.Assets.Exports.Material.UUnrealMaterial;
                }

                var matDetail = matExtractor.Extract(unrealMat, i, slotName);
                if (string.IsNullOrEmpty(matDetail.VirtualPath) && !string.IsNullOrEmpty(matPath))
                {
                    matDetail.VirtualPath = matPath;
                }
                meshData.MaterialDetails.Add(matDetail);
            }
        }

        // Check LODs & Nanite
        if (dto.LODs == null || dto.LODs.Count == 0)
        {
            meshData.IsNaniteOnly = true;
            return (null, UnrealDiagnostics.NaniteOnlyAsset(staticMesh.Name));
        }

        bool hasRenderableLOD = false;
        bool naniteFallbackUsed = false;

        for (int l = 0; l < dto.LODs.Count; l++)
        {
            var rawLod = dto.LODs[l] as MeshLodDto<MeshVertex>;
            if (rawLod == null) continue;

            if (rawLod.IsNanite)
            {
                naniteFallbackUsed = true;
            }

            if (rawLod.Vertices == null || rawLod.Vertices.Length == 0 ||
                rawLod.Indices == null || rawLod.Indices.Length == 0)
            {
                continue;
            }

            hasRenderableLOD = true;
            var vertexCount = rawLod.Vertices.Length;
            var positions = new float[vertexCount * 3];
            var normals = new float[vertexCount * 3];
            var tangents = new float[vertexCount * 3];
            var uvs = new float[vertexCount * 2];

            for (int v = 0; v < vertexCount; v++)
            {
                var vert = rawLod.Vertices[v];
                var v3 = v * 3;
                var v2 = v * 2;

                positions[v3] = vert.Position.X;
                positions[v3 + 1] = vert.Position.Y;
                positions[v3 + 2] = vert.Position.Z;

                normals[v3] = vert.Normal.X;
                normals[v3 + 1] = vert.Normal.Y;
                normals[v3 + 2] = vert.Normal.Z;

                tangents[v3] = vert.Tangent.X;
                tangents[v3 + 1] = vert.Tangent.Y;
                tangents[v3 + 2] = vert.Tangent.Z;

                uvs[v2] = vert.Uv.U;
                uvs[v2 + 1] = vert.Uv.V;
            }

            var sections = new List<UnrealMeshSection>();
            if (rawLod.Sections != null)
            {
                foreach (var sec in rawLod.Sections)
                {
                    sections.Add(new UnrealMeshSection
                    {
                        FirstIndex = (uint)Math.Max(0, sec.FirstIndex),
                        IndexCount = (uint)Math.Max(0, sec.NumFaces * 3),
                        MaterialIndex = sec.MaterialIndex,
                        MinVertexIndex = (uint)Math.Max(0, sec.FirstIndex),
                        MaxVertexIndex = (uint)Math.Max(0, sec.FirstIndex + sec.NumFaces * 3)
                    });
                }
            }

            var lodData = new UnrealMeshLodData
            {
                Level = l,
                VertexCount = vertexCount,
                IndexCount = rawLod.Indices.Length,
                Positions = positions,
                Normals = normals,
                Tangents = tangents,
                Indices = rawLod.Indices,
                Sections = sections
            };
            lodData.Uvs.Add(uvs);

            meshData.Lods.Add(lodData);
        }

        if (!hasRenderableLOD)
        {
            meshData.IsNaniteOnly = true;
            return (null, UnrealDiagnostics.NaniteOnlyAsset(staticMesh.Name));
        }

        meshData.NaniteFallbackUsed = naniteFallbackUsed;
        return (meshData, null);
    }
}
