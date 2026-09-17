using System.Text;
using SM.UnrealBridge.Conversion;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge.Tests;

public static class MeshTests
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

        Console.WriteLine("\n=== RUNNING MESH EXTRACTION & GLB CONVERTER TESTS ===");

        // 1. Create synthetic UnrealMeshData representing a cube / prop
        var meshData = new UnrealMeshData
        {
            Type = "static-mesh",
            Name = "SM_Chair",
            Path = "/Game/Props/SM_Chair"
        };

        meshData.Materials.Add(new UnrealMaterialSlot
        {
            Slot = 0,
            Name = "M_ChairWood",
            Path = "/Game/Props/M_ChairWood"
        });

        // 4 vertices, 2 triangles (quad)
        var lod0 = new UnrealMeshLodData
        {
            Level = 0,
            VertexCount = 4,
            IndexCount = 6,
            Positions = new float[]
            {
                -50f, -50f, 0f,
                 50f, -50f, 0f,
                 50f,  50f, 0f,
                -50f,  50f, 0f
            },
            Normals = new float[]
            {
                0f, 0f, 1f,
                0f, 0f, 1f,
                0f, 0f, 1f,
                0f, 0f, 1f
            },
            Tangents = new float[]
            {
                1f, 0f, 0f,
                1f, 0f, 0f,
                1f, 0f, 0f,
                1f, 0f, 0f
            },
            Indices = new uint[] { 0, 1, 2, 0, 2, 3 }
        };
        lod0.Uvs.Add(new float[]
        {
            0f, 0f,
            1f, 0f,
            1f, 1f,
            0f, 1f
        });
        lod0.Sections.Add(new UnrealMeshSection
        {
            FirstIndex = 0,
            IndexCount = 6,
            MaterialIndex = 0,
            MinVertexIndex = 0,
            MaxVertexIndex = 3
        });

        meshData.Lods.Add(lod0);

        // 2. Convert to GLB
        var glbBytes = MeshToGLTFConverter.ConvertToGLB(meshData);
        Assert(glbBytes != null && glbBytes.Length > 0, "GLB byte array generated");

        // Verify glTF binary magic (0x46546C67 = "glTF" in ASCII)
        var magic = Encoding.ASCII.GetString(glbBytes, 0, 4);
        Assert(magic == "glTF", $"GLB binary header magic is 'glTF' (got '{magic}')");

        // Verify 12-byte header (magic, version, length)
        var version = BitConverter.ToUInt32(glbBytes, 4);
        var totalLength = BitConverter.ToUInt32(glbBytes, 8);
        Assert(version == 2, $"GLB version is 2.0 (got {version})");
        Assert(totalLength == glbBytes.Length, $"GLB header length matches buffer length ({totalLength} == {glbBytes.Length})");

        // 3. Test UnrealExporter disk cache export
        var tempOut = Path.Combine(Path.GetTempPath(), "UnrealExportTest_" + Guid.NewGuid().ToString("N"));
        try
        {
            var (glbPath, glbSize) = UnrealExporter.ExportMeshToGLB(meshData, tempOut);
            Assert(File.Exists(glbPath), $"Exported GLB exists on disk: {glbPath}");
            Assert(glbSize == glbBytes.Length, $"Exported GLB file size matches ({glbSize} bytes)");

            var metaPath = Path.ChangeExtension(glbPath, ".json");
            Assert(File.Exists(metaPath), "Exported companion metadata JSON exists on disk");
        }
        finally
        {
            if (Directory.Exists(tempOut))
            {
                Directory.Delete(tempOut, true);
            }
        }

        // 4. Test Nanite diagnostic emission on empty LODs
        var emptyMeshData = new UnrealMeshData { Name = "NaniteOnly" };
        var naniteDiag = UnrealDiagnostics.NaniteOnlyAsset(emptyMeshData.Name);
        Assert(naniteDiag.Code == "NANITE_ONLY_ASSET" && naniteDiag.Message.Contains("Nanite"), "Nanite diagnostic generated for non-renderable mesh");

        Console.WriteLine($"\nMeshTests Completed: {passed}/{total} Passed.\n");
        return total - passed;
    }
}
