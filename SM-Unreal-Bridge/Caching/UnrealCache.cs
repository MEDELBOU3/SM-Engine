using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace SM.UnrealBridge.Caching
{
    public class UnrealCache
    {
        private readonly string _cacheRoot;
        private readonly string _glbDir;
        private readonly string _textureDir;

        public UnrealCache(string? customCacheRoot = null)
        {
            if (!string.IsNullOrEmpty(customCacheRoot))
            {
                _cacheRoot = customCacheRoot;
            }
            else
            {
                var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                if (string.IsNullOrEmpty(userProfile))
                {
                    userProfile = Path.GetTempPath();
                }
                _cacheRoot = Path.Combine(userProfile, ".smcache", "unreal");
            }

            _glbDir = Path.Combine(_cacheRoot, "meshes");
            _textureDir = Path.Combine(_cacheRoot, "textures");

            Directory.CreateDirectory(_cacheRoot);
            Directory.CreateDirectory(_glbDir);
            Directory.CreateDirectory(_textureDir);
        }

        public string CacheRoot => _cacheRoot;
        public string GlbDir => _glbDir;
        public string TextureDir => _textureDir;

        public static string ComputeCompositeKey(string filePath, long fileSize, DateTime lastModifiedUtc, string assetType, string version = "1.0")
        {
            var raw = $"{filePath.ToLowerInvariant()}|{fileSize}|{lastModifiedUtc.Ticks}|{assetType}|{version}";
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
            var sb = new StringBuilder(16);
            for (int i = 0; i < 16; i++)
            {
                sb.Append(bytes[i].ToString("x2"));
            }
            return sb.ToString();
        }

        public bool TryGetCachedGlb(string key, out string glbPath, out string metaPath)
        {
            glbPath = Path.Combine(_glbDir, $"{key}.glb");
            metaPath = Path.Combine(_glbDir, $"{key}.json");

            if (File.Exists(glbPath) && new FileInfo(glbPath).Length > 0)
            {
                return true;
            }

            return false;
        }

        public string SaveGlb(string key, byte[] glbBytes, string? metadataJson, string assetName)
        {
            var safeName = SanitizeFileName(assetName);
            var glbPath = Path.Combine(_glbDir, $"{safeName}_{key}.glb");
            File.WriteAllBytes(glbPath, glbBytes);

            if (!string.IsNullOrEmpty(metadataJson))
            {
                var metaPath = Path.Combine(_glbDir, $"{safeName}_{key}.json");
                File.WriteAllText(metaPath, metadataJson, Encoding.UTF8);
            }

            return glbPath;
        }

        public bool TryGetCachedTexture(string key, out string texturePath)
        {
            texturePath = Path.Combine(_textureDir, $"{key}.png");
            return File.Exists(texturePath) && new FileInfo(texturePath).Length > 0;
        }

        public string SaveTexture(string key, byte[] pngBytes, string textureName)
        {
            var safeName = SanitizeFileName(textureName);
            var texturePath = Path.Combine(_textureDir, $"{safeName}_{key}.png");
            File.WriteAllBytes(texturePath, pngBytes);
            return texturePath;
        }

        private static string SanitizeFileName(string name)
        {
            var invalid = Path.GetInvalidFileNameChars();
            var sb = new StringBuilder(name.Length);
            foreach (var c in name)
            {
                sb.Append(Array.IndexOf(invalid, c) >= 0 ? '_' : c);
            }
            return sb.ToString();
        }
    }
}
