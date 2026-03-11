// ==UserScript==
// @name         Tui-Qiao (推敲) - Truth Seeker
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  A selection-based auditing tool to find "First Principles" within any text.
// @author       small-thinking
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function() {
    'use strict';

    // --- 初始化设置 ---
    const DEFAULT_SETTINGS = {
        apiKey: "",
        model: "gemini-2.0-flash", // 默认使用最新的 2.0 Flash
    };

    let settings = {
        apiKey: GM_getValue("apiKey", DEFAULT_SETTINGS.apiKey),
        model: GM_getValue("model", DEFAULT_SETTINGS.model)
    };

    // --- UI 状态 ---
    let floatingBtn = null;
    let resultPanel = null;
    let shadowRoot = null;
    let isConfiguring = false;

    const STYLES = `
        :host { --primary: #2563eb; --bg: #ffffff; --text: #1f2937; --border: #e5e7eb; }
        .panel {
            position: fixed; top: 20px; right: 20px; width: 450px; max-height: 85vh;
            background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); z-index: 2147483647;
            display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica;
            overflow: hidden; animation: slideIn 0.2s ease-out;
        }
        @keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .header { padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .header-title { font-weight: 700; font-size: 14px; color: var(--primary); display: flex; align-items: center; gap: 6px; }
        .content { padding: 16px; overflow-y: auto; font-size: 14px; line-height: 1.7; color: var(--text); background: #fff; }
        .loading-spinner { border: 2px solid #f3f3f3; border-top: 2px solid var(--primary); border-radius: 50%; width: 16px; height: 16px; animation: spin 1s linear infinite; display: inline-block; margin-right: 8px; vertical-align: middle; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .section { margin-bottom: 14px; }
        .audit-text { background: #f9fafb; padding: 12px; border-radius: 8px; border-left: 4px solid var(--primary); white-space: pre-wrap; font-size: 13px; }
        .icon-btn { cursor: pointer; color: #9ca3af; transition: color 0.2s; font-size: 16px; }
        .icon-btn:hover { color: var(--primary); }
        .config-view { display: flex; flex-direction: column; gap: 12px; }
        .field { display: flex; flex-direction: column; gap: 4px; }
        .field label { font-size: 12px; font-weight: 600; color: #6b7280; }
        .field input, .field select { padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; outline: none; }
        .save-btn { background: var(--primary); color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 600; }
    `;

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
                <div class="header-title"><span>🧠</span> ${title}</div>
                <div style="display:flex; gap:12px;">
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
            ${renderHeader("Settings / 设置")}
            <div class="content">
                <div class="config-view">
                    <div class="field">
                        <label>Gemini API Key</label>
                        <input type="password" id="api-key-input" value="${settings.apiKey}" placeholder="Paste your API Key here">
                    </div>
                    <div class="field">
                        <label>Model / 推理模型</label>
                        <select id="model-select">
                            <option value="gemini-2.0-flash" ${settings.model === 'gemini-2.0-flash' ? 'selected' : ''}>Gemini 2.0 Flash (Recommended)</option>
                            <option value="gemini-1.5-flash" ${settings.model === 'gemini-1.5-flash' ? 'selected' : ''}>Gemini 1.5 Flash</option>
                            <option value="gemini-1.5-pro" ${settings.model === 'gemini-1.5-pro' ? 'selected' : ''}>Gemini 1.5 Pro (Deep)</option>
                        </select>
                    </div>
                    <button class="save-btn" id="save-config">Save & Apply</button>
                </div>
            </div>
        `;
        shadowRoot.getElementById('save-config').onclick = () => {
            const newKey = shadowRoot.getElementById('api-key-input').value;
            const newModel = shadowRoot.getElementById('model-select').value;
            GM_setValue("apiKey", newKey);
            GM_setValue("model", newModel);
            settings.apiKey = newKey;
            settings.model = newModel;
            isConfiguring = false;
            showResult("Success", "Configuration saved. You can now select text to audit.");
        };
        bindBasicEvents();
    }

    function bindBasicEvents() {
        shadowRoot.getElementById('close-auditor').onclick = () => resultPanel.style.display = 'none';
        shadowRoot.querySelector('.settings-trigger').onclick = () => showConfig();
    }

    function showResult(title, content, isLoading = false) {
        ensurePanel();
        resultPanel.style.display = 'flex';
        if (isConfiguring && !isLoading) return;
        resultPanel.innerHTML = `
            ${renderHeader(title)}
            <div class="content">
                ${isLoading ? `<div style="text-align:center; padding: 20px;"><span class="loading-spinner"></span>Seeking Truth / 逻辑穿透中...</div>` : formatResponse(content)}
            </div>
        `;
        bindBasicEvents();
    }

    function formatResponse(text) {
        if (!text) return "No response. Check your API Key and Network.";
        // Simple Markdown-ish formatting
        return text.split('\n\n').map(block => {
            if (block.includes('###') || block.includes('**')) {
                return `<div class="section"><div class="audit-text">${block.replace(/###/g, '').trim()}</div></div>`;
            }
            return `<p>${block}</p>`;
        }).join('');
    }

    async function callGemini(selectedText) {
        if (!settings.apiKey) { showConfig(); return; }
        showResult("Auditing...", "", true);

        const systemPrompt = "你是一个精通逻辑分析与第一性原理的审计师。你的目标是‘求真’。针对用户提供的任何言论、主张或信息，请进行深度的逻辑穿透。必须包含：1. 隐藏假设 (Hidden Assumptions)；2. 逻辑断层 (Logical Leaps)；3. 利益相关 (Cui Bono)；4. 第一性原理重构 (First Principles)。语气冷静、专业、不带偏见，直击核心。";

        const payload = {
            contents: [{ parts: [{ text: selectedText }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };

        // 对于 2.0 模型和 1.5 系列，v1beta 通常支持最好的功能，但如果 404，尝试更通用的路径
        const apiVersion = settings.model.includes('2.0') ? 'v1beta' : 'v1';
        const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${settings.model}:generateContent?key=${settings.apiKey}`;

        GM_xmlhttpRequest({
            method: "POST",
            url: url,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            onload: (response) => {
                try {
                    const data = JSON.parse(response.responseText);
                    if (response.status === 200) {
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        showResult("Tui-Qiao Audit Report", text || "Empty response.");
                    } else {
                        showResult("Error", `API Error ${response.status}: ${data.error?.message || response.responseText}`);
                    }
                } catch (e) {
                    showResult("Parsing Error", response.responseText);
                }
            },
            onerror: (err) => showResult("Network Error", "Could not reach Google API.")
        });
    }

    document.addEventListener('mouseup', (e) => {
        const selection = window.getSelection().toString().trim();
        if (selection.length < 5) return;
        if (!floatingBtn) {
            floatingBtn = document.createElement('div');
            floatingBtn.innerHTML = '🧠';
            floatingBtn.style = `position: fixed; cursor: pointer; font-size: 18px; z-index: 2147483646; background: white; border: 1px solid #2563eb; border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);`;
            floatingBtn.onclick = (ev) => { ev.stopPropagation(); callGemini(selection); floatingBtn.style.display = 'none'; };
            document.body.appendChild(floatingBtn);
        }
        floatingBtn.style.left = `${e.clientX + 5}px`;
        floatingBtn.style.top = `${e.clientY - 40}px`;
        floatingBtn.style.display = 'flex';
    });

    document.addEventListener('mousedown', (e) => {
        if (floatingBtn && !floatingBtn.contains(e.target) && !resultPanel?.contains(e.target)) {
            setTimeout(() => { if (!window.getSelection().toString()) if(floatingBtn) floatingBtn.style.display = 'none'; }, 100);
        }
    });
})();
