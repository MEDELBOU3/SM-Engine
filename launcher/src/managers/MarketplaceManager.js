import {
    BlendSwapService
} from "../services/BlendSwapService.js";

export class MarketplaceManager {
    constructor(app) {
        this.app = app;

        this.query = "";
        this.license = "cc0";
        this.format = "blender";
        this.page = 1;

        this.assets = [];
        this.pagination = null;

        this.loading = false;
        this.error = null;
        this.hasLoaded = false;
    }

    getAsset(assetId) {
        return (
            this.assets.find(
                asset =>
                    Number(asset.id) ===
                    Number(assetId)
            ) ||
            null
        );
    }

    async search(options = {}) {
        if (this.loading) {
            return;
        }

        this.query =
            options.q ??
            this.query;

        this.license =
            options.license ??
            this.license;

        this.format =
            options.format ??
            this.format;

        this.page =
            Math.max(
                1,
                Number(
                    options.page ??
                    this.page
                ) || 1
            );

        this.loading = true;
        this.error = null;

        try {
            const result =
                await BlendSwapService.search({
                    q:
                        this.query,

                    license:
                        this.license,

                    format:
                        this.format,

                    page:
                        this.page
                });

            if (!result?.ok) {
                throw new Error(
                    result?.error ||
                    "BlendSwap search failed."
                );
            }

            this.assets =
                Array.isArray(
                    result.data
                )
                    ? result.data
                    : [];

            this.pagination =
                result.pagination ||
                null;

            this.hasLoaded = true;
        } catch (error) {
            this.assets = [];
            this.pagination = null;

            this.error =
                error?.message ||
                String(error);

            this.hasLoaded = true;
        } finally {
            this.loading = false;
        }
    }

    async nextPage() {
        const pages =
            Number(
                this.pagination?.pages ||
                1
            );

        if (this.page >= pages) {
            return;
        }

        await this.search({
            page:
                this.page + 1
        });
    }

    async previousPage() {
        if (this.page <= 1) {
            return;
        }

        await this.search({
            page:
                this.page - 1
        });
    }
}
