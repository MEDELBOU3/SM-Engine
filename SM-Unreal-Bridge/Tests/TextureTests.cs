using System;
using System.Text.Json;
using SM.UnrealBridge.Extractors;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge.Tests
{
    public static class TextureTests
    {
        public static void RunAll()
        {
            Console.WriteLine("=== RUNNING TEXTURE TESTS ===");

            TestSemanticDetection();
            TestTextureModelSerialization();

            Console.WriteLine("\nTextureTests Completed: All Passed.\n");
        }

        private static void TestSemanticDetection()
        {
            Assert(UnrealTextureExtractor.DetectSemanticFromName("T_Chair_D") == "baseColor", "T_Chair_D semantic baseColor");
            Assert(UnrealTextureExtractor.DetectSemanticFromName("T_Chair_Diffuse") == "baseColor", "T_Chair_Diffuse semantic baseColor");
            Assert(UnrealTextureExtractor.DetectSemanticFromName("T_Chair_Albedo") == "baseColor", "T_Chair_Albedo semantic baseColor");
            Assert(UnrealTextureExtractor.DetectSemanticFromName("T_Chair_BaseColor") == "baseColor", "T_Chair_BaseColor semantic baseColor");
            Assert(UnrealTextureExtractor.DetectSemanticFromName("T_Chair_N") == "normal", "T_Chair_N semantic normal");
            Assert(UnrealTextureExtractor.DetectSemanticFromName("T_Chair_Normal") == "normal", "T_Chair_Normal semantic normal");
            Assert(UnrealTextureExtractor.DetectSemanticFromName("T_Chair_R") == "roughness", "T_Chair_R semantic roughness");
            Assert(UnrealTextureExtractor.DetectSemanticFromName("T_Chair_M") == "metallic", "T_Chair_M semantic metallic");
            Assert(UnrealTextureExtractor.DetectSemanticFromName("T_Chair_E") == "emissive", "T_Chair_E semantic emissive");
            Assert(UnrealTextureExtractor.DetectSemanticFromName("T_Chair_AO") == "ambientOcclusion", "T_Chair_AO semantic ambientOcclusion");
            Assert(UnrealTextureExtractor.DetectSemanticFromName("T_Chair_ORM") == "ormComposite", "T_Chair_ORM semantic ormComposite");
        }

        private static void TestTextureModelSerialization()
        {
            var tex = new UnrealTextureData
            {
                Name = "T_Brick_D",
                VirtualPath = "/Game/Textures/T_Brick_D",
                Width = 2048,
                Height = 2048,
                Format = "BC7",
                IsSRGB = true,
                DiskPath = "C:\\test\\T_Brick_D.png",
                DownloadUrl = "/download?file=test.png",
                FileSizeBytes = 409600,
                Semantic = "baseColor",
                MipCount = 11
            };

            var json = JsonSerializer.Serialize(tex);
            Assert(json.Contains("\"format\":\"BC7\""), "Texture JSON contains format");
            Assert(json.Contains("\"semantic\":\"baseColor\""), "Texture JSON contains semantic");
            Assert(json.Contains("\"downloadUrl\":"), "Texture JSON contains downloadUrl");

            var deserialized = JsonSerializer.Deserialize<UnrealTextureData>(json);
            Assert(deserialized != null && deserialized.Width == 2048, "Texture deserialized matches width");
            Assert(deserialized!.Name == "T_Brick_D", "Texture deserialized matches name");
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
