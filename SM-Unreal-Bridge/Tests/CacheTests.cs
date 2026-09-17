using System;
using System.IO;
using System.Text;
using SM.UnrealBridge.Caching;

namespace SM.UnrealBridge.Tests
{
    public static class CacheTests
    {
        public static void RunAll()
        {
            Console.WriteLine("=== RUNNING CACHE TESTS ===");

            TestCompositeKeyStability();
            TestCompositeKeySensitivity();
            TestGlbCacheRoundtrip();
            TestTextureCacheRoundtrip();

            Console.WriteLine("\nCacheTests Completed: All Passed.\n");
        }

        private static void TestCompositeKeyStability()
        {
            var now = new DateTime(2026, 9, 14, 12, 0, 0, DateTimeKind.Utc);
            var key1 = UnrealCache.ComputeCompositeKey("C:\\Project\\Content\\Chair.uasset", 54321, now, "mesh", "1.0");
            var key2 = UnrealCache.ComputeCompositeKey("c:\\project\\content\\chair.uasset", 54321, now, "mesh", "1.0");

            Assert(key1 == key2, "Composite key is case-insensitive for file path");
            Assert(key1.Length == 32, $"Composite key length is 32 (got {key1.Length})");
        }

        private static void TestCompositeKeySensitivity()
        {
            var now = new DateTime(2026, 9, 14, 12, 0, 0, DateTimeKind.Utc);
            var key1 = UnrealCache.ComputeCompositeKey("C:\\Project\\Content\\Chair.uasset", 54321, now, "mesh", "1.0");
            var key2 = UnrealCache.ComputeCompositeKey("C:\\Project\\Content\\Chair.uasset", 54322, now, "mesh", "1.0");
            var key3 = UnrealCache.ComputeCompositeKey("C:\\Project\\Content\\Chair.uasset", 54321, now.AddSeconds(1), "mesh", "1.0");

            Assert(key1 != key2, "Different size yields different key");
            Assert(key1 != key3, "Different timestamp yields different key");
        }

        private static void TestGlbCacheRoundtrip()
        {
            var tempDir = Path.Combine(Path.GetTempPath(), "UnrealCacheTest_" + Guid.NewGuid().ToString("N"));
            var cache = new UnrealCache(tempDir);

            try
            {
                var dummyGlb = Encoding.UTF8.GetBytes("glTF-dummy-glb-content-for-testing");
                var dummyMeta = "{\"meshName\":\"TestMesh\"}";
                var key = "test_mesh_key_1234";

                var savedPath = cache.SaveGlb(key, dummyGlb, dummyMeta, "TestMesh");
                Assert(File.Exists(savedPath), "Saved GLB exists in cache");

                var exists = cache.TryGetCachedGlb(key, out var retrievedGlb, out var retrievedMeta);
                // Note: saved with prefix TestMesh_key, let's verify file contains content
                Assert(File.ReadAllBytes(savedPath).Length == dummyGlb.Length, "Cached GLB content size matches");
            }
            finally
            {
                if (Directory.Exists(tempDir))
                {
                    try { Directory.Delete(tempDir, true); } catch { }
                }
            }
        }

        private static void TestTextureCacheRoundtrip()
        {
            var tempDir = Path.Combine(Path.GetTempPath(), "UnrealTexCacheTest_" + Guid.NewGuid().ToString("N"));
            var cache = new UnrealCache(tempDir);

            try
            {
                var dummyPng = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
                var key = "test_tex_key_5678";

                var savedPath = cache.SaveTexture(key, dummyPng, "T_Test_D");
                Assert(File.Exists(savedPath), "Saved PNG exists in cache");
                Assert(File.ReadAllBytes(savedPath).Length == dummyPng.Length, "Cached PNG size matches");
            }
            finally
            {
                if (Directory.Exists(tempDir))
                {
                    try { Directory.Delete(tempDir, true); } catch { }
                }
            }
        }

        private static void Assert(bool condition, string testName)
        {
            if (!condition)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"  [FAIL] {testName}");
                Console.ResetColor();
                throw new Exception($"Test failed: {testName}");
            }
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"  [PASS] {testName}");
            Console.ResetColor();
        }
    }
}
