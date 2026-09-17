/**
 * SM Engine - Remote Google Drive Asset Sources
 *
 * Add every PUBLIC Google Drive folder you want AssetsPanel to index here.
 * AssetsPanel accepts both object entries and plain URL strings.
 *
 * IMPORTANT:
 * - The Drive folders/files must be readable by the API key you use.
 * - For public packs, set sharing so they can be read without OAuth.
 * - Keep the API key OUT of this file. Configure it separately with:
 *     window.SM_GOOGLE_DRIVE_API_KEY = "YOUR_RESTRICTED_API_KEY";
 *
 * Load this file before or after AssetsPanel.js, but before you press the
 * Content Browser "Drive" sync button.
 */

window.SM_ASSET_DRIVE_SOURCES = [
    {
        id: "SM Engine Assets Collection",
        name: "SM-Engine-game-assets",
        url : "https://drive.google.com/drive/folders/1NS4qBTzRfagZECvDoINMhFGzVaxedFSo?usp=drive_link",
        enabled : true,
        removeMissing: true,
        reveal: false,
        tags: ["glb", "fbx", "2D", "blender", "sound-effects", "animations", "images"]
    },
    {
        id: "Ultimate Stylized Nature Pack",
        name: "Nature Assets",
        url: "https://drive.google.com/drive/folders/1IV3bXHzkNvuNWFHPi4KPx-G4ghuxIuT-",
        enabled: true,

        // Remove local index entries when the remote file was deleted.
        removeMissing: true,

        // false = sync without automatically opening this folder in the UI.
        reveal: false,

        // Optional tags automatically added to every asset from this source.
        tags: ["nature", "environment"],
    },

    {
        id: "Universal Animation Library 2",
        name: "Universal Animation",
        url: "https://drive.google.com/drive/u/2/folders/1lDlRCI_MT2MIHYQMR1CKL_odH2NWA-kv",
        enabled: true,

        // Remove local index entries when the remote file was deleted.
        removeMissing: true,

        // false = sync without automatically opening this folder in the UI.
        reveal: false,

        // Optional tags automatically added to every asset from this source.
        tags: ["animations", "Library"],
    },

    {
        id: "universal_player_sample",
        name: "Universal Player Sample",
        url: "https://drive.google.com/drive/folders/1bq6NZdIbNG3sEfQGxM7QbdBCB1_dfD7l?usp=sharing",
        enabled: true,

        // Remove local AssetsPanel entries if files are deleted from Drive.
        removeMissing: true,

        // false = sync package without automatically opening its folder.
        reveal: false,

        // Tags inherited by every file/assets inside this package.
        tags: [
            "gameplay",
            "player",
            "sample",
            "animation",
            "ual",
            "locomotion",
            "traversal",
            "swimming",
            "package"
        ],
    },
    // ------------------------------------------------------------
    // ADD MORE DRIVE FOLDERS HERE.
    // You can use the full object format:
    // ------------------------------------------------------------
    {
        id: "spitsheet_game_assets",
        name: "shinobi spritsheet",
        url: "https://drive.google.com/drive/folders/1_FVwNTez5flkBVAlSgrrvLGV3yzFMEdr?usp=sharing",
        enabled: true,
        removeMissing: true,
        reveal: false,
        tags: ["spritsheet"],
    },

    // ------------------------------------------------------------
    // Or just paste a URL. AssetsPanel will read the folder name
    // directly from Google Drive metadata:
    // ------------------------------------------------------------
    // "https://drive.google.com/drive/folders/ANOTHER_FOLDER_ID",
];

/**
 * Optional convenience helpers for the browser console or other engine code.
 * These change the in-memory list only; permanent entries still belong above.
 */
window.SMAssetDriveSources = {
    list() {
        return Array.isArray(window.SM_ASSET_DRIVE_SOURCES)
            ? [...window.SM_ASSET_DRIVE_SOURCES]
            : [];
    },

    add(source) {
        if (!Array.isArray(window.SM_ASSET_DRIVE_SOURCES)) {
            window.SM_ASSET_DRIVE_SOURCES = [];
        }

        window.SM_ASSET_DRIVE_SOURCES.push(source);
        return source;
    },

    remove(idOrUrl) {
        if (!Array.isArray(window.SM_ASSET_DRIVE_SOURCES)) return false;

        const before = window.SM_ASSET_DRIVE_SOURCES.length;
        window.SM_ASSET_DRIVE_SOURCES = window.SM_ASSET_DRIVE_SOURCES.filter(
            (entry) => {
                if (typeof entry === "string") {
                    return entry !== idOrUrl;
                }

                return entry?.id !== idOrUrl && entry?.url !== idOrUrl;
            },
        );

        return window.SM_ASSET_DRIVE_SOURCES.length !== before;
    },
};
