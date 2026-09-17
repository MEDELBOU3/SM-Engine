using System;
using System.Text.Json;
using SM.UnrealBridge.Extractors;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge.Tests
{
    public static class MaterialTests
    {
        public static void RunAll()
        {
            Console.WriteLine("=== RUNNING MATERIAL TESTS ===");

            TestMaterialModelDefaults();
            TestMaterialFidelity();
            TestMaterialSerialization();
            TestNullMaterialExtraction();

            Console.WriteLine("\nMaterialTests Completed: All Passed.\n");
        }

        private static void TestMaterialModelDefaults()
        {
            var mat = new UnrealMaterialData
            {
                Name = "M_Wood",
                SlotIndex = 0,
                SlotName = "WoodSlot"
            };

            Assert(mat.Roughness == 0.5f, "Default roughness is 0.5");
            Assert(mat.Metallic == 0.0f, "Default metallic is 0.0");
            Assert(mat.BaseColorHex == "#ffffff", "Default base color is white");
            Assert(mat.ShadingModel == "DefaultLit", "Default shading model is DefaultLit");
            Assert(mat.BlendMode == "Opaque", "Default blend mode is Opaque");
            Assert(mat.Fidelity == "native", "Default fidelity is native");
        }

        private static void TestMaterialFidelity()
        {
            var matExtractor = new UnrealMaterialExtractor();
            var nullMat = matExtractor.Extract(null, 1, "Slot_1");
            Assert(nullMat.Fidelity == "approximate", "Null material fidelity is approximate");
            Assert(nullMat.SlotName == "Slot_1", "SlotName preserved");
            Assert(nullMat.SlotIndex == 1, "SlotIndex preserved");
        }

        private static void TestMaterialSerialization()
        {
            var mat = new UnrealMaterialData
            {
                Name = "M_Metal_Chrome",
                VirtualPath = "/Game/Materials/M_Metal_Chrome",
                Roughness = 0.1f,
                Metallic = 1.0f,
                Specular = 0.9f,
                BaseColorHex = "#cccccc",
                EmissiveColorHex = "#000000",
                ShadingModel = "DefaultLit",
                BlendMode = "Opaque",
                TwoSided = false,
                Fidelity = "native"
            };
            mat.Scalars["Roughness"] = 0.1f;
            mat.Scalars["Metallic"] = 1.0f;
            mat.TextureSlots["baseColor"] = "/Game/Textures/T_Chrome_D";

            var json = JsonSerializer.Serialize(mat);
            Assert(json.Contains("\"metallic\":1"), "Material JSON contains metallic");
            Assert(json.Contains("\"roughness\":0.1"), "Material JSON contains roughness");
            Assert(json.Contains("\"fidelity\":\"native\""), "Material JSON contains fidelity");

            var deserialized = JsonSerializer.Deserialize<UnrealMaterialData>(json);
            Assert(deserialized != null && deserialized.Name == "M_Metal_Chrome", "Deserialized matches name");
            Assert(deserialized!.Metallic == 1.0f, "Deserialized matches metallic");
            Assert(deserialized.TextureSlots.ContainsKey("baseColor"), "TextureSlots contains baseColor");
        }

        private static void TestNullMaterialExtraction()
        {
            var extractor = new UnrealMaterialExtractor();
            var res = extractor.Extract(null, 0, "DefaultSlot");
            Assert(res != null, "Extracted object is not null");
            Assert(res!.SlotName == "DefaultSlot", "Slot name is DefaultSlot");
            Assert(res.BaseColorHex == "#ffffff", "Default BaseColorHex is #ffffff");
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
