(function () {
    const root = window.SMModifiers = window.SMModifiers || {};
    root.WeldModifier = class WeldModifier extends root.Modifier {
        constructor(config = {}) {
            super(Object.assign({ name: "Weld", category: "modify" }, config));
        }
    };
})();
