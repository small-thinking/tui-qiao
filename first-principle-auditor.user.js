// ==UserScript==
// @name         Tui-Qiao (推敲) - Truth Seeker (Gemini 3.1 Pro Edition)
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  A selection-based auditing tool to find "First Principles" powered by Gemini 3.1 Pro.
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
        primary: "gemini-3.1-pro-preview",
        stable: "gemini-3.1-flash-lite-preview"
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
            position: fixed; top: 20px; right: 20px; width: 420px; max-height: 85vh;
            background: var(--bg); border: 1px solid var(--border); border-radius: 16px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); z-index: 2147483647;
            display: none; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica;
            overflow: hidden; animation: slideIn 0.2s ease-out;
        }
        @keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .header { padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .header-title { font-weight: 700; font-size: 14px; color: #111827; }
        .content { padding: 16px; overflow-y: auto; font-size: 14px; line-height: 1.6; color: #374151; background: #fff; }
        .thought-box { font-size: 11px; color: #9ca3af; background: #fafafa; padding: 10px; border-radius: 8px; margin-bottom: 12px; border-left: 2px solid #e5e7eb; font-style: italic; display: none; }
        .text-box { white-space: pre-wrap; }
        .input-preview { font-size: 11px; color: #6b7280; background: #f9fafb; padding: 8px; border-radius: 6px; margin-bottom: 12px; border: 1px dashed #e5e7eb; white-space: pre-wrap; max-height: 60px; overflow-y: auto; }
        .loading-indicator { text-align: center; padding: 10px; color: #9ca3af; font-size: 12px; }
        .loading-spinner { border: 2px solid #f3f3f3; border-top: 2px solid var(--primary); border-radius: 50%; width: 14px; height: 14px; animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; margin-right: 6px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .icon-btn { cursor: pointer; color: #9ca3af; transition: color 0.2s; font-size: 16px; }
        .icon-btn:hover { color: var(--primary); }
        a { color: var(--primary); text-decoration: none; word-break: break-all; font-size: 12px; display: block; margin-top: 4px; }
        .save-btn { background: #111827; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%; }
    `;

    function ensurePanel() {
        if (resultPanel) return;
        const container = document.createElement('div');
        container.id = 'fp-auditor-root';
        document.body.appendChild(container);
        shadowRoot = container.attachShadow({ mode: 'open' });
        const style = document.createElement('style'); style.textContent = STYLES;
        shadowRoot.appendChild(style);
        resultPanel = document.createElement('div');
        resultPanel.className = 'panel'; shadowRoot.appendChild(resultPanel);
    }

    function initResultUI(title, selectedText) {
        ensurePanel();
        resultPanel.style.display = 'flex';
        resultPanel.innerHTML = `
            <div class="header"><div class="header-title">🔍 ${title}</div><div style="display:flex; gap:10px;"><div class="icon-btn settings-trigger">⚙️</div><div class="icon-btn" id="close-auditor">✕</div></div></div>
            <div class="content">
                <div class="input-preview"><b>Input:</b>\n${selectedText}</div>
                <div class="thought-box" id="thought-container"></div>
                <div class="text-box" id="text-container"><div class="loading-indicator"><span class="loading-spinner"></span>Sifting truth...</div></div>
            </div>
        `;
        shadowRoot.getElementById('close-auditor').onclick = () => resultPanel.style.display = 'none';
        shadowRoot.querySelector('.settings-trigger').onclick = () => showConfig();
    }

    function showConfig() {
        ensurePanel();
        isConfiguring = true; resultPanel.style.display = 'flex';
        resultPanel.innerHTML = `
            <div class="header"><div class="header-title">⚙️ Settings</div><div class="icon-btn" id="close-auditor">✕</div></div>
            <div class="content"><div style="display:flex; flex-direction:column; gap:12px;">
                <div><label style="font-size:12px;font-weight:600;">Gemini API Key</label><input type="password" id="api-key-input" value="${settings.apiKey}" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>
                <div><label style="font-size:12px;font-weight:600;">Engine</label><select id="model-select" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"><option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option><option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</option></select></div>
                <div style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="search-toggle" ${settings.useSearch ? 'checked' : ''}><label for="search-toggle" style="font-size:12px;">Search Grounding</label></div>
                <button class="save-btn" id="save-config">Save & Apply</button>
            </div></div>
        `;
        shadowRoot.getElementById('save-config').onclick = () => {
            settings.apiKey = shadowRoot.getElementById('api-key-input').value;
            settings.model = shadowRoot.getElementById('model-select').value;
            settings.useSearch = shadowRoot.getElementById('search-toggle').checked;
            GM_setValue("apiKey", settings.apiKey); GM_setValue("model", settings.model); GM_setValue("useSearch", settings.useSearch);
            isConfiguring = false; initResultUI("Success", "Configuration saved.");
        };
        shadowRoot.getElementById('close-auditor').onclick = () => resultPanel.style.display = 'none';
    }

    function formatLinks(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank">${url}</a>`);
    }

    async function callGemini(selectedText) {
        if (!settings.apiKey) { showConfig(); return; }
        isConfiguring = false; initResultUI("Auditing...", selectedText);

        const thoughtEl = shadowRoot.getElementById('thought-container');
        const textEl = shadowRoot.getElementById('text-container');

        const systemPrompt = `You are a calm, objective logic auditor. Goal: HOLISTIC TRUTH SEEKING. 
**REPLY LANGUAGE MUST MATCH INPUT TEXT LANGUAGE.**
CASE 1: Subjective/Personal -> Reply "Personal narrative. Outside of audit scope."
CASE 2: News/Rumors -> PROACTIVELY search. Holistic verdict (✅/❌/⚠️).
CASE 3: Opinions/Arguments -> Analyze the core logic and validity.
Rules: Absolute Anonymity. Verdict First. Cohesive Synthesis. Max 5 sentences total. Provide up to 3 links.`;

        // 显式降低安全限制，防止对技术讨论进行误拦截
        const safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
        ];

        const payload = {
            contents: [{ role: "user", parts: [{ text: selectedText + ` [ID: ${Math.random().toString(36).substring(7)}]` }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            safetySettings: safetySettings
        };
        if (settings.useSearch) payload.tools = [{ google_search: {} }];

        let fullContent = ""; let fullThought = "";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:streamGenerateContent?key=${settings.apiKey}&alt=sse`;

        GM_xmlhttpRequest({
            method: "POST", url: url, headers: { "Content-Type": "application/json" }, data: JSON.stringify(payload), timeout: 90000,
            onprogress: (response) => {
                const lines = response.responseText.split("\n");
                lines.forEach(line => {
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            const part = data.candidates?.[0]?.content?.parts?.[0];
                            if (part) {
                                if (part.thought) {
                                    fullThought += part.thought;
                                    thoughtEl.style.display = 'block';
                                    thoughtEl.innerHTML = `<b>Thinking:</b>\n${fullThought}`;
                                }
                                if (part.text) {
                                    fullContent += part.text;
                                    textEl.innerHTML = formatLinks(fullContent);
                                }
                            }
                        } catch (e) {}
                    }
                });
            },
            onload: (response) => {
                if (response.status !== 200) {
                    textEl.innerHTML = `<span style="color:red;">Error ${response.status}: ${response.statusText || 'API Blocked/Key Invalid'}</span>`;
                } else if (!fullContent && !fullThought) {
                    textEl.innerHTML = `<i style="color:#e11d48;">Response Blocked by Safety Filters.</i><br><small style="color:#9ca3af;">Try switching to Gemini 3.1 Flash Lite or disabling search.</small>`;
                }
            }
        });
    }

    document.addEventListener('mouseup', (e) => {
        const selection = window.getSelection().toString().trim();
        if (selection.length < 5) {
            if (floatingBtn) floatingBtn.style.display = 'none';
            return;
        }
        if (!floatingBtn) {
            floatingBtn = document.createElement('div');
            floatingBtn.innerHTML = '🔍 Tui-Qiao';
            floatingBtn.style.cssText = `position: fixed; cursor: pointer; z-index: 2147483646; background: #111827; color: white; border-radius: 20px; padding: 6px 12px; display: none; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-family: -apple-system, sans-serif; font-size: 13px; font-weight: 600; user-select: none; transition: transform 0.1s;`;
            document.body.appendChild(floatingBtn);
            floatingBtn.onclick = (ev) => {
                ev.stopPropagation();
                const s = window.getSelection().toString().trim();
                if (s) callGemini(s);
                floatingBtn.style.display = 'none';
            };
        }
        floatingBtn.style.left = `${e.clientX + 5}px`;
        floatingBtn.style.top = `${e.clientY - 40}px`;
        floatingBtn.style.display = 'flex';
    });

    document.addEventListener('mousedown', (e) => {
        if (floatingBtn && e.target === floatingBtn) return;
        setTimeout(() => { if (!window.getSelection().toString()) if(floatingBtn) floatingBtn.style.display = 'none'; }, 100);
    });
})();
