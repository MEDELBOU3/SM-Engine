(function () {
    const root = window.SMModifiers = window.SMModifiers || {};
    root.SolidifyModifier = class SolidifyModifier extends root.Modifier {
        constructor(config = {}) {
            super(Object.assign({ name: "Solidify", category: "modify" }, config));
        }
    };
})();
