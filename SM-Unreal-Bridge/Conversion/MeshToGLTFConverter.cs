using System.Numerics;
using SharpGLTF.Geometry;
using SharpGLTF.Geometry.VertexTypes;
using SharpGLTF.Materials;
using SharpGLTF.Scenes;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge.Conversion;

public static class MeshToGLTFConverter
{
    public static byte[] ConvertToGLB(UnrealMeshData meshData, int lodIndex = 0)
    {
        if (meshData.Lods == null || meshData.Lods.Count == 0)
        {
            throw new InvalidOperationException("UnrealMeshData contains no LODs to convert.");
        }

        var lod = (lodIndex >= 0 && lodIndex < meshData.Lods.Count)
            ? meshData.Lods[lodIndex]
            : meshData.Lods[0];

        if (lod.Positions.Length == 0 || lod.Indices.Length == 0)
        {
            throw new InvalidOperationException("UnrealMeshLodData has empty positions or indices.");
        }

        var mesh = new MeshBuilder<VertexPositionNormal, VertexTexture1, VertexEmpty>(meshData.Name);
        var scene = new SceneBuilder();

        // Create materials dictionary for primitives
        var materials = new Dictionary<int, MaterialBuilder>();
        for (int i = 0; i < meshData.Materials.Count; i++)
        {
            var matSlot = meshData.Materials[i];
            var matDetail = (meshData.MaterialDetails != null && i < meshData.MaterialDetails.Count)
                ? meshData.MaterialDetails[i]
                : null;

            var matName = matSlot.Name ?? $"Material_{i}";
            var matBuilder = new MaterialBuilder(matName)
                .WithMetallicRoughnessShader();

            if (matDetail != null)
            {
                var baseColor = ParseHexToVector4(matDetail.BaseColorHex, matDetail.Opacity);
                matBuilder.WithBaseColor(baseColor);
                matBuilder.WithMetallicRoughness(matDetail.Metallic, matDetail.Roughness);
                matBuilder.WithDoubleSide(matDetail.TwoSided);

                if (!string.IsNullOrEmpty(matDetail.EmissiveColorHex) && matDetail.EmissiveColorHex != "#000000")
                {
                    var emColor = ParseHexToVector3(matDetail.EmissiveColorHex);
                    matBuilder.WithEmissive(emColor, 1.0f);
                }
            }

            materials[i] = matBuilder;
        }

        var defaultMat = new MaterialBuilder("DefaultMaterial").WithMetallicRoughnessShader();

        // If sections exist, create primitives per section
        if (lod.Sections.Count > 0)
        {
            foreach (var section in lod.Sections)
            {
                if (!materials.TryGetValue(section.MaterialIndex, out var mat))
                {
                    mat = defaultMat;
                }

                var prim = mesh.UsePrimitive(mat);
                var start = (int)section.FirstIndex;
                var count = (int)section.IndexCount;

                for (int i = 0; i < count; i += 3)
                {
                    if (start + i + 2 >= lod.Indices.Length) break;

                    var idx0 = (int)lod.Indices[start + i];
                    var idx1 = (int)lod.Indices[start + i + 1];
                    var idx2 = (int)lod.Indices[start + i + 2];

                    var v0 = BuildVertex(lod, idx0);
                    var v1 = BuildVertex(lod, idx1);
                    var v2 = BuildVertex(lod, idx2);

                    prim.AddTriangle(v0, v1, v2);
                }
            }
        }
        else
        {
            var prim = mesh.UsePrimitive(defaultMat);
            for (int i = 0; i < lod.Indices.Length; i += 3)
            {
                if (i + 2 >= lod.Indices.Length) break;

                var idx0 = (int)lod.Indices[i];
                var idx1 = (int)lod.Indices[i + 1];
                var idx2 = (int)lod.Indices[i + 2];

                var v0 = BuildVertex(lod, idx0);
                var v1 = BuildVertex(lod, idx1);
                var v2 = BuildVertex(lod, idx2);

                prim.AddTriangle(v0, v1, v2);
            }
        }

        scene.AddRigidMesh(mesh, Matrix4x4.Identity);
        var model = scene.ToGltf2();
        var glbSegment = model.WriteGLB();

        var result = new byte[glbSegment.Count];
        if (glbSegment.Array != null)
        {
            Buffer.BlockCopy(glbSegment.Array, glbSegment.Offset, result, 0, glbSegment.Count);
        }
        return result;
    }

