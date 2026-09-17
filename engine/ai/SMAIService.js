(function () {
    'use strict';

    const SESSION_KEY = 'sm-ai-gemini-api-key-session';
    const PERSISTENT_KEY = 'sm-ai-gemini-api-key';
    const MODEL_KEY = 'sm-ai-gemini-model';
    const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
    const RETIRED_MODELS = new Set([
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash'
    ]);
    const normalizeModel = (value) => {
        const model = String(value || '').trim().replace(/^models\//, '');
        return RETIRED_MODELS.has(model) ? DEFAULT_MODEL : model;
    };

    class SMAIService {
        constructor(options = {}) {
            const storedModel = localStorage.getItem(MODEL_KEY);
            this.model = normalizeModel(options.model || storedModel || DEFAULT_MODEL) || DEFAULT_MODEL;
            // Migrate installations which saved the retired 2.5 model. This
            // happens before the first request, so users do not need to clear
            // localStorage or re-enter their API key.
            if (storedModel !== this.model) localStorage.setItem(MODEL_KEY, this.model);
            this.contextBuilder = options.contextBuilder || window.smAIContextBuilder;
            this.registry = options.registry || window.smAIToolRegistry;
            this.executor = options.executor || window.smAICommandExecutor;
            this.history = [];
            this.maxHistoryMessages = 12;
            this.maxToolRounds = 16;
            this.timeoutMs = 180000;
        }

        getAPIKey() {
            return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(PERSISTENT_KEY) || '';
        }

        setAPIKey(value, { remember = false } = {}) {
            const key = String(value || '').trim();
            if (!key) {
                sessionStorage.removeItem(SESSION_KEY);
                localStorage.removeItem(PERSISTENT_KEY);
                return false;
            }
            sessionStorage.setItem(SESSION_KEY, key);
            if (remember) localStorage.setItem(PERSISTENT_KEY, key);
            else localStorage.removeItem(PERSISTENT_KEY);
            return true;
        }

        setModel(value) {
            const model = normalizeModel(value);
            if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Invalid Gemini model name.');
            this.model = model;
            localStorage.setItem(MODEL_KEY, model);
            return model;
        }

        clearConversation() { this.history = []; }

        _historyContents() {
            return this.history.slice(-this.maxHistoryMessages).map((message) => ({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: message.text }]
            }));
        }

        async _request(contents, apiKey, signal, options = {}) {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
            const declarations = this.registry?.getGeminiDeclarations?.() || [];
            const systemInstruction = [
                this.contextBuilder.buildSystemInstruction(),
                String(options.systemSuffix || '').trim()
            ].filter(Boolean).join('\n');
            const body = {
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents,
                generationConfig: { temperature: 0.25, topP: 0.9, maxOutputTokens: 4096 }
            };
            if (options.includeTools !== false && declarations.length) {
                body.tools = [{ functionDeclarations: declarations }];
            }

            // Electron requests go through a fixed-origin main-process bridge.
            // This avoids file:// CORS problems and never exposes arbitrary
            // network access through preload. The web build uses fetch below.
            if (typeof window.electronAPI?.geminiGenerateContent === 'function') {
                const bridged = await window.electronAPI.geminiGenerateContent({
                    apiKey,
                    model: this.model,
                    body
                });
                if (!bridged?.ok) {
                    throw new Error(`Gemini API: ${bridged?.error || 'Request failed.'}`);
                }
                return bridged.data || {};
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify(body),
                signal
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = data?.error?.message || `${response.status} ${response.statusText}`;
                throw new Error(`Gemini API: ${message}`);
            }
            return data;
        }

        _candidateContent(data) {
            const candidate = data?.candidates?.[0];
            if (!candidate?.content?.parts) {
                const reason = data?.promptFeedback?.blockReason || candidate?.finishReason || 'No response';
                throw new Error(`Gemini returned no content (${reason}).`);
            }
            return candidate.content;
        }

        _callKey(call) {
            const normalize = (value) => {
                if (Array.isArray(value)) return value.map(normalize);
                if (value && typeof value === 'object') {
                    return Object.keys(value).sort().reduce((result, key) => {
                        result[key] = normalize(value[key]);
                        return result;
                    }, {});
                }
                return value;
            };
            return `${String(call?.name || '')}:${JSON.stringify(normalize(call?.args || {}))}`;
        }

        async _finishToolRun(contents, apiKey, signal, text, toolResults) {
            contents.push({
                role: 'user',
                parts: [{ text: 'The tool execution phase is complete. Do not call more functions. Briefly summarize what was successfully changed and mention any remaining work.' }]
            });
            const data = await this._request(contents, apiKey, signal, {
                includeTools: false,
                systemSuffix: 'Tool use is now disabled for this response. Return a concise completion summary only.'
            });
            const content = this._candidateContent(data);
            const answer = content.parts
                .filter((part) => typeof part?.text === 'string')
                .map((part) => part.text)
                .join('\n')
                .trim() || `Completed ${toolResults.length} scene action${toolResults.length === 1 ? '' : 's'}.`;
            this.history.push({ role: 'user', text }, { role: 'assistant', text: answer });
            return { text: answer, toolResults, usage: data.usageMetadata || null, toolLimitReached: true };
        }

        async sendMessage(prompt, options = {}) {
            const text = String(prompt || '').trim();
            if (!text) throw new Error('Write a message first.');
            const apiKey = this.getAPIKey();
            if (!apiKey) throw new Error('Add your Gemini API key in the AI panel first.');

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
            const contents = [...this._historyContents(), { role: 'user', parts: [{ text }] }];
            const toolResults = [];
            const executedCalls = new Map();
            let duplicateOnlyRounds = 0;
            try {
                for (let round = 0; round < this.maxToolRounds; round += 1) {
                    const data = await this._request(contents, apiKey, controller.signal);
                    const modelContent = this._candidateContent(data);
                    const functionCalls = modelContent.parts
                        .filter((part) => part?.functionCall)
                        .map((part) => part.functionCall);
                    const responseText = modelContent.parts
                        .filter((part) => typeof part?.text === 'string')
                        .map((part) => part.text)
                        .join('\n')
                        .trim();

                    contents.push(modelContent);
                    if (!functionCalls.length) {
                        const answer = responseText || 'Done.';
                        this.history.push({ role: 'user', text }, { role: 'assistant', text: answer });
                        return { text: answer, toolResults, usage: data.usageMetadata || null };
                    }

                    const responseParts = [];
                    let executedThisRound = 0;
                    for (const call of functionCalls) {
                        const callKey = this._callKey(call);
                        let result;
                        if (executedCalls.has(callKey)) {
                            const previous = executedCalls.get(callKey);
                            result = {
                                ok: previous?.ok !== false,
                                tool: call.name,
                                alreadyExecuted: true,
                                message: 'This identical action already ran in this request. Do not call it again.'
                            };
                        } else {
                            result = await this.executor.execute(call, {
                                requestPermission: options.requestPermission
                            });
                            if (result?.ok !== false) executedCalls.set(callKey, result);
                            toolResults.push({ name: call.name, args: call.args || {}, result });
                            executedThisRound += 1;
                        }
                        responseParts.push({
                            functionResponse: {
                                name: call.name,
                                response: { result }
                            }
                        });
                    }
                    contents.push({ role: 'user', parts: responseParts });
                    duplicateOnlyRounds = executedThisRound === 0 ? duplicateOnlyRounds + 1 : 0;
                    if (duplicateOnlyRounds >= 2) {
                        return await this._finishToolRun(contents, apiKey, controller.signal, text, toolResults);
                    }
                }
                return await this._finishToolRun(contents, apiKey, controller.signal, text, toolResults);
            } catch (error) {
                if (error?.name === 'AbortError') throw new Error('Gemini request timed out.');
                throw error;
            } finally {
                clearTimeout(timeout);
            }
        }
    }

    window.SMAIService = SMAIService;
    window.SM_AI_DEFAULT_MODEL = DEFAULT_MODEL;
    window.smAIService = window.smAIService || new SMAIService();
}());
