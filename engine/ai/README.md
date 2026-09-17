# SM Engine Gemini AI

The AI assistant uses the Gemini Developer API directly from the SM Engine renderer. It does not require an npm SDK and it never contains a hardcoded API key.

## Open the panel

Restart SM Engine after updating, then click **AI Assistant** in the top workspace toolbar. Paste a Gemini API key from Google AI Studio, choose **Gemini 3.5 Flash-Lite**, and press **Save**. Installations that previously saved a retired Gemini 2.5 model are migrated automatically.

The key is kept only for the current application session unless **Remember key on this device** is enabled. A remembered key is stored in this app's local browser storage. It is sent only in the `x-goog-api-key` header to the Gemini API.

## Execution model

1. `SMAIContextBuilder` creates a compact snapshot of the workspace, camera, scene, and selected object.
2. `SMAIService` sends the conversation, context, and function declarations to Gemini.
3. Gemini may return one or more function calls.
4. `SMAICommandExecutor` checks each call with `SMAIPermissionPolicy` before executing it.
5. Read-only tools and normal scene mutations run immediately in **Direct Build** mode. Destructive actions such as deleting content or replacing terrain still ask for confirmation. Direct Build can be disabled from the panel.

The agent can chain up to 16 tool rounds for larger builds. Identical successful calls are de-duplicated, and reaching the tool budget produces a completion summary instead of a maximum-round error.

Available tool groups cover objects, materials, lighting, cameras, flat-terrain generation, procedural terrain textures, and existing content-browser assets. New tools can be added with `window.smAIToolRegistry.register({...})`.
