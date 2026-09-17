using System.Text.Json.Serialization;

namespace SM.UnrealBridge.Models
{
    public class UnrealTextureData
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("virtualPath")]
        public string VirtualPath { get; set; } = string.Empty;

        [JsonPropertyName("width")]
        public int Width { get; set; }

        [JsonPropertyName("height")]
        public int Height { get; set; }

        [JsonPropertyName("format")]
        public string Format { get; set; } = string.Empty;

        [JsonPropertyName("isSRGB")]
        public bool IsSRGB { get; set; } = true;

        [JsonPropertyName("diskPath")]
        public string DiskPath { get; set; } = string.Empty;

        [JsonPropertyName("downloadUrl")]
        public string DownloadUrl { get; set; } = string.Empty;

        [JsonPropertyName("fileSizeBytes")]
        public long FileSizeBytes { get; set; }

        [JsonPropertyName("semantic")]
        public string Semantic { get; set; } = "baseColor";

        [JsonPropertyName("mipCount")]
        public int MipCount { get; set; } = 1;
    }
}
