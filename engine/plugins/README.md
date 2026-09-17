# SM Engine Plugins

`engine/plugins/` is SM Engine's package plugin system. It is separate from the older Settings Add-ons feature: plugins have manifests, dependencies, lifecycle hooks, and runtime contributions.

## Package layout

```text
engine/plugins/
  PluginCatalog.json
  builtins/
    MyPlugin/
      MyPlugin.uplugin.json
      MyPlugin.js
  core/
  templates/
```

Add every manifest path to `PluginCatalog.json`; a browser cannot enumerate plugin folders at runtime.

## Manifest and entry

Manifests accept Unreal-style fields including `FriendlyName`, `VersionName`, `EnabledByDefault`, `CanContainContent`, `Modules`, and `Plugins`, plus lowercase equivalents. `Scripts` lists the classic JavaScript file(s) that register the plugin. Required dependencies start first; dependency cycles block activation with an actionable error.

Each script calls `SMPluginRegistry.register(manifest, factory)`. Its factory receives an `SMPluginContext` and can return `onLoad`, `onEnable`, `onDisable`, `onUnload`, and `onSettingChanged(key, value, settings)` lifecycle hooks. The context automatically disposes work registered through `onWindow`, `onRuntime`, `frame`, `interval`, `provide`, `registerCommand`, and `registerPanel` when disabled.

## Public API

Open the visual plugin manager with **Preferences -> Plugins**, or call:

```js
openPluginsPanel();
// equivalent: EngineSettings.openPlugins();
```

The panel supports searching, plugin metadata, dependency details, enable and
disable controls, runtime states, manifest settings, and plugin commands.

```js
SMPluginManager.list();
await SMPluginManager.enable('com.example.my-plugin');
await SMPluginManager.disable('com.example.my-plugin');
await SMPluginManager.restart('com.example.my-plugin');
await SMPluginManager.runCommand('com.example.my-plugin', 'hello');

// Or use the existing EngineSettings facade:
EngineSettings.enablePlugin('com.example.my-plugin');
EngineSettings.listPlugins();
```

Plugin activation choices and manifest-defined settings persist in browser storage under `sm-engine-plugins-v1`. Start from the files in `templates/` when creating a package.
