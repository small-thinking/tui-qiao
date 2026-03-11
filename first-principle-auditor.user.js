// ==UserScript==
// @name         Tui-Qiao (推敲) - Truth Seeker (Gemini 3 Edition)
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  A selection-based auditing tool to find "First Principles" powered by Gemini 3.
// @author       small-thinking
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    const MODELS = {
        primary: "gemini-3-flash-preview",
        stable: "gemini-1.5-flash-latest"
    };

    let settings = {
        apiKey: GM_getValue("apiKey", ""),
        model: MODELS.primary,
        useSearch: GM_getValue("useSearch", true)
    };

    // --- UI State ---
    let floatingBtn = null;
    let resultPanel = null;
    let shadowRoot = null;
    let isConfiguring = false;

    const STYLES = `
        :host { --primary: #2563eb; --bg: #ffffff; --text: #1f2937; --border: #e5e7eb; }
        .panel {
            position: fixed; top: 20px; right: 20px; width: 400px; max-height: 85vh;
            background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); z-index: 2147483647;
            display: none; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica;
            overflow: hidden; animation: slideIn 0.2s ease-out;
        }
        @keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .header { padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .header-title { font-weight: 700; font-size: 14px; color: #111827; display: flex; align-items: center; gap: 6px; }
        .content { padding: 16px; overflow-y: auto; font-size: 14px; line-height: 1.6; color: #374151; background: #fff; }
        .input-preview { font-size: 11px; color: #6b7280; background: #f9fafb; padding: 8px; border-radius: 6px; margin-bottom: 12px; border: 1px dashed #e5e7eb; white-space: pre-wrap; max-height: 80px; overflow-y: auto; }
        .loading-spinner { border: 2px solid #f3f3f3; border-top: 2px solid var(--primary); border-radius: 50%; width: 16px; height: 16px; animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .icon-btn { cursor: pointer; color: #9ca3af; transition: color 0.2s; font-size: 16px; }
        .icon-btn:hover { color: var(--primary); }
        a { color: var(--primary); text-decoration: none; word-break: break-all; font-size: 12px; display: block; margin-top: 4px; }
        a:hover { text-decoration: underline; }
        .config-view { display: flex; flex-direction: column; gap: 12px; }
        .field label { font-size: 12px; font-weight: 600; color: #4b5563; }
        .field input, .field select { padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; }
        .save-btn { background: #111827; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 600; }
        
        #tui-qiao-float-btn {
            position: fixed; cursor: pointer; z-index: 2147483646;
            background: #111827; color: white; border-radius: 20px;
            padding: 6px 12px; display: none; align-items: center; gap: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2); font-family: -apple-system, sans-serif;
            font-size: 13px; font-weight: 600; user-select: none;
        }
    `;

    function resetPanel() {
        const existing = document.getElementById('fp-auditor-root');
        if (existing) existing.remove();
        resultPanel = null;
        shadowRoot = null;
    }

    function ensurePanel() {
        if (resultPanel) return;
        const container = document.createElement('div');
        container.id = 'fp-auditor-root';
        document.body.appendChild(container);
        shadowRoot = container.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = STYLES;
        shadowRoot.appendChild(style);
        resultPanel = document.createElement('div');
        resultPanel.className = 'panel';
        shadowRoot.appendChild(resultPanel);
    }

    function renderHeader(title) {
        return `
            <div class="header">
                <div class="header-title"><span>🔍</span> ${title}</div>
                <div style="display:flex; gap:10px;">
                    <div class="icon-btn settings-trigger">⚙️</div>
                    <div class="icon-btn" id="close-auditor">✕</div>
                </div>
            </div>
        `;
    }

    function showConfig() {
        ensurePanel();
        isConfiguring = true;
        resultPanel.style.display = 'flex';
        resultPanel.innerHTML = `
            ${renderHeader("Settings")}
            <div class="content">
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div class="field">
                        <label>Gemini API Key</label>
                        <input type="password" id="api-key-input" value="${settings.apiKey}" placeholder="Paste API Key">
                    </div>
                    <div class="field">
                        <label>Engine</label>
                        <select id="model-select">
                            <option value="gemini-3-flash-preview" ${settings.model === 'gemini-3-flash-preview' ? 'selected' : ''}>Gemini 3 Flash</option>
                            <option value="gemini-1.5-flash-latest" ${settings.model === 'gemini-1.5-flash-latest' ? 'selected' : ''}>Gemini 1.5 Flash</option>
                        </select>
                    </div>
                    <div class="field" style="display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="search-toggle" ${settings.useSearch ? 'checked' : ''} style="width:auto;">
                        <label for="search-toggle">Search Grounding</label>
                    </div>
                    <button class="save-btn" id="save-config">Save & Apply</button>
                </div>
            </div>
        `;
        shadowRoot.getElementById('save-config').onclick = () => {
            settings.apiKey = shadowRoot.getElementById('api-key-input').value;
            settings.model = shadowRoot.getElementById('model-select').value;
            settings.useSearch = shadowRoot.getElementById('search-toggle').checked;
            GM_setValue("apiKey", settings.apiKey);
            GM_setValue("model", settings.model);
            GM_setValue("useSearch", settings.useSearch);
            isConfiguring = false;
            showResult("Success", "Settings saved.", false, "");
        };
        bindBasicEvents();
    }

    function bindBasicEvents() {
        shadowRoot.getElementById('close-auditor').onclick = () => resultPanel.style.display = 'none';
        shadowRoot.querySelector('.settings-trigger').onclick = () => showConfig();
    }

    function showResult(title, content, isLoading, selectedText) {
        ensurePanel();
        resultPanel.style.display = 'flex';
        if (isLoading || !isConfiguring) {
            resultPanel.innerHTML = `
                ${renderHeader(title)}
                <div class="content">
                    ${selectedText ? `<div class="input-preview"><b>Input:</b>\n${selectedText}</div>` : ''}
                    ${isLoading ? `<div style="text-align:center; padding: 10px;"><span class="loading-spinner"></span> Sifting Truth...</div>` : `<div style="white-space:pre-wrap;">${formatLinks(content)}</div>`}
                </div>
            `;
            bindBasicEvents();
        }
    }

    function formatLinks(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank">${url}</a>`);
    }

    async function callGemini(selectedText) {
        if (!settings.apiKey) { showConfig(); return; }
        resetPanel(); 
        isConfiguring = false;
        showResult("Auditing...", "", true, selectedText);

        const systemPrompt = `You are a calm, objective logic auditor. Your goal is HOLISTIC TRUTH SEEKING.
**REPLY LANGUAGE MUST MATCH THE INPUT TEXT LANGUAGE.**
Rules:
1. OVERALL JUDGMENT FIRST: Start with ✅, ❌, ⚠️, or ❓.
2. SYNTHESIS: Provide a cohesive narrative (up to 4 sentences).
3. EVIDENCE: ${settings.useSearch ? 'Proactively verify claims. Provide links.' : 'Use internal knowledge.'}
4. CONCISENESS: Max 5 sentences total.`;

        const payload = {
            contents: [{ 
                role: "user",
                parts: [{ text: selectedText + ` [ID: ${Math.random().toString(36).substring(7)}]` }] 
            }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };
        
        if (settings.useSearch) payload.tools = [{ google_search: {} }];

        GM_xmlhttpRequest({
            method: "POST",
            url: `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
            data: JSON.stringify(payload),
            timeout: 35000, // 增加到 35 秒以应对搜索延迟
            onload: (response) => {
                try {
                    const data = JSON.parse(response.responseText);
                    if (response.status === 200) {
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (!text) {
                            showResult("Blocked", "API returned an empty response. This might be due to safety filters.", false, selectedText);
                        } else {
                            showResult("Audit Result", text, false, selectedText);
                        }
                    } else if (response.status === 429) {
                        showResult("Limit Reached", "Account quota or rate limit exceeded.", false, selectedText);
                    } else {
                        showResult("API Error", `Code ${response.status}: ${data.error?.message || 'Unknown error'}`, false, selectedText);
                    }
                } catch (e) { 
                    showResult("Parse Error", `Failed to read API response. Raw: ${response.responseText.substring(0, 50)}...`, false, selectedText); 
                }
            },
            onerror: (err) => showResult("Network Error", `Connection failed: ${err.statusText || 'Check your proxy'}`, false, selectedText),
            ontimeout: () => showResult("Timeout", "The audit took too long (35s+). Try disabling Search Grounding.", false, selectedText)
        });
    }

    document.addEventListener('mouseup', (e) => {
        const selection = window.getSelection().toString().trim();
        if (selection.length < 5) return;

        if (!floatingBtn) {
            const container = document.createElement('div');
            container.id = 'tui-qiao-btn-root';
            document.body.appendChild(container);
            const btnShadow = container.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = STYLES;
            btnShadow.appendChild(style);
            floatingBtn = document.createElement('div');
            floatingBtn.id = 'tui-qiao-float-btn';
            floatingBtn.innerHTML = '🔍 Tui-Qiao';
            btnShadow.appendChild(floatingBtn);
            floatingBtn.onclick = (ev) => {
                ev.stopPropagation();
                callGemini(selection);
                floatingBtn.style.display = 'none';
            };
        }
        floatingBtn.style.left = `${e.clientX + 5}px`;
        floatingBtn.style.top = `${e.clientY - 40}px`;
        floatingBtn.style.display = 'flex';
    });

    document.addEventListener('mousedown', (e) => {
        const btnRoot = document.getElementById('tui-qiao-btn-root');
        if (btnRoot && e.composedPath().includes(btnRoot.shadowRoot.getElementById('tui-qiao-float-btn'))) return;
        setTimeout(() => { if (!window.getSelection().toString()) if(floatingBtn) floatingBtn.style.display = 'none'; }, 100);
    });
})();
