using System;
using System.Collections.Generic;
using CUE4Parse.UE4.Assets.Exports.Material;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse.UE4.Objects.Core.Math;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge.Extractors
{
    public class UnrealMaterialExtractor
    {
        private readonly UnrealTextureExtractor _textureExtractor;

        public UnrealMaterialExtractor(UnrealTextureExtractor? textureExtractor = null)
        {
            _textureExtractor = textureExtractor ?? new UnrealTextureExtractor();
        }

        public UnrealMaterialData Extract(UUnrealMaterial? material, int slotIndex = 0, string? slotName = null)
        {
            var data = new UnrealMaterialData
            {
                SlotIndex = slotIndex,
                SlotName = slotName ?? $"Slot_{slotIndex}",
                Name = material?.Name ?? $"Material_{slotIndex}",
                VirtualPath = material?.GetPathName() ?? string.Empty
            };

            if (material == null)
            {
                data.Fidelity = "approximate";
                return data;
            }

            try
            {
                // 1. Primary parameter pass
                var p1 = new CMaterialParams();
                material.GetParams(p1);

                if (!p1.IsNull)
                {
                    data.Roughness = p1.RoughnessValue > 0f ? p1.RoughnessValue : 0.5f;
                    data.Metallic = p1.MetallicValue >= 0f ? p1.MetallicValue : 0.0f;
                    data.Specular = p1.SpecularValue >= 0f ? p1.SpecularValue : 0.5f;

                    if (p1.DiffuseColor.HasValue)
                    {
                        data.BaseColorHex = LinearColorToHex(p1.DiffuseColor.Value);
                    }

                    if (p1.EmissiveColor.HasValue)
                    {
                        data.EmissiveColorHex = LinearColorToHex(p1.EmissiveColor.Value);
                    }

                    if (p1.IsTransparent)
                    {
                        data.BlendMode = "Translucent";
                    }

                    // Extract primary texture references if present
                    ExtractTextureRef(p1.Diffuse, "baseColor", data);
                    ExtractTextureRef(p1.Normal, "normal", data);
                    ExtractTextureRef(p1.Specular, "metallicRoughness", data);
                    ExtractTextureRef(p1.Emissive, "emissive", data);
                    ExtractTextureRef(p1.Opacity, "opacity", data);
                }

                // 2. Secondary parameter pass for dictionaries and full parameter sets
                var p2 = new CMaterialParams2();
                material.GetParams(p2, EMaterialDepth.AllLayers);

                if (!p2.IsNull)
                {
                    data.BlendMode = p2.BlendMode.ToString();
                    data.ShadingModel = p2.ShadingModel.ToString();

                    if (p2.Scalars != null)
                    {
                        foreach (var (k, v) in p2.Scalars)
                        {
                            data.Scalars[k] = v;
                            var lk = k.ToLowerInvariant();
                            if (lk.Contains("rough")) data.Roughness = Math.Clamp(v, 0f, 1f);
                            if (lk.Contains("metal")) data.Metallic = Math.Clamp(v, 0f, 1f);
                            if (lk.Contains("spec")) data.Specular = Math.Clamp(v, 0f, 1f);
                            if (lk.Contains("opac")) data.Opacity = Math.Clamp(v, 0f, 1f);
                        }
                    }

                    if (p2.Colors != null)
                    {
                        foreach (var (k, v) in p2.Colors)
                        {
                            var hex = LinearColorToHex(v);
                            data.Colors[k] = hex;
                            var lk = k.ToLowerInvariant();
                            if (lk.Contains("basecolor") || lk.Contains("diffuse") || lk.Contains("albedo"))
                                data.BaseColorHex = hex;
                            if (lk.Contains("emissive"))
                                data.EmissiveColorHex = hex;
                        }
                    }

                    if (p2.Textures != null)
                    {
                        foreach (var (k, texMat) in p2.Textures)
                        {
                            if (texMat != null)
                            {
                                data.TextureSlots[k] = texMat.GetPathName();
                                ExtractTextureRef(texMat, UnrealTextureExtractor.DetectSemanticFromName(k), data);
                            }
                        }
                    }
                }

                // 3. Determine fidelity
                data.Fidelity = DetermineFidelity(data.ShadingModel, data.BlendMode, material);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[UnrealMaterialExtractor] Failed to extract material {material.Name}: {ex.Message}");
                data.Fidelity = "approximate";
            }

            return data;
        }

        private void ExtractTextureRef(UUnrealMaterial? mat, string semantic, UnrealMaterialData data)
        {
            if (mat is UTexture tex)
            {
                var texData = _textureExtractor.Extract(tex, semantic);
                if (texData != null && !data.ExtractedTextures.Exists(t => t.VirtualPath == texData.VirtualPath))
                {
                    data.ExtractedTextures.Add(texData);
                    data.TextureSlots[semantic] = texData.VirtualPath;
                }
            }
        }

        private static string LinearColorToHex(FLinearColor c)
        {
            int r = Math.Clamp((int)(c.R * 255f), 0, 255);
            int g = Math.Clamp((int)(c.G * 255f), 0, 255);
            int b = Math.Clamp((int)(c.B * 255f), 0, 255);
            return $"#{r:X2}{g:X2}{b:X2}";
        }

        private static string DetermineFidelity(string shadingModel, string blendMode, UUnrealMaterial mat)
        {
            var sm = shadingModel.ToLowerInvariant();
            if (sm.Contains("unlit") || sm.Contains("defaultlit"))
            {
                if (mat is UMaterialInstanceConstant)
                {
                    return "converted";
                }
                return "native";
            }

            if (sm.Contains("subsurface") || sm.Contains("clearcoat") || sm.Contains("twosidedfoliage") || sm.Contains("cloth"))
            {
                return "approximate";
            }

            return "approximate";
        }
    }
}
