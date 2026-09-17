using System;
using System.IO;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse_Conversion.Options;
using CUE4Parse_Conversion.Textures;
using SM.UnrealBridge.Caching;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge.Extractors
{
    public class UnrealTextureExtractor
    {
        private readonly UnrealCache _cache;

        public UnrealTextureExtractor(UnrealCache? cache = null)
        {
            _cache = cache ?? new UnrealCache();
        }

        public UnrealTextureData? Extract(UTexture? texture, string? semantic = null)
        {
            if (texture == null) return null;

            try
            {
                var cTexture = TextureDecoder.Decode(texture, ETexturePlatform.DesktopMobile);
                if (cTexture == null || cTexture.Width <= 0 || cTexture.Height <= 0 || cTexture.Data == null || cTexture.Data.Length == 0)
                {
                    return null;
                }

                var pngBytes = TextureEncoder.Encode(cTexture, ETextureFormat.Png, false, out var ext, 100);
                if (pngBytes == null || pngBytes.Length == 0)
                {
                    return null;
                }

                var texName = texture.Name ?? "Texture";
                var path = texture.GetPathName();
                var key = UnrealCache.ComputeCompositeKey(path, pngBytes.Length, DateTime.UtcNow, "texture");

                var diskPath = _cache.SaveTexture(key, pngBytes, texName);
                var downloadUrl = $"/download?file={Uri.EscapeDataString(diskPath)}";

                var detectedSemantic = semantic ?? DetectSemanticFromName(texName);

                return new UnrealTextureData
                {
                    Name = texName,
                    VirtualPath = path,
                    Width = cTexture.Width,
                    Height = cTexture.Height,
                    Format = cTexture.PixelFormat.ToString(),
                    IsSRGB = texture is UTexture2D t2d ? t2d.SRGB : true,
                    DiskPath = diskPath,
                    DownloadUrl = downloadUrl,
                    FileSizeBytes = pngBytes.Length,
                    Semantic = detectedSemantic,
                    MipCount = 1
                };
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[UnrealTextureExtractor] Failed to extract texture {texture?.Name}: {ex.Message}");
                return null;
            }
        }

        public static string DetectSemanticFromName(string name)
        {
            var lower = name.ToLowerInvariant();
            if (lower.EndsWith("_d") || lower.EndsWith("_diffuse") || lower.EndsWith("_basecolor") || lower.EndsWith("_bc") || lower.EndsWith("_albedo") || lower.EndsWith("_col"))
                return "baseColor";
            if (lower.EndsWith("_n") || lower.EndsWith("_normal") || lower.EndsWith("_norm") || lower.EndsWith("_nrm"))
                return "normal";
            if (lower.EndsWith("_r") || lower.EndsWith("_roughness") || lower.EndsWith("_rough"))
                return "roughness";
            if (lower.EndsWith("_m") || lower.EndsWith("_metallic") || lower.EndsWith("_metal") || lower.EndsWith("_met"))
                return "metallic";
            if (lower.EndsWith("_e") || lower.EndsWith("_emissive") || lower.EndsWith("_emit"))
                return "emissive";
            if (lower.EndsWith("_ao") || lower.EndsWith("_occlusion") || lower.EndsWith("_ambientocclusion"))
                return "ambientOcclusion";
            if (lower.EndsWith("_orm") || lower.EndsWith("_mro") || lower.EndsWith("_rma"))
                return "ormComposite";

            return "baseColor";
        }
    }
}
