using SM.UnrealBridge.Models;

namespace SM.UnrealBridge;

public static class UnrealDiagnostics
{
    public static UnrealDiagnosticError Create(
        string code,
        string message,
        string? details = null,
        string? suggestion = null)
    {
        var title = FormatTitle(code);
        return new UnrealDiagnosticError
        {
            Code = code,
            Title = title,
            Message = message,
            Details = details,
            Suggestion = suggestion ?? GetDefaultSuggestion(code)
        };
    }

    public static UnrealDiagnosticError UnrealRootNotFound(string path) =>
        Create(
            "UNREAL_ROOT_NOT_FOUND",
            $"Unable to determine Unreal project or package root for: '{path}'.",
            "Searched directory tree upwards and downwards for 'Content' folder or '.uproject' file.",
            "Ensure the file is inside an Unreal Content folder or import the entire folder hierarchy.");

    public static UnrealDiagnosticError PackageNotFound(string packagePath) =>
        Create(
            "PACKAGE_NOT_FOUND",
            $"The requested package '{packagePath}' was not found in registered package roots.",
            null,
            "Verify the package exists on disk and that the Content folder is properly mounted.");

    public static UnrealDiagnosticError DependencyMissing(string dependencyPath, string dependentPackage) =>
        Create(
            "DEPENDENCY_MISSING",
            $"Missing required dependency '{dependencyPath}' referenced by '{dependentPackage}'.",
            "The package references external objects, materials, or textures that are not present in the current root.",
            "Include the dependent .uasset files or download all companion assets into the Content directory.");

    public static UnrealDiagnosticError UnsupportedEngineVersion(string versionStr) =>
        Create(
            "UNSUPPORTED_ENGINE_VERSION",
            $"The detected or requested engine version '{versionStr}' is not supported.",
            "Supported versions range from UE4.27 to UE5.8.",
            "Override the engine version using the 'game' option (e.g. 'UE5_5' or 'UE4_27').");

    public static UnrealDiagnosticError UnsupportedObjectClass(string className, string objectPath) =>
        Create(
            "UNSUPPORTED_OBJECT_CLASS",
            $"Asset class '{className}' in '{objectPath}' is not supported for direct extraction.",
            null,
            "Currently supported asset classes include UStaticMesh, USkeletalMesh, UTexture2D, UMaterial, UMaterialInstanceConstant, UAnimSequence, and UWorld.");

    public static UnrealDiagnosticError NaniteOnlyAsset(string assetName) =>
        Create(
            "NANITE_ONLY_ASSET",
            $"Mesh '{assetName}' only contains Nanite clusters and has no standard renderable fallback mesh.",
            "Nanite-only compressed cluster geometry cannot be rendered directly in web Three.js without fallback geometry.",
            "In Unreal Editor, enable 'Fallback Relative Error' or export fallback render geometry for this mesh.");

    public static UnrealDiagnosticError TextureFormatUnsupported(string pixelFormat, string textureName) =>
        Create(
            "TEXTURE_FORMAT_UNSUPPORTED",
            $"Texture '{textureName}' format '{pixelFormat}' cannot be decoded.",
            null,
            "Ensure standard texture compression (BC1-BC7, DXT, or uncompressed RGBA) is used.");

    public static UnrealDiagnosticError IoStoreContainerMissing(string containerName) =>
        Create(
            "IOSTORE_CONTAINER_MISSING",
            $"IoStore container '{containerName}' (.utoc/.ucas) was not found or is incomplete.",
            null,
            "Ensure both .utoc and .ucas files are present in the same directory.");

    public static UnrealDiagnosticError PackageParseFailed(string packagePath, string reason) =>
        Create(
            "PACKAGE_PARSE_FAILED",
            $"Failed to parse Unreal package '{packagePath}'.",
            reason,
            "Check that companion .uexp / .ubulk files are present if the asset is unbundled, and verify the Unreal Engine version.");

    public static UnrealDiagnosticError Unauthorized(string reason) =>
        Create(
            "UNAUTHORIZED",
            "Request failed authentication verification.",
            reason,
            "Pass the valid session token in the 'X-Bridge-Token' header or 'token' JSON property.");

    public static UnrealDiagnosticError PathTraversal(string path) =>
        Create(
            "PATH_TRAVERSAL_ATTEMPT",
            $"Access denied: path '{path}' contains illegal traversal characters or attempts to escape allowed roots.",
            null,
            "Specify valid absolute paths inside allowed project directories.");

    private static string FormatTitle(string code)
    {
        var parts = code.Split('_');
        return string.Join(" ", parts.Select(p =>
            p.Length > 0 ? char.ToUpper(p[0]) + p[1..].ToLower() : ""));
    }

    private static string GetDefaultSuggestion(string code) => code switch
    {
        "UNREAL_ROOT_NOT_FOUND" => "Check that your asset is located inside an Unreal Content directory.",
        "PACKAGE_NOT_FOUND" => "Verify that the requested asset file exists on disk.",
        "DEPENDENCY_MISSING" => "Download or copy all referenced textures, materials, and companion files.",
        "UNSUPPORTED_ENGINE_VERSION" => "Specify a valid Unreal Engine version such as 'UE5_5' or 'UE4_27'.",
        "NANITE_ONLY_ASSET" => "Ensure fallback mesh generation is enabled in the source project.",
        _ => "Check the diagnostics panel for additional details."
    };
}
