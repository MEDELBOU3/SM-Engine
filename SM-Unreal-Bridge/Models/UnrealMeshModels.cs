using System.Text.Json.Serialization;

namespace SM.UnrealBridge.Models;

public sealed class UnrealMeshData
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "static-mesh";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("bounds")]
    public UnrealMeshBounds? Bounds { get; set; }

    [JsonPropertyName("naniteFallbackUsed")]
    public bool NaniteFallbackUsed { get; set; }

    [JsonPropertyName("isNaniteOnly")]
    public bool IsNaniteOnly { get; set; }

    [JsonPropertyName("lods")]
    public List<UnrealMeshLodData> Lods { get; set; } = new();

    [JsonPropertyName("materials")]
    public List<UnrealMaterialSlot> Materials { get; set; } = new();

    [JsonPropertyName("materialDetails")]
    public List<UnrealMaterialData> MaterialDetails { get; set; } = new();

    [JsonPropertyName("glbFilePath")]
    public string? GlbFilePath { get; set; }

    [JsonPropertyName("glbSizeBytes")]
    public long GlbSizeBytes { get; set; }
}

public sealed class UnrealMeshLodData
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

    [JsonPropertyName("colors")]
    public float[]? Colors { get; set; }

    [JsonPropertyName("indices")]
    public uint[] Indices { get; set; } = Array.Empty<uint>();

    [JsonPropertyName("sections")]
    public List<UnrealMeshSection> Sections { get; set; } = new();
}

public sealed class UnrealMeshSection
{
    [JsonPropertyName("firstIndex")]
    public uint FirstIndex { get; set; }

    [JsonPropertyName("indexCount")]
    public uint IndexCount { get; set; }

    [JsonPropertyName("materialIndex")]
    public int MaterialIndex { get; set; }

    [JsonPropertyName("minVertexIndex")]
    public uint MinVertexIndex { get; set; }

    [JsonPropertyName("maxVertexIndex")]
    public uint MaxVertexIndex { get; set; }
}

public sealed class UnrealMaterialSlot
{
    [JsonPropertyName("slot")]
    public int Slot { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("path")]
    public string Path { get; set; } = "";
}

public sealed class UnrealMeshBounds
{
    [JsonPropertyName("origin")]
    public float[] Origin { get; set; } = new float[3];

    [JsonPropertyName("boxExtent")]
    public float[] BoxExtent { get; set; } = new float[3];

    [JsonPropertyName("sphereRadius")]
    public float SphereRadius { get; set; }
}
