using CUE4Parse.UE4.Assets;
using CUE4Parse.UE4.Assets.Exports;
using CUE4Parse.UE4.Assets.Exports.StaticMesh;
using CUE4Parse.UE4.Assets.Objects;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge;

public sealed class AssetDependencyNode
{
    public string Path { get; set; } = "";
    public string Class { get; set; } = "";
    public string Type { get; set; } = "";
    public List<string> Dependencies { get; set; } = new();
}

public static class UnrealDependencyResolver
{
    public static Dictionary<string, AssetDependencyNode> ResolveDependencies(
        UnrealObjectReader reader,
        string rootPackagePath,
        int maxDepth = 4)
    {
        var graph = new Dictionary<string, AssetDependencyNode>(StringComparer.OrdinalIgnoreCase);
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        ResolveRecursive(reader, rootPackagePath, graph, visited, currentDepth: 0, maxDepth);
        return graph;
    }

    private static void ResolveRecursive(
        UnrealObjectReader reader,
        string packagePath,
        Dictionary<string, AssetDependencyNode> graph,
        HashSet<string> visited,
        int currentDepth,
        int maxDepth)
    {
        var cleanPath = packagePath.Trim();
        if (cleanPath.Contains('.'))
        {
            cleanPath = cleanPath.Split('.')[0];
        }

        if (string.IsNullOrWhiteSpace(cleanPath) || visited.Contains(cleanPath))
        {
            return;
        }

        visited.Add(cleanPath);

        try
        {
            var pkg = reader.Provider.LoadPackage(cleanPath);
            var node = new AssetDependencyNode
            {
                Path = cleanPath,
                Class = "Package",
                Type = "package"
            };

            // Inspect imports if package is a standard Package
            if (pkg is Package uPkg && uPkg.ImportMap != null)
            {
                foreach (var imp in uPkg.ImportMap)
                {
                    var impName = imp.ObjectName.Text;

                    if (impName.StartsWith("/Game/", StringComparison.OrdinalIgnoreCase))
                    {
                        if (!node.Dependencies.Contains(impName))
                        {
                            node.Dependencies.Add(impName);
                        }

                        if (currentDepth < maxDepth)
                        {
                            ResolveRecursive(reader, impName, graph, visited, currentDepth + 1, maxDepth);
                        }
                    }
                }
            }

            graph[cleanPath] = node;
        }
        catch
        {
            graph[cleanPath] = new AssetDependencyNode
            {
                Path = cleanPath,
                Class = "Unresolved",
                Type = "unresolved"
            };
        }
    }
}
