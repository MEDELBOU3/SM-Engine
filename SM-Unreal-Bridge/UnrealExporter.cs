using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SM.UnrealBridge.Conversion;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge;

public static class UnrealExporter
{
    private static readonly string DefaultCacheDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        ".smcache",
        "unreal");

    public static string CacheDirectory => DefaultCacheDirectory;

    static UnrealExporter()
    {
        try
        {
            if (!Directory.Exists(DefaultCacheDirectory))
            {
                Directory.CreateDirectory(DefaultCacheDirectory);
            }
        }
        catch { }
    }

    public static (string GlbPath, long Size) ExportMeshToGLB(UnrealMeshData meshData, string? customOutputFolder = null)
    {
        var outDir = string.IsNullOrWhiteSpace(customOutputFolder) ? DefaultCacheDirectory : customOutputFolder;
        if (!Directory.Exists(outDir))
        {
            Directory.CreateDirectory(outDir);
        }

        var glbBytes = MeshToGLTFConverter.ConvertToGLB(meshData);

        var safeName = SanitizeFileName(meshData.Name);
        var hash = ComputeHash(meshData.Path + meshData.Name);
        var fileName = $"{safeName}_{hash}.glb";
        var outPath = Path.Combine(outDir, fileName);

        File.WriteAllBytes(outPath, glbBytes);

        meshData.GlbFilePath = outPath;
        meshData.GlbSizeBytes = glbBytes.Length;

        // Also save sidecar metadata JSON
        var metaPath = Path.Combine(outDir, $"{safeName}_{hash}.json");
        var metaJson = JsonSerializer.Serialize(meshData, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(metaPath, metaJson);

        return (outPath, glbBytes.Length);
    }

    private static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var sb = new StringBuilder();
        foreach (var c in name)
        {
            sb.Append(invalid.Contains(c) ? '_' : c);
        }
        return sb.ToString();
    }

    private static string ComputeHash(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes)[..12].ToLowerInvariant();
    }
}
