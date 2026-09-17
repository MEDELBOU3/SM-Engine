using SM.UnrealBridge.Models;

namespace SM.UnrealBridge;

public static class UnrealProjectResolver
{
    public static ResolvedUnrealRoot Resolve(string inputPath, string? explicitRoot = null, string? explicitGame = null)
    {
        var resolved = new ResolvedUnrealRoot();
        var fullPath = Path.GetFullPath(inputPath.Trim().Trim('"', '\''));

        // If explicit root is specified, use that as starting base
        if (!string.IsNullOrWhiteSpace(explicitRoot) && Directory.Exists(explicitRoot))
        {
            var cleanExplicit = Path.GetFullPath(explicitRoot.Trim().Trim('"', '\''));
            return ResolveFromBase(cleanExplicit, fullPath, explicitGame);
        }

        if (File.Exists(fullPath))
        {
            var ext = Path.GetExtension(fullPath).ToLowerInvariant();
            if (ext == ".uproject")
            {
                var dir = Path.GetDirectoryName(fullPath) ?? fullPath;
                return ResolveFromProjectDir(dir, fullPath, explicitGame);
            }

            var parentDir = Path.GetDirectoryName(fullPath) ?? fullPath;
            return ResolveFromPath(parentDir, fullPath, explicitGame);
        }

        if (Directory.Exists(fullPath))
        {
            return ResolveFromPath(fullPath, null, explicitGame);
        }

        // Path doesn't exist on disk, return best-effort fallback
        resolved.RootPath = fullPath;
        resolved.ContentPath = fullPath;
        resolved.EngineVersion = explicitGame ?? "UE5_5";
        resolved.SourceType = "unknown";
        resolved.PackageRoots.Add(fullPath);
        return resolved;
    }

    private static ResolvedUnrealRoot ResolveFromProjectDir(string projectDir, string uprojectFile, string? explicitGame)
    {
        var contentDir = Path.Combine(projectDir, "Content");
        if (!Directory.Exists(contentDir))
        {
            contentDir = projectDir;
        }

        var detectedGame = UnrealVersionDetector.Detect(explicitGame, uprojectFile);

        var result = new ResolvedUnrealRoot
        {
            RootPath = projectDir,
            ContentPath = contentDir,
            ProjectFile = uprojectFile,
            EngineVersion = UnrealVersionDetector.FormatGame(detectedGame),
            SourceType = "project"
        };

        result.PackageRoots.Add(contentDir);
        ScanContainers(projectDir, result.ContainerRoots);
        return result;
    }

    private static ResolvedUnrealRoot ResolveFromPath(string directory, string? fileContext, string? explicitGame)
    {
        // 1. Search upwards for a Content directory or a .uproject file
        var current = new DirectoryInfo(directory);
        DirectoryInfo? contentDirInfo = null;
        FileInfo? uprojectInfo = null;

        var probe = current;
        while (probe != null)
        {
            if (probe.Name.Equals("Content", StringComparison.OrdinalIgnoreCase))
            {
                contentDirInfo = probe;
            }
            else
            {
                var subContent = Path.Combine(probe.FullName, "Content");
                if (Directory.Exists(subContent))
                {
                    contentDirInfo = new DirectoryInfo(subContent);
                }
            }

            var uprojects = probe.GetFiles("*.uproject");
            if (uprojects.Length > 0)
            {
                uprojectInfo = uprojects[0];
                break;
            }

            if (contentDirInfo != null)
            {
                break;
            }

            probe = probe.Parent;
        }

        if (uprojectInfo != null)
        {
            var projDir = uprojectInfo.DirectoryName ?? directory;
            return ResolveFromProjectDir(projDir, uprojectInfo.FullName, explicitGame);
        }

        if (contentDirInfo != null)
        {
            var rootDir = contentDirInfo.Parent?.FullName ?? contentDirInfo.FullName;
            var detectedGame = UnrealVersionDetector.Detect(explicitGame, null, fileContext);
            var result = new ResolvedUnrealRoot
            {
                RootPath = rootDir,
                ContentPath = contentDirInfo.FullName,
                ProjectFile = null,
                EngineVersion = UnrealVersionDetector.FormatGame(detectedGame),
                SourceType = "folder"
            };

            result.PackageRoots.Add(contentDirInfo.FullName);
            ScanContainers(rootDir, result.ContainerRoots);
            return result;
        }

        // 2. Search downwards for a Content folder (e.g. user selected extracted Fab root)
        try
        {
            var contentSubdirs = Directory.GetDirectories(directory, "Content", SearchOption.AllDirectories);
            if (contentSubdirs.Length > 0)
            {
                var foundContent = contentSubdirs[0];
                var rootDir = Path.GetDirectoryName(foundContent) ?? directory;
                var detectedGame = UnrealVersionDetector.Detect(explicitGame, null, fileContext);
                var result = new ResolvedUnrealRoot
                {
                    RootPath = rootDir,
                    ContentPath = foundContent,
                    ProjectFile = null,
                    EngineVersion = UnrealVersionDetector.FormatGame(detectedGame),
                    SourceType = "folder"
                };

                result.PackageRoots.Add(foundContent);
                ScanContainers(directory, result.ContainerRoots);
                return result;
            }
        }
        catch
        {
            // Ignore directory scanning exceptions on restricted paths
        }

        // 3. Fallback: Treat the directory containing the file as the package root
        var detectedFallbackGame = UnrealVersionDetector.Detect(explicitGame, null, fileContext);
        var fallbackResult = new ResolvedUnrealRoot
        {
            RootPath = directory,
            ContentPath = directory,
            ProjectFile = null,
            EngineVersion = UnrealVersionDetector.FormatGame(detectedFallbackGame),
            SourceType = "package"
        };
        fallbackResult.PackageRoots.Add(directory);
        ScanContainers(directory, fallbackResult.ContainerRoots);
        return fallbackResult;
    }

    private static ResolvedUnrealRoot ResolveFromBase(string baseDir, string targetPath, string? explicitGame)
    {
        return ResolveFromPath(baseDir, targetPath, explicitGame);
    }

    private static void ScanContainers(string rootDir, List<string> containerList)
    {
        try
        {
            if (!Directory.Exists(rootDir)) return;
            var containerExts = new[] { "*.pak", "*.utoc", "*.ucas" };
            foreach (var ext in containerExts)
            {
                foreach (var file in Directory.EnumerateFiles(rootDir, ext, SearchOption.AllDirectories))
                {
                    var dir = Path.GetDirectoryName(file);
                    if (dir != null && !containerList.Contains(dir))
                    {
                        containerList.Add(dir);
                    }
                }
            }
        }
        catch
        {
            // Ignore container scanning permission issues
        }
    }
}
