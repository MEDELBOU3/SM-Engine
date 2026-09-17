const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const storage = () => {
    const values = new Map();
    return {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key)
    };
};

global.window = global;
global.localStorage = storage();
global.sessionStorage = storage();
global.CustomEvent = class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
global.dispatchEvent = () => true;
global.confirm = () => true;

const load = (file) => vm.runInThisContext(
    fs.readFileSync(path.join(root, file), 'utf8'),
    { filename: file }
);

load('engine/ai/SMAIPermissionPolicy.js');
load('engine/ai/SMAIToolRegistry.js');
load('engine/ai/SMAICommandExecutor.js');
assert.strictEqual(window.smAIPermissionPolicy.autoApproveMutations, true);

let executions = 0;
window.smAIToolRegistry.register({
    name: 'test_scene_tool',
    description: 'Test tool',
    permission: 'mutate',
    parameters: {
        type: 'object',
        properties: { value: { type: 'number' } },
        required: ['value']
    },
    execute: ({ value }) => {
        executions += 1;
        return { doubled: value * 2 };
    }
});

window.smAIContextBuilder = {
    buildSystemInstruction: () => 'Test SM Engine context'
};
window.smAICommandExecutor = new window.SMAICommandExecutor(
    window.smAIToolRegistry,
    window.smAIPermissionPolicy
);

load('engine/ai/SMAIService.js');

// Existing users may have the retired model persisted from an older build.
// A fresh service must repair that setting before making any request.
localStorage.setItem('sm-ai-gemini-model', 'gemini-2.5-flash-lite');
const migratedService = new window.SMAIService();
assert.strictEqual(migratedService.model, 'gemini-3.5-flash-lite');
assert.strictEqual(localStorage.getItem('sm-ai-gemini-model'), 'gemini-3.5-flash-lite');

const requests = [];
global.fetch = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    if (requests.length === 1) {
        return {
            ok: true,
            json: async () => ({
                candidates: [{
                    content: {
                        role: 'model',
                        parts: [{ functionCall: { name: 'test_scene_tool', args: { value: 7 } } }]
                    }
                }]
            })
        };
    }
    return {
        ok: true,
        json: async () => ({
            candidates: [{ content: { role: 'model', parts: [{ text: 'Scene tool completed.' }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 }
        })
    };
};

(async () => {
    window.smAIService.setAPIKey('test-key');
    const result = await window.smAIService.sendMessage('Run the scene tool.', {
        requestPermission: async () => true
    });

    assert.strictEqual(result.text, 'Scene tool completed.');
    assert.strictEqual(executions, 1);
    assert.strictEqual(result.toolResults[0].result.doubled, 14);
    assert.strictEqual(requests.length, 2);
    assert.strictEqual(requests[0].options.headers['x-goog-api-key'], 'test-key');
    assert.ok(requests[0].url.includes('gemini-3.5-flash-lite'));
    assert.strictEqual(
        requests[1].body.contents.at(-1).parts[0].functionResponse.response.result.doubled,
        14
    );
    assert.ok(window.smAIToolRegistry.getGeminiDeclarations().some((tool) => tool.name === 'test_scene_tool'));

    const secondResult = await window.smAIService.sendMessage('This is a second message.');
    assert.strictEqual(secondResult.text, 'Scene tool completed.');
    assert.strictEqual(window.smAIService.history.length, 4);
    assert.strictEqual(requests.length, 3);
    assert.strictEqual(requests[2].body.contents.at(-1).parts[0].text, 'This is a second message.');

    const repeatedRequests = [];
    global.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        repeatedRequests.push({ url, options, body });
        if (repeatedRequests.length <= 2) {
            return {
                ok: true,
                json: async () => ({
                    candidates: [{
                        content: {
                            role: 'model',
                            parts: [{ functionCall: { name: 'test_scene_tool', args: { value: 9 } } }]
                        }
                    }]
                })
            };
        }
        return {
            ok: true,
            json: async () => ({
                candidates: [{ content: { role: 'model', parts: [{ text: 'Build completed safely.' }] } }]
            })
        };
    };
    const repeatedService = new window.SMAIService();
    repeatedService.maxToolRounds = 2;
    const repeatedResult = await repeatedService.sendMessage('Run once and finish.');
    assert.strictEqual(repeatedResult.text, 'Build completed safely.');
    assert.strictEqual(repeatedResult.toolResults.length, 1);
    assert.strictEqual(executions, 2);
    assert.strictEqual(repeatedRequests.length, 3);
    assert.strictEqual(repeatedRequests[2].body.tools, undefined);

    console.log(JSON.stringify({ passed: true, requests: requests.length + repeatedRequests.length, executions, consecutiveMessages: 2 }));
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
