using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace SM.UnrealBridge.Models
{
    public class UnrealMaterialData
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("virtualPath")]
        public string VirtualPath { get; set; } = string.Empty;

        [JsonPropertyName("slotIndex")]
        public int SlotIndex { get; set; }

        [JsonPropertyName("slotName")]
        public string SlotName { get; set; } = string.Empty;

        [JsonPropertyName("shadingModel")]
        public string ShadingModel { get; set; } = "DefaultLit";

        [JsonPropertyName("blendMode")]
        public string BlendMode { get; set; } = "Opaque";

        [JsonPropertyName("twoSided")]
        public bool TwoSided { get; set; }

        [JsonPropertyName("roughness")]
        public float Roughness { get; set; } = 0.5f;

        [JsonPropertyName("metallic")]
        public float Metallic { get; set; } = 0.0f;

        [JsonPropertyName("specular")]
        public float Specular { get; set; } = 0.5f;

        [JsonPropertyName("opacity")]
        public float Opacity { get; set; } = 1.0f;

        [JsonPropertyName("baseColorHex")]
        public string BaseColorHex { get; set; } = "#ffffff";

        [JsonPropertyName("emissiveColorHex")]
        public string EmissiveColorHex { get; set; } = "#000000";

        [JsonPropertyName("scalars")]
        public Dictionary<string, float> Scalars { get; set; } = new();

        [JsonPropertyName("colors")]
        public Dictionary<string, string> Colors { get; set; } = new();

        [JsonPropertyName("textureSlots")]
        public Dictionary<string, string> TextureSlots { get; set; } = new();

        [JsonPropertyName("extractedTextures")]
        public List<UnrealTextureData> ExtractedTextures { get; set; } = new();

        [JsonPropertyName("fidelity")]
        public string Fidelity { get; set; } = "native";
    }
}
