using System.Text.Json.Serialization;

namespace SM.UnrealBridge.Models;

public sealed class BridgeRequest
{
    [JsonPropertyName("action")]
    public string Action { get; set; } = "inspect";

    [JsonPropertyName("file")]
    public string File { get; set; } = "";

    [JsonPropertyName("root")]
    public string? Root { get; set; }

    [JsonPropertyName("game")]
    public string? Game { get; set; }

    [JsonPropertyName("assetType")]
    public string? AssetType { get; set; } = "auto";

    [JsonPropertyName("token")]
    public string? Token { get; set; }

    [JsonPropertyName("options")]
    public Dictionary<string, object?> Options { get; set; } = new();
}

public sealed class BridgeResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("file")]
    public string? File { get; set; }

    [JsonPropertyName("service")]
    public string Service { get; set; } = "SM.UnrealBridge";

    [JsonPropertyName("version")]
    public string Version { get; set; } = "1.0.0";

    [JsonPropertyName("cue4parse")]
    public string Cue4Parse { get; set; } = "1.2.2.202609";

    [JsonPropertyName("dotnet")]
    public string Dotnet { get; set; } = "10.0";

    [JsonPropertyName("token")]
    public string? Token { get; set; }

    [JsonPropertyName("resolvedRoot")]
    public ResolvedUnrealRoot? ResolvedRoot { get; set; }

    [JsonPropertyName("objects")]
    public List<UnrealObjectInfo> Objects { get; set; } = new();

    [JsonPropertyName("metadata")]
    public Dictionary<string, object?> Metadata { get; set; } = new();

    [JsonPropertyName("diagnostics")]
    public List<UnrealDiagnosticError> Diagnostics { get; set; } = new();
}

public sealed class UnrealObjectInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("class")]
    public string Class { get; set; } = "";

    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("isExport")]
    public bool IsExport { get; set; } = true;

    [JsonPropertyName("properties")]
    public Dictionary<string, object?> Properties { get; set; } = new();
}

public sealed class UnrealDiagnosticError
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = "";

    [JsonPropertyName("title")]
    public string Title { get; set; } = "";

    [JsonPropertyName("message")]
    public string Message { get; set; } = "";

    [JsonPropertyName("details")]
    public string? Details { get; set; }

    [JsonPropertyName("suggestion")]
    public string? Suggestion { get; set; }
}

public sealed class ResolvedUnrealRoot
{
    [JsonPropertyName("rootPath")]
    public string RootPath { get; set; } = "";

    [JsonPropertyName("contentPath")]
    public string ContentPath { get; set; } = "";

    [JsonPropertyName("projectFile")]
    public string? ProjectFile { get; set; }

    [JsonPropertyName("engineVersion")]
    public string EngineVersion { get; set; } = "UE5_5";

    [JsonPropertyName("packageRoots")]
    public List<string> PackageRoots { get; set; } = new();

    [JsonPropertyName("containerRoots")]
    public List<string> ContainerRoots { get; set; } = new();

    [JsonPropertyName("sourceType")]
    public string SourceType { get; set; } = "folder";
}