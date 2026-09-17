using CUE4Parse.UE4.Assets.Exports.StaticMesh;
using CUE4Parse.UE4.Versions;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge;

public sealed class UnrealBridgeService
{
    private readonly string _sessionToken;
    private readonly HashSet<string> _allowedRoots = new(StringComparer.OrdinalIgnoreCase);

    public string SessionToken => _sessionToken;

    public UnrealBridgeService(string? sessionToken = null)
    {
        _sessionToken = sessionToken ?? Guid.NewGuid().ToString("N");
    }

    public void AllowDirectory(string dir)
    {
        if (!string.IsNullOrWhiteSpace(dir))
        {
            _allowedRoots.Add(Path.GetFullPath(dir));
        }
    }

    public bool ValidateToken(string? token)
    {
        if (string.IsNullOrEmpty(_sessionToken)) return true;
        return string.Equals(_sessionToken, token, StringComparison.Ordinal);
    }

    public async Task<BridgeResponse> HandleAsync(BridgeRequest request)
    {
        return await Task.Run(() =>
        {
            var action = request.Action?.ToLowerInvariant() ?? "inspect";

            if (action is "health" or "status")
            {
                return GetHealth();
            }

            // Path traversal security check
            if (!string.IsNullOrWhiteSpace(request.File))
            {
                if (request.File.Contains(".."))
                {
                    return new BridgeResponse
                    {
                        Ok = false,
                        Status = "security-violation",
                        Message = "Path traversal sequences ('..') are forbidden.",
                        Diagnostics = { UnrealDiagnostics.PathTraversal(request.File) }
                    };
                }
            }

            return action switch
            {
                "inspect" => Inspect(request),
                "parse" => Parse(request),
                "import" or "extract" => ImportMesh(request),
                "dependencies" => GetDependencies(request),
                _ => new BridgeResponse
                {
                    Ok = false,
                    Status = "unsupported-action",
                    Message = $"Action '{request.Action}' is not supported."
                }
            };
        });
    }

    public BridgeResponse GetHealth()
    {
        return new BridgeResponse
        {
            Ok = true,
            Status = "ready",
            Message = "SM Unreal Bridge is running and healthy.",
            Service = "SM.UnrealBridge",
            Version = "1.0.0",
            Cue4Parse = "1.2.2.202609",
            Dotnet = "10.0",
            Token = _sessionToken
        };
    }

