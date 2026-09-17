(function () {
    'use strict';

    window.SMPluginRegistry.register({
        id: 'sm.scene-notes',
        name: 'Scene Notes',
        version: '1.0.0',
        description: 'Adds a lightweight note command for the active scene.',
        author: 'SM Engine',
        category: 'Editor',
        builtIn: true,
        enabledByDefault: false,
        modules: [{ name: 'SceneNotes', type: 'Editor', loadingPhase: 'Default' }],
        settings: [{ id: 'prefix', label: 'Default Note Prefix', type: 'string', default: 'Note' }]
    }, (context) => {
        const addNote = (text = '') => {
            const note = {
                id: `scene-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                text: `${context.getSetting('prefix', 'Note')}: ${String(text).trim()}`,
                createdAt: new Date().toISOString()
            };
            window.dispatchEvent(new CustomEvent('sm:scene-note-created', { detail: { note, pluginId: context.id } }));
            context.log(`Created ${note.text}`);
            return note;
        };

        return {
            onEnable() {
                context.registerCommand({
                    id: 'add-note',
                    label: 'Add Scene Note',
                    description: 'Creates a scene-note event for editor tools to consume.'
                }, addNote);
            },
            commands: { addNote }
        };
    });
})();
