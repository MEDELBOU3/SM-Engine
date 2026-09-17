// SMHDRIPackage.js
// Shared classification and source resolution for HDRI folders.
//
// An HDRI download is often a small package rather than one file: an EXR/HDR
// for lighting, a tonemapped PNG/JPG for the visible background, and companion
// files from Blender, Godot or USD.  The browser can consume the image files;
// the other files are retained as package metadata for the editor.
(function (global) {
    "use strict";

    const ENVIRONMENT_EXTENSIONS = new Set(["hdr", "exr"]);
    const IMAGE_EXTENSIONS = new Set([
        "png", "jpg", "jpeg", "webp", "bmp", "gif", "avif", "tif", "tiff"
    ]);
    const COMPANION_EXTENSIONS = new Set(["blend", "tres", "usd", "usda", "usdc"]);

    function clean(value) {
        return String(value || "").replace(/\\/g, "/").trim();
    }

    function extension(value) {
        const name = clean(value).split(/[/?#]/)[0];
        const dot = name.lastIndexOf(".");
        return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
    }

    function relativePath(file) {
        return clean(file?.webkitRelativePath || file?.relativePath || file?.name || "");
    }

    function parentPath(file) {
        const path = relativePath(file);
        const slash = path.lastIndexOf("/");
        return slash >= 0 ? path.slice(0, slash) : "";
    }

    function baseName(value) {
        const path = clean(value);
        return path.slice(path.lastIndexOf("/") + 1);
    }

    function stem(value) {
        return baseName(value).replace(/\.[^.]+$/, "");
    }

    function classify(file) {
        const name = baseName(relativePath(file) || file);
        const ext = extension(name);
        if (ENVIRONMENT_EXTENSIONS.has(ext)) return "environment";
        if (COMPANION_EXTENSIONS.has(ext)) return "companion";
        if (IMAGE_EXTENSIONS.has(ext)) {
            return /(tonemap|tone[_ -]?mapped|preview|background|thumbnail|ldr)/i.test(name)
                ? "preview"
                : "image";
        }
        return null;
    }

    function displayName(group) {
        const folder = baseName(group.folderPath);
        if (folder) return folder;
        const source = group.environmentFile || group.previewFile || group.files[0];
        return stem(relativePath(source) || source) || "HDRI Environment";
    }

    function chooseEnvironment(files) {
        return files.find((file) => extension(file?.name || file) === "exr") ||
            files.find((file) => extension(file?.name || file) === "hdr") ||
            null;
    }

    function choosePreview(files) {
        return files.find((file) => classify(file) === "preview") ||
            files.find((file) => classify(file) === "image") ||
            null;
    }

    function groupFiles(files) {
        const groups = new Map();
        for (const file of Array.from(files || [])) {
            const role = classify(file);
            if (!role) continue;
            const folderPath = parentPath(file);
            const key = folderPath.toLowerCase();
            if (!groups.has(key)) {
                groups.set(key, {
                    folderPath,
                    files: [],
                    environmentFile: null,
                    previewFile: null
                });
            }
            groups.get(key).files.push(file);
        }

        return Array.from(groups.values())
            .map((group) => {
                group.environmentFile = chooseEnvironment(group.files);
                group.previewFile = choosePreview(group.files);
                group.isHDRIPackage = !!group.environmentFile ||
                    (!!group.previewFile && group.files.some((file) => classify(file) === "companion"));
                group.name = displayName(group);
                return group;
            })
            .filter((group) => group.isHDRIPackage);
    }

    function sourceFromAsset(asset, panel) {
        if (!asset) return null;
        const packageInfo = asset.hdriPackage || null;
        const environmentId = packageInfo?.environmentAssetId || null;
        const sourceAsset = environmentId && panel?._findById
            ? panel._findById(environmentId) || asset
            : asset;
        const source = sourceAsset.url || sourceAsset.data || packageInfo?.environmentSource || null;
        const kind = extension(sourceAsset.name || source) === "exr"
            ? "exr"
            : extension(sourceAsset.name || source) === "hdr"
                ? "hdr"
                : "ldr";
        return { source, kind, asset: sourceAsset };
    }

    function previewFromAsset(asset, panel) {
        const previewId = asset?.hdriPackage?.previewAssetId;
        const previewAsset = previewId && panel?._findById
            ? panel._findById(previewId)
            : null;
        if (!previewAsset) return null;
        return {
            source: previewAsset.url || previewAsset.data || null,
            asset: previewAsset,
            kind: "ldr"
        };
    }

    global.SMHDRIPackage = Object.freeze({
        extension,
        classify,
        groupFiles,
        sourceFromAsset,
        previewFromAsset,
        environmentExtensions: Array.from(ENVIRONMENT_EXTENSIONS),
        companionExtensions: Array.from(COMPANION_EXTENSIONS)
    });
})(typeof window !== "undefined" ? window : globalThis);
