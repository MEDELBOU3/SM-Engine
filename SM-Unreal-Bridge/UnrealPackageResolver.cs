namespace SM.UnrealBridge;

public static class UnrealPackageResolver
{
    public static string ToPackagePath(string physicalFilePath, string contentRootPath)
    {
        var normFile = NormalizeSlashes(Path.GetFullPath(physicalFilePath));
        var normContent = NormalizeSlashes(Path.GetFullPath(contentRootPath));

        if (!normContent.EndsWith('/'))
        {
            normContent += "/";
        }

        string relative;
        if (normFile.StartsWith(normContent, StringComparison.OrdinalIgnoreCase))
        {
            relative = normFile[normContent.Length..];
        }
        else
        {
            // If not directly under content root, check if 'Content/' exists in the path
            var contentIndex = normFile.IndexOf("/Content/", StringComparison.OrdinalIgnoreCase);
            if (contentIndex >= 0)
            {
                relative = normFile[(contentIndex + 9)..];
            }
            else
            {
                relative = Path.GetFileName(normFile);
            }
        }

        // Strip leading slashes
        relative = relative.TrimStart('/');

        // Strip extension if present for CUE4Parse lookup
        var ext = Path.GetExtension(relative);
        var pathWithoutExt = string.IsNullOrEmpty(ext) ? relative : relative[..^ext.Length];

        // Format as /Game/... virtual package path
        return "/Game/" + pathWithoutExt;
    }

    public static string ToObjectPath(string packagePath, string? exportName = null)
    {
        var cleanPkg = packagePath.Trim();
        if (cleanPkg.Contains('.'))
        {
            return cleanPkg; // Already includes object name
        }

        var assetName = Path.GetFileName(cleanPkg);
        var objName = string.IsNullOrEmpty(exportName) ? assetName : exportName;
        return $"{cleanPkg}.{objName}";
    }

    public static string NormalizeSlashes(string path)
    {
        if (string.IsNullOrEmpty(path)) return "";
        return path.Replace('\\', '/');
    }

    public static bool IsCompanionFile(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext is ".uexp" or ".ubulk" or ".uptnl" or ".utoc" or ".ucas";
    }

    public static string GetPrimaryPackageName(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        if (IsCompanionFile(fileName))
        {
            var nameWithoutExt = Path.GetFileNameWithoutExtension(fileName);
            return nameWithoutExt + ".uasset";
        }
        return fileName;
    }
}
