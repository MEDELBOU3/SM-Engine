using System.Text.Json;
using System.Text.RegularExpressions;
using CUE4Parse.UE4.Versions;

namespace SM.UnrealBridge;

public static class UnrealVersionDetector
{
    private static readonly Dictionary<string, EGame> VersionMap = new(StringComparer.OrdinalIgnoreCase)
    {
        { "4.27", EGame.GAME_UE4_27 },
        { "UE4.27", EGame.GAME_UE4_27 },
        { "UE4_27", EGame.GAME_UE4_27 },
        { "4.26", EGame.GAME_UE4_26 },
        { "UE4.26", EGame.GAME_UE4_26 },
        { "UE4_26", EGame.GAME_UE4_26 },
        { "4.25", EGame.GAME_UE4_25 },
        { "UE4.25", EGame.GAME_UE4_25 },
        { "UE4_25", EGame.GAME_UE4_25 },
        { "5.0", EGame.GAME_UE5_0 },
        { "UE5.0", EGame.GAME_UE5_0 },
        { "UE5_0", EGame.GAME_UE5_0 },
        { "5.1", EGame.GAME_UE5_1 },
        { "UE5.1", EGame.GAME_UE5_1 },
        { "UE5_1", EGame.GAME_UE5_1 },
        { "5.2", EGame.GAME_UE5_2 },
        { "UE5.2", EGame.GAME_UE5_2 },
        { "UE5_2", EGame.GAME_UE5_2 },
        { "5.3", EGame.GAME_UE5_3 },
        { "UE5.3", EGame.GAME_UE5_3 },
        { "UE5_3", EGame.GAME_UE5_3 },
        { "5.4", EGame.GAME_UE5_4 },
        { "UE5.4", EGame.GAME_UE5_4 },
        { "UE5_4", EGame.GAME_UE5_4 },
        { "5.5", EGame.GAME_UE5_5 },
        { "UE5.5", EGame.GAME_UE5_5 },
        { "UE5_5", EGame.GAME_UE5_5 },
        { "5.6", EGame.GAME_UE5_6 },
        { "UE5.6", EGame.GAME_UE5_6 },
        { "UE5_6", EGame.GAME_UE5_6 },
        { "5.7", EGame.GAME_UE5_7 },
        { "UE5.7", EGame.GAME_UE5_7 },
        { "UE5_7", EGame.GAME_UE5_7 },
        { "5.8", EGame.GAME_UE5_8 },
        { "UE5.8", EGame.GAME_UE5_8 },
        { "UE5_8", EGame.GAME_UE5_8 },
        { "5.9", EGame.GAME_UE5_9 },
        { "UE5.9", EGame.GAME_UE5_9 },
        { "UE5_9", EGame.GAME_UE5_9 },
        { "LATEST", EGame.GAME_UE5_LATEST },
        { "UE5_LATEST", EGame.GAME_UE5_LATEST }
    };

    public const EGame DefaultFallbackGame = EGame.GAME_UE5_5;

    public static EGame Detect(
        string? explicitOverride,
        string? projectFile,
        string? filePath = null)
    {
        // 1. Explicit user override
        if (!string.IsNullOrWhiteSpace(explicitOverride))
        {
            if (TryParseGame(explicitOverride, out var overriddenGame))
            {
                return overriddenGame;
            }
        }

        // 2. .uproject EngineAssociation
        if (!string.IsNullOrWhiteSpace(projectFile) && File.Exists(projectFile))
        {
            var detected = DetectFromUProject(projectFile);
            if (detected.HasValue)
            {
                return detected.Value;
            }
        }

        // 3. Package version inspection from header (file path)
        if (!string.IsNullOrWhiteSpace(filePath) && File.Exists(filePath))
        {
            var detected = DetectFromPackageHeader(filePath);
            if (detected.HasValue)
            {
                return detected.Value;
            }
        }

        // 4. Safe fallback
        return DefaultFallbackGame;
    }

    public static bool TryParseGame(string name, out EGame game)
    {
        var cleaned = name.Trim().ToUpperInvariant();
        if (VersionMap.TryGetValue(cleaned, out game))
        {
            return true;
        }

        if (Enum.TryParse<EGame>(cleaned, true, out game))
        {
            return true;
        }

        if (Enum.TryParse<EGame>("GAME_" + cleaned, true, out game))
        {
            return true;
        }

        game = DefaultFallbackGame;
        return false;
    }

    public static string FormatGame(EGame game)
    {
        var str = game.ToString();
        if (str.StartsWith("GAME_"))
        {
            return str[5..];
        }
        return str;
    }

    private static EGame? DetectFromUProject(string projectFile)
    {
        try
        {
            var text = File.ReadAllText(projectFile);
            using var doc = JsonDocument.Parse(text);
            if (doc.RootElement.TryGetProperty("EngineAssociation", out var assocProp))
            {
                var assoc = assocProp.GetString();
                if (!string.IsNullOrWhiteSpace(assoc))
                {
                    var match = Regex.Match(assoc, @"^(\d+\.\d+)");
                    if (match.Success)
                    {
                        var versionStr = match.Groups[1].Value;
                        if (TryParseGame(versionStr, out var g))
                            return g;
                    }
                    else if (TryParseGame(assoc, out var g))
                    {
                        return g;
                    }
                }
            }
        }
        catch
        {
            // Ignore parse errors on corrupted uproject files
        }

        return null;
    }

    private static EGame? DetectFromPackageHeader(string filePath)
    {
        try
        {
            using var stream = File.OpenRead(filePath);
            using var reader = new BinaryReader(stream);
            if (stream.Length < 32) return null;

            var tag = reader.ReadUInt32();
            if (tag != 0x9E2A83C1) return null; // Unreal package tag

            var legacyVersion = reader.ReadInt32();
            if (legacyVersion < 0)
            {
                // Unversioned or modern package
                var legacyUE3Version = reader.ReadInt32();
                var fileVersionUE4 = reader.ReadInt32();
                var fileVersionUE5 = reader.ReadInt32();

                if (fileVersionUE5 > 0)
                {
                    // UE5 package
                    return EGame.GAME_UE5_5;
                }
                if (fileVersionUE4 > 0)
                {
                    return EGame.GAME_UE4_27;
                }
            }
        }
        catch
        {
            // Ignore header read issues
        }

        return null;
    }
}
