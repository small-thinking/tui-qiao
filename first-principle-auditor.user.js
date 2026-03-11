// ==UserScript==
// @name         Tui-Qiao (推敲) - Truth Seeker (Gemini 3 Edition)
// @namespace    http://tampermonkey.net/
// @version      1.3
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

    // --- 初始化设置与强制迁移 ---
    const DEFAULT_MODEL = "gemini-3-flash-preview";
    let currentModel = GM_getValue("model");
    if (!currentModel || currentModel.includes("1.5-flash")) {
        currentModel = DEFAULT_MODEL;
        GM_setValue("model", DEFAULT_MODEL);
    }

    let settings = {
        apiKey: GM_getValue("apiKey", ""),
        model: currentModel,
        language: GM_getValue("language", "auto") // 默认自动判断
    };

    // --- UI 状态 ---
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
            display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica;
            overflow: hidden; animation: slideIn 0.2s ease-out;
        }
        @keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .header { padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .header-title { font-weight: 700; font-size: 14px; color: #111827; display: flex; align-items: center; gap: 6px; }
        .content { padding: 16px; overflow-y: auto; font-size: 14px; line-height: 1.6; color: #374151; background: #fff; }
        .loading-spinner { border: 2px solid #f3f3f3; border-top: 2px solid var(--primary); border-radius: 50%; width: 16px; height: 16px; animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .icon-btn { cursor: pointer; color: #9ca3af; transition: color 0.2s; font-size: 16px; }
        .icon-btn:hover { color: var(--primary); }
        .config-view { display: flex; flex-direction: column; gap: 12px; }
        .field label { font-size: 12px; font-weight: 600; color: #4b5563; }
        .field input, .field select { padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; }
        .save-btn { background: #111827; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 600; }
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
            ${renderHeader("设置 / Settings")}
            <div class="content">
                <div class="config-view">
                    <div class="field">
                        <label>Gemini API Key</label>
                        <input type="password" id="api-key-input" value="${settings.apiKey}" placeholder="Paste API Key">
                    </div>
                    <div class="field">
                        <label>Engine</label>
                        <select id="model-select">
                            <option value="gemini-3-flash-preview" ${settings.model === 'gemini-3-flash-preview' ? 'selected' : ''}>Gemini 3 Flash</option>
                            <option value="gemini-2.0-flash" ${settings.model === 'gemini-2.0-flash' ? 'selected' : ''}>Gemini 2.0 Flash</option>
                        </select>
                    </div>
                    <div class="field">
                        <label>Language / 回复语言</label>
                        <select id="lang-select">
                            <option value="auto" ${settings.language === 'auto' ? 'selected' : ''}>Auto (Follow Text)</option>
                            <option value="zh" ${settings.language === 'zh' ? 'selected' : ''}>Chinese (中文)</option>
                            <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
                        </select>
                    </div>
                    <button class="save-btn" id="save-config">保存应用</button>
                </div>
            </div>
        `;
        shadowRoot.getElementById('save-config').onclick = () => {
            const newKey = shadowRoot.getElementById('api-key-input').value;
            const newModel = shadowRoot.getElementById('model-select').value;
            const newLang = shadowRoot.getElementById('lang-select').value;
            GM_setValue("apiKey", newKey);
            GM_setValue("model", newModel);
            GM_setValue("language", newLang);
            settings.apiKey = newKey;
            settings.model = newModel;
            settings.language = newLang;
            isConfiguring = false;
            showResult("Success", "设置已保存。");
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
                ${isLoading ? `<div style="text-align:center; padding: 10px;"><span class="loading-spinner"></span> 推敲中...</div>` : `<div style="white-space:pre-wrap;">${content}</div>`}
            </div>
        `;
        bindBasicEvents();
    }

    async function callGemini(selectedText) {
        if (!settings.apiKey) { showConfig(); return; }
        showResult("正在审计...", "", true);

        let langInstruction = "";
        if (settings.language === "zh") langInstruction = "请务必使用中文回复。";
        else if (settings.language === "en") langInstruction = "Please reply in English.";
        else langInstruction = "请根据输入文本的语言决定回复语言（中文或英文）。";

        const systemPrompt = `你是一个冷静、客观的逻辑审计师。你的任务是评估言论的逻辑置信度。
${langInstruction}
规则：
1. 识别性质：只审计逻辑推论、事实主张或技术分析。对于纯主观感受（如“我很开心”），请直接回复：“属于个人主观感受，不在审计范围内。”
2. 立场中立：逻辑严密则肯定，有漏洞则指出。
3. 极致精炼：总回复控制在5句话以内。
4. 语言平实：禁止术语堆砌，直白陈述本质。`;

        const payload = {
            contents: [{ parts: [{ text: selectedText }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;

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
                        showResult("推敲结果", text);
                    } else {
                        showResult("Error", `API Error ${response.status}`);
                    }
                } catch (e) {
                    showResult("Parsing Error", "数据解析失败。");
                }
            },
            onerror: () => showResult("Network Error", "连接失败。")
        });
    }

    document.addEventListener('mouseup', (e) => {
        const selection = window.getSelection().toString().trim();
        if (selection.length < 5) return;
        if (!floatingBtn) {
            floatingBtn = document.createElement('div');
            floatingBtn.innerHTML = '🔍';
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
