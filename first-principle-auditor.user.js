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
            position: fixed; top: 20px; right: 20px; width: 420px; max-height: 85vh;
            background: var(--bg); border: 1px solid var(--border); border-radius: 16px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); z-index: 2147483647;
            display: none; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica;
            overflow: hidden; animation: slideIn 0.2s ease-out;
        }
        @keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .header { padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .header-title { font-weight: 700; font-size: 14px; color: #111827; display: flex; align-items: center; gap: 6px; }
        .content { padding: 16px; overflow-y: auto; font-size: 14px; line-height: 1.6; color: #374151; background: #fff; }
        
        .thought-log { font-size: 11px; color: #9ca3af; background: #fafafa; padding: 10px; border-radius: 8px; margin-bottom: 12px; border-left: 2px solid #e5e7eb; font-style: italic; }
        .input-preview { font-size: 11px; color: #6b7280; background: #f9fafb; padding: 8px; border-radius: 6px; margin-bottom: 12px; border: 1px dashed #e5e7eb; white-space: pre-wrap; max-height: 60px; overflow-y: auto; }
        
        .loading-spinner { border: 2px solid #f3f3f3; border-top: 2px solid var(--primary); border-radius: 50%; width: 16px; height: 16px; animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .icon-btn { cursor: pointer; color: #9ca3af; transition: color 0.2s; font-size: 16px; }
        .icon-btn:hover { color: var(--primary); }
        a { color: var(--primary); text-decoration: none; word-break: break-all; font-size: 12px; display: block; margin-top: 4px; }
        .save-btn { background: #111827; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%; }
    `;

    function resetPanel() {
        const existing = document.getElementById('fp-auditor-root');
        if (existing) existing.remove();
        resultPanel = null; shadowRoot = null;
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
        return `<div class="header"><div class="header-title"><span>🔍</span> ${title}</div><div style="display:flex; gap:10px;"><div class="icon-btn settings-trigger">⚙️</div><div class="icon-btn" id="close-auditor">✕</div></div></div>`;
    }

    function showConfig() {
        ensurePanel();
        isConfiguring = true;
        resultPanel.style.display = 'flex';
        resultPanel.innerHTML = `${renderHeader("Settings")}<div class="content"><div style="display:flex; flex-direction:column; gap:12px;"><div><label style="font-size:12px;font-weight:600;">Gemini API Key</label><input type="password" id="api-key-input" value="${settings.apiKey}" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #ddd;border-radius:6px;"></div><div><label style="font-size:12px;font-weight:600;">Engine</label><select id="model-select" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"><option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option><option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</option></select></div><div style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="search-toggle" ${settings.useSearch ? 'checked' : ''}><label for="search-toggle" style="font-size:12px;">Search Grounding</label></div><button class="save-btn" id="save-config">Save & Apply</button></div></div>`;
        shadowRoot.getElementById('save-config').onclick = () => {
            settings.apiKey = shadowRoot.getElementById('api-key-input').value;
            settings.model = shadowRoot.getElementById('model-select').value;
            settings.useSearch = shadowRoot.getElementById('search-toggle').checked;
            GM_setValue("apiKey", settings.apiKey); GM_setValue("model", settings.model); GM_setValue("useSearch", settings.useSearch);
            isConfiguring = false; showResult("Success", "Configuration saved.", false, "");
        };
        shadowRoot.getElementById('close-auditor').onclick = () => resultPanel.style.display = 'none';
        shadowRoot.querySelector('.settings-trigger').onclick = () => showConfig();
    }

    function showResult(title, content, isLoading, selectedText, thought = "") {
        ensurePanel();
        resultPanel.style.display = 'flex';
        if (isLoading || !isConfiguring) {
            resultPanel.innerHTML = `
                ${renderHeader(title)}
                <div class="content">
                    ${selectedText ? `<div class="input-preview"><b>Input:</b>\n${selectedText}</div>` : ''}
                    ${thought ? `<div class="thought-log"><b>Thinking:</b>\n${thought}</div>` : ''}
                    ${isLoading && !content ? `<div style="text-align:center; padding: 10px;"><span class="loading-spinner"></span> Sifting...</div>` : `<div style="white-space:pre-wrap;">${formatLinks(content)}</div>`}
                </div>
            `;
            shadowRoot.getElementById('close-auditor').onclick = () => resultPanel.style.display = 'none';
            shadowRoot.querySelector('.settings-trigger').onclick = () => showConfig();
        }
    }

    function formatLinks(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank">${url}</a>`);
    }

    async function callGemini(selectedText) {
        if (!settings.apiKey) { showConfig(); return; }
        resetPanel(); isConfiguring = false;
        showResult("Auditing...", "", true, selectedText);

        const systemPrompt = `You are a rigorous logic auditor. Goal: HOLISTIC TRUTH SEEKING. 
**REPLY LANGUAGE MUST MATCH INPUT TEXT LANGUAGE.**
CASE 1: Subjective/Personal -> Reply "Personal narrative. Outside of audit scope."
CASE 2: News/Rumors -> PROACTIVELY search. Holistic verdict (✅/❌/⚠️).
CASE 3: Opinions -> Use First Principle reasoning.
Rules: Absolute Anonymity. Verdict First. Cohesive Synthesis (max 4 sentences). Max 5 sentences total. Provide up to 3 links.`;

        const payload = {
            contents: [{ role: "user", parts: [{ text: selectedText + ` [ID: ${Math.random().toString(36).substring(7)}]` }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };
        if (settings.useSearch) payload.tools = [{ google_search: {} }];

        let fullContent = "";
        let fullThought = "";

        // 使用 streamGenerateContent 实现流式传输
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:streamGenerateContent?key=${settings.apiKey}&alt=sse`;

        GM_xmlhttpRequest({
            method: "POST",
            url: url,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            timeout: 90000, // 增加到 90 秒
            onprogress: (response) => {
                // 处理流式返回的 SSE 数据
                const lines = response.responseText.split("\n");
                lines.forEach(line => {
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            const part = data.candidates?.[0]?.content?.parts?.[0];
                            if (part) {
                                if (part.text) {
                                    fullContent += part.text;
                                    showResult("Auditing...", fullContent, true, selectedText, fullThought);
                                }
                                // 如果模型返回了思考过程 (thinking)，展示在思维区
                                if (part.thought) {
                                    fullThought += part.thought;
                                    showResult("Auditing...", fullContent, true, selectedText, fullThought);
                                }
                            }
                        } catch (e) {}
                    }
                });
            },
            onload: (response) => {
                if (response.status === 200) {
                    showResult("Audit Result", fullContent || "No response content.", false, selectedText, fullThought);
                } else {
                    showResult("Error", `Code ${response.status}: ${response.statusText}`, false, selectedText);
                }
            },
            onerror: () => showResult("Network Error", "Failed.", false, selectedText),
            ontimeout: () => showResult("Timeout", "Took too long (90s).", false, selectedText)
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
            const style = document.createElement('style'); style.textContent = STYLES;
            btnShadow.appendChild(style);
            floatingBtn = document.createElement('div');
            floatingBtn.id = 'tui-qiao-float-btn'; floatingBtn.innerHTML = '🔍 Tui-Qiao';
            btnShadow.appendChild(floatingBtn);
            floatingBtn.onclick = (ev) => { ev.stopPropagation(); callGemini(selection); floatingBtn.style.display = 'none'; };
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
