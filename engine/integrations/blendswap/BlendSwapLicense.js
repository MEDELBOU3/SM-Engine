(function (global) {
    'use strict';

    const LABELS = {
        'cc0': 'CC0',
        'cc-by': 'CC BY',
        'cc-by-sa': 'CC BY-SA',
        'cc-by-nc': 'CC BY-NC',
        'cc-by-nc-sa': 'CC BY-NC-SA'
    };

    function keyOf(asset) {
        return String(
            asset?.license?.key ||
            asset?.license ||
            ''
        ).toLowerCase();
    }

    function requiresAttribution(asset) {
        const key = keyOf(asset);
        return key.includes('by') && key !== 'cc0';
    }

    function allowsCommercial(asset) {
        const key = keyOf(asset);
        if (!key) return null;
        return !key.includes('-nc');
    }

    function describe(asset) {
        const key = keyOf(asset);

        return {
            key,
            label:
                LABELS[key] ||
                asset?.license?.name ||
                key ||
                'Unknown',
            source:
                asset?.licenseSource ||
                asset?.license_source ||
                asset?.license?.license_source ||
                'uploader_declared',
            requiresAttribution:
                requiresAttribution(asset),
            allowsCommercial:
                allowsCommercial(asset),
            shareAlike:
                key.includes('-sa'),
            url:
                asset?.license?.url ||
                null
        };
    }

    function attributionText(asset) {
        const info = describe(asset);

        if (!info.requiresAttribution) {
            return '';
        }

        const title =
            asset?.title ||
            'BlendSwap asset';

        const author =
            asset?.author?.username ||
            'unknown author';

        const source =
            asset?.url ||
            'BlendSwap';

        return (
            `${title} by ${author} — ` +
            `${info.label} — ${source}`
        );
    }

    global.SMBlendSwapLicense = {
        describe,
        attributionText
    };
})(typeof window !== 'undefined' ? window : globalThis);
