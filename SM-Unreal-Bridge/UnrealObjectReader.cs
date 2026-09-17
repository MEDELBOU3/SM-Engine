using System.Collections.Concurrent;
using CUE4Parse.FileProvider;
using CUE4Parse.UE4.Assets.Exports;
using CUE4Parse.UE4.Versions;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge;

public sealed class UnrealObjectReader : IDisposable
{
    private static readonly ConcurrentDictionary<string, UnrealObjectReader> ProviderCache = new(StringComparer.OrdinalIgnoreCase);

    public DefaultFileProvider Provider { get; }
    public ResolvedUnrealRoot Root { get; }
    public EGame Game { get; }

    private UnrealObjectReader(ResolvedUnrealRoot root, EGame game)
    {
        Root = root;
        Game = game;

        var dirInfo = new DirectoryInfo(root.ContentPath);
        Provider = new DefaultFileProvider(dirInfo, SearchOption.AllDirectories, new VersionContainer(game), StringComparer.OrdinalIgnoreCase);
        Provider.Initialize();

        // Register any detected container directories / files (.pak / .utoc)
        foreach (var containerDir in root.ContainerRoots)
        {
            if (Directory.Exists(containerDir))
            {
                var containerFiles = Directory.EnumerateFiles(containerDir, "*.*", SearchOption.TopDirectoryOnly)
                    .Where(f => f.EndsWith(".pak", StringComparison.OrdinalIgnoreCase) ||
                                f.EndsWith(".utoc", StringComparison.OrdinalIgnoreCase));

                foreach (var cFile in containerFiles)
                {
                    try
                    {
                        Provider.RegisterVfs(cFile);
                    }
                    catch
                    {
                        // Ignore individual container mount errors
                    }
                }
            }
        }
    }

    public static UnrealObjectReader GetOrCreate(ResolvedUnrealRoot root, EGame game)
    {
        var cacheKey = $"{root.ContentPath}::{game}";
        return ProviderCache.GetOrAdd(cacheKey, _ => new UnrealObjectReader(root, game));
    }

    public static void ClearCache()
    {
        foreach (var reader in ProviderCache.Values)
        {
            reader.Dispose();
        }
        ProviderCache.Clear();
    }

    public IEnumerable<UObject> LoadAllObjects(string packagePath)
    {
        var cleanPath = packagePath.Trim();
        if (cleanPath.Contains('.'))
        {
            cleanPath = cleanPath.Split('.')[0];
        }

        try
        {
            var pkg = Provider.LoadPackage(cleanPath);
            return pkg.GetExports();
        }
        catch
        {
            // If direct virtual path fails, try without leading /Game/
            if (cleanPath.StartsWith("/Game/", StringComparison.OrdinalIgnoreCase))
            {
                var stripped = cleanPath[6..];
                try
                {
                    var pkg = Provider.LoadPackage(stripped);
                    return pkg.GetExports();
                }
                catch { }
            }
            throw;
        }
    }

    public UObject? LoadObject(string objectPath)
    {
        try
        {
            if (objectPath.Contains('.'))
            {
                var parts = objectPath.Split('.');
                return Provider.SafeLoadPackageObject(parts[0], parts[1]);
            }
            return Provider.SafeLoadPackageObject(objectPath);
        }
        catch
        {
            return null;
        }
    }

    public List<UnrealObjectInfo> InspectPackage(string packagePath)
    {
        var results = new List<UnrealObjectInfo>();
        var objects = LoadAllObjects(packagePath);

        foreach (var obj in objects)
        {
            var info = new UnrealObjectInfo
            {
                Name = obj.Name,
                Class = obj.ExportType,
                Path = obj.GetPathName(),
                Type = DetermineObjectType(obj.ExportType),
                IsExport = true
            };

            if (obj.Properties != null)
            {
                foreach (var prop in obj.Properties.Take(20))
                {
                    info.Properties[prop.Name.Text] = prop.Tag?.GetValue(typeof(object))?.ToString();
                }
            }

            results.Add(info);
        }

        return results;
    }

    private static string DetermineObjectType(string exportType) => exportType switch
    {
        "StaticMesh" => "static-mesh",
        "SkeletalMesh" => "skeletal-mesh",
        "Texture2D" => "texture",
        "Material" or "MaterialInstanceConstant" or "MaterialInstance" => "material",
        "AnimSequence" => "animation",
        "World" or "Level" => "scene",
        "Skeleton" => "skeleton",
        "SoundWave" => "audio",
        _ => "generic"
    };

    public void Dispose()
    {
        Provider.Dispose();
    }
}
