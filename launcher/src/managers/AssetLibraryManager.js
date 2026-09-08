import {
    BlendSwapService
} from "../services/BlendSwapService.js";

export class AssetLibraryManager {
    constructor(app) {
        this.app = app;

        this.assets = [];
        this.loading = false;
        this.error = null;
        this.hasLoaded = false;

        this.progress =
            new Map();

        this.unsubscribeProgress =
            BlendSwapService
                .onDownloadProgress(
                    detail => {
                        if (
                            detail?.assetId ==
                            null
                        ) {
                            return;
                        }

                        this.progress.set(
                            Number(
                                detail.assetId
                            ),
                            detail
                        );

                        this.app
                            ?.router
                            ?.refresh?.();
                    }
                );
    }

    get(assetId) {
        return (
            this.assets.find(
                asset =>
                    Number(
                        asset.assetId
                    ) ===
                    Number(assetId)
            ) ||
            null
        );
    }

    isInstalled(assetId) {
        return !!this.get(
            assetId
        );
    }

    getProgress(assetId) {
        return (
            this.progress.get(
                Number(assetId)
            ) ||
            null
        );
    }

    async load() {
        this.loading = true;
        this.error = null;

        try {
            const result =
                await BlendSwapService
                    .listLibrary();

            if (!result?.ok) {
                throw new Error(
                    result?.error ||
                    "Could not load the SM Asset Library."
                );
            }

            this.assets =
                Array.isArray(
                    result.assets
                )
                    ? result.assets
                    : [];

            this.hasLoaded = true;
        } catch (error) {
            this.error =
                error?.message ||
                String(error);

            this.hasLoaded = true;
        } finally {
            this.loading = false;
        }
    }

    async add(asset) {
        const result =
            await BlendSwapService
                .addToLibrary(
                    asset
                );

        if (!result?.ok) {
            throw new Error(
                result?.error ||
                "Could not add asset to the SM Library."
            );
        }

        this.progress.delete(
            Number(asset.id)
        );

        await this.load();

        return result.asset;
    }

    async remove(assetId) {
        const result =
            await BlendSwapService
                .removeFromLibrary(
                    assetId
                );

        if (!result?.ok) {
            throw new Error(
                result?.error ||
                "Could not remove asset from the SM Library."
            );
        }

        await this.load();

        return true;
    }

    async addToProject(
        assetId,
        projectId
    ) {
        const result =
            await BlendSwapService
                .addToProject(
                    assetId,
                    projectId
                );

        if (!result?.ok) {
            throw new Error(
                result?.error ||
                "Could not add asset to project."
            );
        }

        return result;
    }
}
