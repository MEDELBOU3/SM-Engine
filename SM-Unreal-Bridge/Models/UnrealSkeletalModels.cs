using System.Text.Json.Serialization;

namespace SM.UnrealBridge.Models;

/// <summary>
/// A bone in the skeletal hierarchy.
/// </summary>
public sealed class UnrealBoneData
{
    [JsonPropertyName("index")]
    public int Index { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("parentIndex")]
    public int ParentIndex { get; set; }

    /// <summary>Translation in Unreal space (cm), relative to parent.</summary>
    [JsonPropertyName("position")]
    public float[] Position { get; set; } = new float[3];

    /// <summary>Rotation quaternion (x, y, z, w) relative to parent.</summary>
    [JsonPropertyName("rotation")]
    public float[] Rotation { get; set; } = new float[4];

    /// <summary>Scale relative to parent.</summary>
    [JsonPropertyName("scale")]
    public float[] Scale { get; set; } = new float[3];
}

/// <summary>
/// A single bone influence on a vertex.
/// </summary>
public sealed class UnrealBoneInfluence
{
    [JsonPropertyName("boneIndex")]
    public int BoneIndex { get; set; }

    [JsonPropertyName("weight")]
    public float Weight { get; set; }
}

/// <summary>
/// Per-LOD skinned vertex data for a skeletal mesh.
/// Extends the base LOD shape with per-vertex bone influences.
/// </summary>
public sealed class UnrealSkeletalLodData
{
    [JsonPropertyName("level")]
    public int Level { get; set; }

    [JsonPropertyName("vertexCount")]
    public int VertexCount { get; set; }

    [JsonPropertyName("indexCount")]
    public int IndexCount { get; set; }

    [JsonPropertyName("positions")]
    public float[] Positions { get; set; } = Array.Empty<float>();

    [JsonPropertyName("normals")]
    public float[] Normals { get; set; } = Array.Empty<float>();

    [JsonPropertyName("tangents")]
    public float[] Tangents { get; set; } = Array.Empty<float>();

    [JsonPropertyName("uvs")]
    public List<float[]> Uvs { get; set; } = new();

    [JsonPropertyName("indices")]
    public uint[] Indices { get; set; } = Array.Empty<uint>();

    [JsonPropertyName("sections")]
    public List<UnrealMeshSection> Sections { get; set; } = new();

    /// <summary>
    /// Per-vertex influences array — each entry is a list of up to 4 bone/weight pairs.
    /// Length == VertexCount.
    /// </summary>
    [JsonPropertyName("influences")]
    public List<UnrealBoneInfluence[]> Influences { get; set; } = new();
}

/// <summary>
/// Top-level skeletal mesh data produced by the bridge.
/// </summary>
public sealed class UnrealSkeletalMeshData
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "skeletal-mesh";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("skeletonName")]
    public string SkeletonName { get; set; } = "";

    [JsonPropertyName("bounds")]
    public UnrealMeshBounds? Bounds { get; set; }

    [JsonPropertyName("bones")]
    public List<UnrealBoneData> Bones { get; set; } = new();

    [JsonPropertyName("lods")]
    public List<UnrealSkeletalLodData> Lods { get; set; } = new();

    [JsonPropertyName("materials")]
    public List<UnrealMaterialSlot> Materials { get; set; } = new();

    [JsonPropertyName("materialDetails")]
    public List<UnrealMaterialData> MaterialDetails { get; set; } = new();

    [JsonPropertyName("morphTargetCount")]
    public int MorphTargetCount { get; set; }

    [JsonPropertyName("glbFilePath")]
    public string? GlbFilePath { get; set; }

    [JsonPropertyName("glbSizeBytes")]
    public long GlbSizeBytes { get; set; }
}
