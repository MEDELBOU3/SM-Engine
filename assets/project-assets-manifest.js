(() => {
    const rootPath = "assets/craftpix-net-381103-free-simple-summer-top-down-vector-tileset";

    const makeGroundSeries = (ext) =>
        Array.from({ length: 56 }, (_, index) =>
            `Top-Down Simple Summer_Ground ${String(index + 1).padStart(2, "0")}.${ext}`
        );

    const scenePropBaseNames = [
        "Top-Down Simple Summer_Prop - Blue Banner",
        "Top-Down Simple Summer_Prop - Bushes Large",
        "Top-Down Simple Summer_Prop - Bushes Medium",
        "Top-Down Simple Summer_Prop - Bushes Small",
        "Top-Down Simple Summer_Prop - Campfire",
        "Top-Down Simple Summer_Prop - Castle Round",
        "Top-Down Simple Summer_Prop - Castle Square",
        "Top-Down Simple Summer_Prop - Flag",
        "Top-Down Simple Summer_Prop - House",
        "Top-Down Simple Summer_Prop - Magic Stone Tower",
        "Top-Down Simple Summer_Prop - Red Banner",
        "Top-Down Simple Summer_Prop - Rock 01",
        "Top-Down Simple Summer_Prop - Rock 02",
        "Top-Down Simple Summer_Prop - Rock 03",
        "Top-Down Simple Summer_Prop - Rock 04",
        "Top-Down Simple Summer_Prop - Rock 05",
        "Top-Down Simple Summer_Prop - Tent",
        "Top-Down Simple Summer_Prop - Treasure Chest",
        "Top-Down Simple Summer_prop - Tree Large",
        "Top-Down Simple Summer_Prop - Tree Medium",
        "Top-Down Simple Summer_Prop - Tree Small",
        "Top-Down Simple Summer_Prop - Tree Stump Short",
        "Top-Down Simple Summer_Prop - Tree Stump Tall",
        "Top-Down Simple Summer_Prop - Watchtower Short",
        "Top-Down Simple Summer_Prop - Watchtower Tall",
        "Top-Down Simple Summer_Prop - Well",
        "Top-Down Simple Summer_Prop - Windmill",
        "Top-Down Simple Summer_Prop - Wooden Barrel",
        "Top-Down Simple Summer_Prop - Wooden Bridge Horizontal",
        "Top-Down Simple Summer_Prop - Wooden Bridge Vertical",
        "Top-Down Simple Summer_Prop - Wooden Cart",
        "Top-Down Simple Summer_Prop - Wooden Fence Horizontal",
        "Top-Down Simple Summer_Prop - Wooden Fence Vertical",
    ];

    const makePropSeries = (ext) => scenePropBaseNames.map((name) => `${name}.${ext}`);

    const pngFiles = [
        ...makeGroundSeries("png"),
        ...makePropSeries("png"),
    ];

    const epsFiles = [
        "Top-Down Simple Summer.eps",
        ...makeGroundSeries("eps"),
        ...makePropSeries("eps"),
    ];

    window.SMProjectAssetManifest = {
        folders: [
            {
                id: "project_assets_craftpix_root",
                name: "craftpix-net-381103-free-simple-summer-top-down-vector-tileset",
                parentId: null,
                children: [
                    "project_assets_craftpix_ai",
                    "project_assets_craftpix_eps",
                    "project_assets_craftpix_png",
                ],
            },
            {
                id: "project_assets_craftpix_ai",
                name: "AI",
                parentId: "project_assets_craftpix_root",
                children: [],
            },
            {
                id: "project_assets_craftpix_eps",
                name: "EPS",
                parentId: "project_assets_craftpix_root",
                children: [],
            },
            {
                id: "project_assets_craftpix_png",
                name: "PNG",
                parentId: "project_assets_craftpix_root",
                children: [],
            },
        ],
        assets: [
            {
                id: "craftpix_manifest_license",
                name: "license.txt",
                type: "file",
                folderId: "project_assets_craftpix_root",
                data: `${rootPath}/license.txt`,
                tags: ["craftpix", "license", "document"],
            },
            {
                id: "craftpix_manifest_link",
                name: "Free Assets Craftpix!.url",
                type: "file",
                folderId: "project_assets_craftpix_root",
                data: `${rootPath}/Free Assets Craftpix!.url`,
                tags: ["craftpix", "reference", "link"],
            },
        ],
        groups: [
            {
                idPrefix: "craftpix_summer_ai",
                folderId: "project_assets_craftpix_ai",
                type: "file",
                basePath: `${rootPath}/AI`,
                tags: ["craftpix", "summer", "top-down", "source", "vector"],
                files: ["Top-Down Simple Summer.ai"],
            },
            {
                idPrefix: "craftpix_summer_eps",
                folderId: "project_assets_craftpix_eps",
                type: "file",
                basePath: `${rootPath}/EPS`,
                tags: ["craftpix", "summer", "top-down", "source", "vector"],
                files: epsFiles,
            },
            {
                idPrefix: "craftpix_summer_png",
                folderId: "project_assets_craftpix_png",
                type: "texture",
                basePath: `${rootPath}/PNG`,
                tags: ["craftpix", "summer", "top-down", "2d", "tileset"],
                files: pngFiles,
            },
        ],
    };
})();
