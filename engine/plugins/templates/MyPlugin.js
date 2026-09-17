(function () {
    'use strict';

    window.SMPluginRegistry.register({
        id: 'com.example.my-plugin',
        name: 'My Plugin',
        version: '1.0.0',
        description: 'Describe what this plugin contributes to SM Engine.',
        author: 'Your Name',
        category: 'Other',
        enabledByDefault: false,
        modules: [{ name: 'MyPlugin', type: 'Editor', loadingPhase: 'Default' }],
        dependencies: []
    }, (context) => ({
        onEnable() {
            context.registerCommand({ id: 'hello', label: 'My Plugin: Hello' }, () => {
                context.log('Hello from My Plugin.');
            });
        },
        onDisable() {
            context.log('Disabled.');
        }
    }));
})();
