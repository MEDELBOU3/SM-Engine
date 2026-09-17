using CUE4Parse.UE4.Versions;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge.Tests;

public static class PackageTests
{
    public static int RunAllTests()
    {
        int passed = 0;
        int total = 0;

        void Assert(bool condition, string testName)
        {
            total++;
            if (condition)
            {
                passed++;
                Console.WriteLine($"  [PASS] {testName}");
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"  [FAIL] {testName}");
                Console.ResetColor();
            }
        }

        Console.WriteLine("\n=== RUNNING PACKAGE & RESOLVER TESTS ===");

        // 1. Version Detection Tests
        Assert(UnrealVersionDetector.TryParseGame("UE5_8", out var g1) && g1 == EGame.GAME_UE5_8, "Detect UE5_8");
        Assert(UnrealVersionDetector.TryParseGame("5.5", out var g2) && g2 == EGame.GAME_UE5_5, "Detect 5.5");
        Assert(UnrealVersionDetector.TryParseGame("UE4.27", out var g3) && g3 == EGame.GAME_UE4_27, "Detect UE4.27");
        Assert(UnrealVersionDetector.TryParseGame("UE5.3", out var g4) && g4 == EGame.GAME_UE5_3, "Detect UE5.3");
        Assert(UnrealVersionDetector.Detect(null, null) == UnrealVersionDetector.DefaultFallbackGame, "Default Fallback Game");
        Assert(UnrealVersionDetector.Detect("UE5_2", null) == EGame.GAME_UE5_2, "Explicit Override Detection");

        // 2. Package Resolver Tests
        var pkg1 = UnrealPackageResolver.ToPackagePath(@"C:\Project\Content\Props\Chair.uasset", @"C:\Project\Content");
        Assert(pkg1 == "/Game/Props/Chair", $"ToPackagePath virtual path: {pkg1}");

        var pkg2 = UnrealPackageResolver.ToPackagePath(@"C:\Downloads\FabAsset\Textures\T_Wood.uasset", @"C:\Downloads\FabAsset");
        Assert(pkg2 == "/Game/Textures/T_Wood", $"ToPackagePath non-content root: {pkg2}");

        var obj1 = UnrealPackageResolver.ToObjectPath("/Game/Props/Chair");
        Assert(obj1 == "/Game/Props/Chair.Chair", $"ToObjectPath auto object name: {obj1}");

        Assert(UnrealPackageResolver.IsCompanionFile("Chair.uexp"), "Detect companion .uexp");
        Assert(UnrealPackageResolver.IsCompanionFile("Chair.ubulk"), "Detect companion .ubulk");
        Assert(!UnrealPackageResolver.IsCompanionFile("Chair.uasset"), "Primary package .uasset is not companion");
        Assert(UnrealPackageResolver.GetPrimaryPackageName("Chair.uexp") == "Chair.uasset", "Map companion to primary .uasset");

        // 3. Diagnostics Tests
        var diag1 = UnrealDiagnostics.UnrealRootNotFound(@"C:\test\missing");
        Assert(diag1.Code == "UNREAL_ROOT_NOT_FOUND" && !string.IsNullOrEmpty(diag1.Suggestion), "Diagnostic UNREAL_ROOT_NOT_FOUND");

        var diag2 = UnrealDiagnostics.NaniteOnlyAsset("NaniteMesh");
        Assert(diag2.Code == "NANITE_ONLY_ASSET" && diag2.Message.Contains("Nanite"), "Diagnostic NANITE_ONLY_ASSET");

        var diag3 = UnrealDiagnostics.PathTraversal(@"../../etc/passwd");
        Assert(diag3.Code == "PATH_TRAVERSAL_ATTEMPT", "Diagnostic PATH_TRAVERSAL_ATTEMPT");

        // 4. Project Resolver Tests
        var tempDir = Path.Combine(Path.GetTempPath(), "UnrealTestProj_" + Guid.NewGuid().ToString("N"));
        try
        {
            var contentDir = Path.Combine(tempDir, "Content", "Props");
            Directory.CreateDirectory(contentDir);
            var dummyAsset = Path.Combine(contentDir, "TestProp.uasset");
            File.WriteAllBytes(dummyAsset, new byte[] { 0x01, 0x02 });

            var resolved = UnrealProjectResolver.Resolve(dummyAsset);
            Assert(resolved.ContentPath.EndsWith("Content", StringComparison.OrdinalIgnoreCase) ||
                   resolved.ContentPath.Contains("Content"), $"Resolved Content folder: {resolved.ContentPath}");
            Assert(resolved.PackageRoots.Count > 0, "Resolved PackageRoots contains entries");
        }
        finally
        {
            if (Directory.Exists(tempDir))
            {
                Directory.Delete(tempDir, true);
            }
        }

        // 5. Service & Health Tests
        var service = new UnrealBridgeService("test-token-123");
        var health = service.GetHealth();
        Assert(health.Ok && health.Service == "SM.UnrealBridge" && health.Token == "test-token-123", "Health endpoint response");
        Assert(service.ValidateToken("test-token-123"), "Validate correct token");
        Assert(!service.ValidateToken("wrong-token"), "Reject incorrect token");

        Console.WriteLine($"\nPackageTests Completed: {passed}/{total} Passed.\n");
        return total - passed; // 0 if all passed
    }
}
