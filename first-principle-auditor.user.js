// ==UserScript==
// @name         Tui-Qiao (推敲) - Truth Seeker
// @namespace    http://tampermonkey.net/
// @version      0.4
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
        model: "gemini-1.5-flash",
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

    // --- 样式定义 ---
    const STYLES = `
        :host { --primary: #2563eb; --bg: #ffffff; --text: #1f2937; --border: #e5e7eb; }
        .panel {
            position: fixed; top: 20px; right: 20px; width: 420px; max-height: 85vh;
            background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); z-index: 2147483647;
            display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica;
            overflow: hidden; animation: slideIn 0.2s ease-out;
        }
        @keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

        .header { padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .header-title { font-weight: 700; font-size: 14px; color: var(--primary); display: flex; align-items: center; gap: 6px; }
        .header-actions { display: flex; gap: 10px; align-items: center; }
        .icon-btn { cursor: pointer; color: #9ca3af; transition: color 0.2s; display: flex; align-items: center; }
        .icon-btn:hover { color: var(--primary); }

        .content { padding: 16px; overflow-y: auto; font-size: 14px; line-height: 1.7; color: var(--text); }
        .loading-spinner { border: 2px solid #f3f3f3; border-top: 2px solid var(--primary); border-radius: 50%; width: 16px; height: 16px; animation: spin 1s linear infinite; display: inline-block; margin-right: 8px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        /* 配置界面样式 */
        .config-view { display: flex; flex-direction: column; gap: 12px; }
        .field { display: flex; flex-direction: column; gap: 4px; }
        .field label { font-size: 12px; font-weight: 600; color: #6b7280; }
        .field input, .field select { padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; outline: none; }
        .save-btn { background: var(--primary); color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 600; margin-top: 8px; }

        /* 审计结果样式 */
        .section { margin-bottom: 16px; }
        .section-title { font-weight: 800; font-size: 13px; text-transform: uppercase; color: #4b5563; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; }
        .section-title::before { content: ""; display: inline-block; width: 4px; height: 14px; background: var(--primary); border-radius: 2px; }
        .audit-text { background: #f9fafb; padding: 10px; border-radius: 8px; border-left: 1px solid var(--border); }
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
                <div class="header-actions">
                    <div class="icon-btn settings-trigger" title="Settings">⚙️</div>
                    <div class="icon-btn close-btn" id="close-auditor" title="Close">✕</div>
                </div>
            </div>
        `;
    }

    function showConfig() {
        ensurePanel();
        isConfiguring = true;
        resultPanel.innerHTML = `
            ${renderHeader("Settings / 设置")}
            <div class="content">
                <div class="config-view">
                    <div class="field">
                        <label>Gemini API Key</label>
                        <input type="password" id="api-key-input" value="${settings.apiKey}" placeholder="Enter your API Key">
                    </div>
                    <div class="field">
                        <label>Model / 推理模型</label>
                        <select id="model-select">
                            <option value="gemini-1.5-flash" ${settings.model === 'gemini-1.5-flash' ? 'selected' : ''}>Gemini 1.5 Flash (Fast/Cheap)</option>
                            <option value="gemini-1.5-pro" ${settings.model === 'gemini-1.5-pro' ? 'selected' : ''}>Gemini 1.5 Pro (Deep Reasoning)</option>
                            <option value="gemini-2.0-flash-exp" ${settings.model === 'gemini-2.0-flash-exp' ? 'selected' : ''}>Gemini 2.0 Flash Exp</option>
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
            showResult("Success", "Settings updated. Try selecting text again.");
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
        if (!text) return "No result. Please check API Key.";
        return text.split('\n\n').map(block => {
            if (block.includes('**')) {
                return `<div class="section"><div class="audit-text">${block.replace(/\n/g, '<br>')}</div></div>`;
            }
            return `<p>${block.replace(/\n/g, '<br>')}</p>`;
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

        try {
            GM_xmlhttpRequest({
                method: "POST",
                url: `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`,
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify(payload),
                onload: (response) => {
                    if (response.status === 200) {
                        const data = JSON.parse(response.responseText);
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        showResult("Tui-Qiao Audit Report", text);
                    } else {
                        showResult("Error", `API Error ${response.status}: ${response.responseText}`);
                    }
                },
                onerror: (err) => showResult("Network Error", err.message)
            });
        } catch (err) { showResult("System Error", err.message); }
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
            setTimeout(() => { if (!window.getSelection().toString()) floatingBtn.style.display = 'none'; }, 100);
        }
    });
})();
