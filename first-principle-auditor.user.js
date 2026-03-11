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
            position: fixed; top: 20px; right: 20px; width: 420px; max-height: 85vh;
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
        .field label { font-size: 12px; font-weight: 600; color: #4b5563; }
        .field input, .field select { padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; }
        .save-btn { background: #111827; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 600; }
        
        #tui-qiao-float-btn {
            position: fixed; cursor: pointer; z-index: 2147483646;
            background: #111827; color: white; border-radius: 20px;
            padding: 6px 12px; display: none; align-items: center; gap: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2); font-family: -apple-system, sans-serif;
            font-size: 13px; font-weight: 600; user-select: none;
            transition: transform 0.1s, background 0.2s;
        }
        #tui-qiao-float-btn:hover { background: #1f2937; transform: scale(1.05); }
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
        const style = document.createElement('style'); style.textContent = STYLES;
        shadowRoot.appendChild(style);
        resultPanel = document.createElement('div');
        resultPanel.className = 'panel'; shadowRoot.appendChild(resultPanel);
    }

    function renderHeader(title) {
        return `<div class="header"><div class="header-title"><span>🔍</span> ${title}</div><div style="display:flex; gap:10px;"><div class="icon-btn settings-trigger">⚙️</div><div class="icon-btn" id="close-auditor">✕</div></div></div>`;
    }

    function showConfig() {
        ensurePanel();
        isConfiguring = true; resultPanel.style.display = 'flex';
        resultPanel.innerHTML = `
            ${renderHeader("Settings")}
            <div class="content"><div style="display:flex; flex-direction:column; gap:12px;">
                <div><label style="font-size:12px;font-weight:600;">Gemini API Key</label><input type="password" id="api-key-input" value="${settings.apiKey}" placeholder="Paste API Key" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #ddd;border-radius:6px;"></div>
                <div><label style="font-size:12px;font-weight:600;">Engine</label><select id="model-select" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;"><option value="gemini-3-flash-preview">Gemini 3 Flash</option><option value="gemini-1.5-flash-latest">Gemini 1.5 Flash</option></select></div>
                <div style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="search-toggle" ${settings.useSearch ? 'checked' : ''}><label for="search-toggle" style="font-size:12px;">Search Grounding</label></div>
                <button class="save-btn" id="save-config">Save & Apply</button>
            </div></div>
        `;
        shadowRoot.getElementById('save-config').onclick = () => {
            settings.apiKey = shadowRoot.getElementById('api-key-input').value;
            settings.model = shadowRoot.getElementById('model-select').value;
            settings.useSearch = shadowRoot.getElementById('search-toggle').checked;
            GM_setValue("apiKey", settings.apiKey); GM_setValue("model", settings.model); GM_setValue("useSearch", settings.useSearch);
            isConfiguring = false; showResult("Success", "Configuration saved.", false, "");
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
        resetPanel(); isConfiguring = false;
        showResult("Auditing...", "", true, selectedText);

        const systemPrompt = `You are a rigorous logic auditor for Truth Seeking. 
**REPLY LANGUAGE MUST MATCH INPUT TEXT LANGUAGE.**
Classify and handle the input:
CASE 1: Subjective/Personal Narrative (Farewell, Life reflection) -> Reply: "Personal narrative. Outside of audit scope."
CASE 2: News or Rumors -> PROACTIVELY search. 
   - CONSERVATIVE JUDGMENT: Use ✅ or ❌ ONLY if you have absolute confidence from highly credible sources (official press, Tier-1 media).
   - DEFAULT TO UNSURE: Use ⚠️ if sources are contradictory or ❓ if unverified. State the specific reasons/missing evidence for being unsure.
CASE 3: Opinions or Arguments -> Analyze logic using First Principles. 

Rules: Absolute Anonymity. Verdict First with Emoji. Cohesive synthesis (max 4 sentences). Max 5 sentences total. Provide up to 3 links.`;

        const payload = {
            contents: [{ 
                role: "user",
                parts: [{ text: selectedText + ` [ID: ${Math.random().toString(36).substring(7)}]` }] 
            }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };
        if (settings.useSearch) payload.tools = [{ google_search: {} }];

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;

        GM_xmlhttpRequest({
            method: "POST", url: url, headers: { "Content-Type": "application/json" }, data: JSON.stringify(payload), timeout: 35000,
            onload: (response) => {
                try {
                    const data = JSON.parse(response.responseText);
                    if (response.status === 200) {
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        showResult("Audit Result", text || "No content.", false, selectedText);
                    } else { showResult("Error", `Code ${response.status}`, false, selectedText); }
                } catch (e) { showResult("Parse Error", "Failed.", false, selectedText); }
            },
            onerror: () => showResult("Network Error", "Failed.", false, selectedText),
            ontimeout: () => showResult("Timeout", "Failed.", false, selectedText)
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
            floatingBtn.id = 'tui-qiao-float-btn';
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
        const btnRoot = document.getElementById('tui-qiao-btn-root');
        if (btnRoot && e.composedPath().includes(btnRoot.shadowRoot.getElementById('tui-qiao-float-btn'))) return;
        setTimeout(() => { if (!window.getSelection().toString()) if(floatingBtn) floatingBtn.style.display = 'none'; }, 100);
    });
})();
