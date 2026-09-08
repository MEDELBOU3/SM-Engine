export class BlendSwapService {
    static get api() {
        return window.launcherAPI || null;
    }

    static async search(options = {}) {
        if (!this.api?.searchBlendSwap) {
            return {
                ok: false,
                error: "BlendSwap bridge is unavailable.",
                data: [],
                pagination: null
            };
        }

        return this.api.searchBlendSwap({
            q: options.q || "",
            license: options.license ?? "cc0",
            format: options.format || "blender",
            page: Math.max(
                1,
                Number(options.page) || 1
            )
        });
    }

    static async getPreview(
        assetId
    ) {
        if (!this.api?.getBlendSwapPreview) {
            return {
                ok: false,
                dataURL: null,
                error: "BlendSwap preview bridge is unavailable."
            };
        }

        return this.api.getBlendSwapPreview(
            assetId
        );
    }


    static async listLibrary() {
        if (!this.api?.listAssetLibrary) {
            return {
                ok: false,
                assets: [],
                error: "SM Asset Library bridge is unavailable."
            };
        }

        return this.api.listAssetLibrary();
    }

    static async addToLibrary(asset) {
        if (!this.api?.addAssetToLibrary) {
            return {
                ok: false,
                error: "SM Asset Library bridge is unavailable."
            };
        }

        return this.api.addAssetToLibrary(asset);
    }

    static async removeFromLibrary(assetId) {
        if (!this.api?.removeAssetFromLibrary) {
            return {
                ok: false,
                error: "SM Asset Library bridge is unavailable."
            };
        }

        return this.api.removeAssetFromLibrary(assetId);
    }

    static async addToProject(
        assetId,
        projectId
    ) {
        if (!this.api?.addLibraryAssetToProject) {
            return {
                ok: false,
                error: "Add-to-project bridge is unavailable."
            };
        }

        return this.api.addLibraryAssetToProject({
            assetId,
            projectId
        });
    }

    static onDownloadProgress(callback) {
        if (!this.api?.onLibraryDownloadProgress) {
            return () => {};
        }

        return this.api.onLibraryDownloadProgress(
            callback
        );
    }
}