    public BridgeResponse Inspect(BridgeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.File))
        {
            return new BridgeResponse
            {
                Ok = false,
                Status = "invalid-request",
                Message = "File path is required for inspect action."
            };
        }

        var fullPath = Path.GetFullPath(request.File);
        if (!File.Exists(fullPath) && !Directory.Exists(fullPath))
        {
            return new BridgeResponse
            {
                Ok = false,
                Status = "file-not-found",
                Message = $"Target file or directory not found: '{fullPath}'.",
                Diagnostics = { UnrealDiagnostics.Create("FILE_NOT_FOUND", $"Target path does not exist: '{fullPath}'") }
            };
        }

        try
        {
            var resolvedRoot = UnrealProjectResolver.Resolve(fullPath, request.Root, request.Game);
            if (!UnrealVersionDetector.TryParseGame(resolvedRoot.EngineVersion, out var detectedGame))
            {
                detectedGame = UnrealVersionDetector.DefaultFallbackGame;
            }

            var packagePath = UnrealPackageResolver.ToPackagePath(fullPath, resolvedRoot.ContentPath);
            var reader = UnrealObjectReader.GetOrCreate(resolvedRoot, detectedGame);
            var objects = reader.InspectPackage(packagePath);

            return new BridgeResponse
            {
                Ok = true,
                Status = "inspected",
                File = fullPath,
                ResolvedRoot = resolvedRoot,
                Objects = objects,
                Token = _sessionToken,
                Metadata = new Dictionary<string, object?>
                {
                    { "packagePath", packagePath },
                    { "engineVersion", resolvedRoot.EngineVersion },
                    { "objectCount", objects.Count },
                    { "contentRoot", resolvedRoot.ContentPath }
                }
            };
        }
        catch (Exception ex)
        {
            return new BridgeResponse
            {
                Ok = false,
                Status = "inspect-failed",
                File = fullPath,
                Message = $"Inspect failed: {ex.Message}",
                Diagnostics = { UnrealDiagnostics.PackageParseFailed(fullPath, ex.ToString()) }
            };
        }
    }

    public BridgeResponse Parse(BridgeRequest request) => Inspect(request);

    public BridgeResponse ImportMesh(BridgeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.File))
        {
            return new BridgeResponse
            {
                Ok = false,
                Status = "invalid-request",
                Message = "File path is required for import action."
            };
        }

        var fullPath = Path.GetFullPath(request.File);
        if (!File.Exists(fullPath))
        {
            return new BridgeResponse
            {
                Ok = false,
                Status = "file-not-found",
                Message = $"Package file not found: '{fullPath}'.",
                Diagnostics = { UnrealDiagnostics.PackageNotFound(fullPath) }
            };
        }

        try
        {
            var resolvedRoot = UnrealProjectResolver.Resolve(fullPath, request.Root, request.Game);
            if (!UnrealVersionDetector.TryParseGame(resolvedRoot.EngineVersion, out var detectedGame))
            {
                detectedGame = UnrealVersionDetector.DefaultFallbackGame;
            }

            var packagePath = UnrealPackageResolver.ToPackagePath(fullPath, resolvedRoot.ContentPath);
            var reader = UnrealObjectReader.GetOrCreate(resolvedRoot, detectedGame);
            var objects = reader.LoadAllObjects(packagePath);

            // Find UStaticMesh
            var staticMesh = objects.OfType<UStaticMesh>().FirstOrDefault();
            if (staticMesh == null)
            {
                return new BridgeResponse
                {
                    Ok = false,
                    Status = "no-static-mesh",
                    File = fullPath,
                    Message = $"No UStaticMesh found in package '{packagePath}'. Found: {string.Join(", ", objects.Select(o => o.ExportType))}",
                    Diagnostics = { UnrealDiagnostics.UnsupportedObjectClass("Non-StaticMesh", packagePath) }
                };
            }

            // Extract Mesh
            var (meshData, diag) = UnrealMeshExtractor.ExtractStaticMesh(staticMesh, packagePath);
            if (meshData == null)
            {
                return new BridgeResponse
                {
                    Ok = false,
                    Status = "extraction-failed",
                    File = fullPath,
                    Message = diag?.Message ?? "Mesh extraction failed.",
                    Diagnostics = diag != null ? new List<UnrealDiagnosticError> { diag } : new()
                };
            }

            // Convert to GLB on disk
            var (glbPath, glbSize) = UnrealExporter.ExportMeshToGLB(meshData);

            // Resolve dependencies
            var depGraph = UnrealDependencyResolver.ResolveDependencies(reader, packagePath);

            var response = new BridgeResponse
            {
                Ok = true,
                Status = "ready",
                File = fullPath,
                ResolvedRoot = resolvedRoot,
                Token = _sessionToken,
                Metadata = new Dictionary<string, object?>
                {
                    { "meshName", meshData.Name },
                    { "packagePath", packagePath },
                    { "glbPath", glbPath },
                    { "glbSize", glbSize },
                    { "lodCount", meshData.Lods.Count },
                    { "vertexCount", meshData.Lods.Count > 0 ? meshData.Lods[0].VertexCount : 0 },
                    { "indexCount", meshData.Lods.Count > 0 ? meshData.Lods[0].IndexCount : 0 },
                    { "materialSlots", meshData.Materials.Count },
                    { "materials", meshData.MaterialDetails },
                    { "naniteFallbackUsed", meshData.NaniteFallbackUsed },
                    { "dependencies", depGraph }
                }
            };

            if (meshData.NaniteFallbackUsed)
            {
                response.Diagnostics.Add(new UnrealDiagnosticError
                {
                    Code = "NANITE_FALLBACK_USED",
                    Title = "Nanite Fallback Used",
                    Message = "Static mesh Nanite renderable fallback geometry was extracted for web rendering."
                });
            }

            return response;
        }
        catch (Exception ex)
        {
            return new BridgeResponse
            {
                Ok = false,
                Status = "import-failed",
                File = fullPath,
                Message = $"Mesh import failed: {ex.Message}",
                Diagnostics = { UnrealDiagnostics.PackageParseFailed(fullPath, ex.ToString()) }
            };
        }
    }

    public BridgeResponse GetDependencies(BridgeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.File))
        {
            return new BridgeResponse
            {
                Ok = false,
                Status = "invalid-request",
                Message = "File path is required."
            };
        }

        var fullPath = Path.GetFullPath(request.File);
        try
        {
            var resolvedRoot = UnrealProjectResolver.Resolve(fullPath, request.Root, request.Game);
            if (!UnrealVersionDetector.TryParseGame(resolvedRoot.EngineVersion, out var detectedGame))
            {
                detectedGame = UnrealVersionDetector.DefaultFallbackGame;
            }

            var packagePath = UnrealPackageResolver.ToPackagePath(fullPath, resolvedRoot.ContentPath);
            var reader = UnrealObjectReader.GetOrCreate(resolvedRoot, detectedGame);
            var graph = UnrealDependencyResolver.ResolveDependencies(reader, packagePath);

            return new BridgeResponse
            {
                Ok = true,
                Status = "dependencies-resolved",
                File = fullPath,
                Metadata = new Dictionary<string, object?>
                {
                    { "packagePath", packagePath },
                    { "dependencies", graph }
                }
            };
        }
        catch (Exception ex)
        {
            return new BridgeResponse
            {
                Ok = false,
                Status = "dependencies-failed",
                File = fullPath,
                Message = ex.Message
            };
        }
    }
}