    private static VertexBuilder<VertexPositionNormal, VertexTexture1, VertexEmpty> BuildVertex(
        UnrealMeshLodData lod,
        int vertexIndex)
    {
        var posOffset = vertexIndex * 3;
        var normOffset = vertexIndex * 3;
        var uvOffset = vertexIndex * 2;

        float ueX = posOffset < lod.Positions.Length ? lod.Positions[posOffset] : 0f;
        float ueY = posOffset + 1 < lod.Positions.Length ? lod.Positions[posOffset + 1] : 0f;
        float ueZ = posOffset + 2 < lod.Positions.Length ? lod.Positions[posOffset + 2] : 0f;

        float ueNx = normOffset < lod.Normals.Length ? lod.Normals[normOffset] : 0f;
        float ueNy = normOffset + 1 < lod.Normals.Length ? lod.Normals[normOffset + 1] : 0f;
        float ueNz = normOffset + 2 < lod.Normals.Length ? lod.Normals[normOffset + 2] : 1f;

        float u = 0f;
        float v = 0f;
        if (lod.Uvs.Count > 0 && lod.Uvs[0].Length > uvOffset + 1)
        {
            u = lod.Uvs[0][uvOffset];
            v = lod.Uvs[0][uvOffset + 1];
        }

        // Coordinate conversion: Unreal (X forward, Y right, Z up, cm) -> glTF (X right, Y up, -Z forward, m)
        var gltfPos = new Vector3(ueY * 0.01f, ueZ * 0.01f, -ueX * 0.01f);
        var gltfNorm = Vector3.Normalize(new Vector3(ueNy, ueNz, -ueNx));
        if (float.IsNaN(gltfNorm.X) || gltfNorm.LengthSquared() < 0.0001f)
        {
            gltfNorm = Vector3.UnitY;
        }

        var gltfUv = new Vector2(u, v);

        return new VertexBuilder<VertexPositionNormal, VertexTexture1, VertexEmpty>(
            new VertexPositionNormal(gltfPos, gltfNorm),
            new VertexTexture1(gltfUv));
    }

    private static Vector4 ParseHexToVector4(string? hex, float opacity = 1.0f)
    {
        if (string.IsNullOrEmpty(hex) || !hex.StartsWith("#") || hex.Length < 7)
            return new Vector4(1f, 1f, 1f, opacity);

        try
        {
            int r = Convert.ToInt32(hex.Substring(1, 2), 16);
            int g = Convert.ToInt32(hex.Substring(3, 2), 16);
            int b = Convert.ToInt32(hex.Substring(5, 2), 16);
            return new Vector4(r / 255f, g / 255f, b / 255f, opacity);
        }
        catch
        {
            return new Vector4(1f, 1f, 1f, opacity);
        }
    }

    private static Vector3 ParseHexToVector3(string? hex)
    {
        if (string.IsNullOrEmpty(hex) || !hex.StartsWith("#") || hex.Length < 7)
            return Vector3.Zero;

        try
        {
            int r = Convert.ToInt32(hex.Substring(1, 2), 16);
            int g = Convert.ToInt32(hex.Substring(3, 2), 16);
            int b = Convert.ToInt32(hex.Substring(5, 2), 16);
            return new Vector3(r / 255f, g / 255f, b / 255f);
        }
        catch
        {
            return Vector3.Zero;
        }
    }
}
