// ==UserScript==
// @name         Tui-Qiao (推敲) - Truth Seeker
// @namespace    http://tampermonkey.net/
// @version      0.8
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
        model: "gemini-2.0-flash", 
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
            position: fixed; top: 20px; right: 20px; width: 420px; max-height: 85vh;
            background: var(--bg); border: 1px solid var(--border); border-radius: 16px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); z-index: 2147483647;
            display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica;
            overflow: hidden; animation: slideIn 0.2s ease-out; border: 1px solid rgba(0,0,0,0.05);
        }
        @keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .header { padding: 14px 20px; background: #fff; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .header-title { font-weight: 800; font-size: 15px; color: #111827; display: flex; align-items: center; gap: 8px; }
        .content { padding: 20px; overflow-y: auto; font-size: 14px; line-height: 1.6; color: #374151; background: #fff; }
        .loading-spinner { border: 2px solid #f3f3f3; border-top: 2px solid var(--primary); border-radius: 50%; width: 18px; height: 18px; animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .audit-card { background: #f8fafc; padding: 14px; border-radius: 12px; margin-bottom: 12px; border: 1px solid #f1f5f9; }
        .card-label { font-weight: 800; font-size: 12px; color: var(--primary); text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.05em; display: block; }
        .card-body { color: #1e293b; font-size: 14px; }
        .icon-btn { cursor: pointer; color: #9ca3af; transition: all 0.2s; font-size: 18px; display: flex; align-items: center; }
        .icon-btn:hover { color: var(--primary); transform: scale(1.1); }
        .config-view { display: flex; flex-direction: column; gap: 16px; }
        .field label { font-size: 12px; font-weight: 700; color: #4b5563; display: block; margin-bottom: 6px; }
        .field input, .field select { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; background: #f9fafb; }
        .save-btn { background: #111827; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 700; transition: opacity 0.2s; }
        .save-btn:hover { opacity: 0.9; }
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
                <div style="display:flex; gap:14px;">
                    <div class="icon-btn settings-trigger" title="Settings">⚙️</div>
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
                        <input type="password" id="api-key-input" value="${settings.apiKey}" placeholder="Paste your API Key">
                    </div>
                    <div class="field">
                        <label>推理模型 / Model</label>
                        <select id="model-select">
                            <option value="gemini-2.0-flash" ${settings.model === 'gemini-2.0-flash' ? 'selected' : ''}>Gemini 2.0 Flash (推荐)</option>
                            <option value="gemini-2.0-pro-exp-02-05" ${settings.model === 'gemini-2.0-pro-exp-02-05' ? 'selected' : ''}>Gemini 2.0 Pro (最强推理)</option>
                            <option value="gemini-1.5-flash-latest" ${settings.model.includes('1.5-flash') ? 'selected' : ''}>Gemini 1.5 Flash</option>
                            <option value="gemini-1.5-pro-latest" ${settings.model.includes('1.5-pro') ? 'selected' : ''}>Gemini 1.5 Pro</option>
                        </select>
                    </div>
                    <button class="save-btn" id="save-config">保存并应用</button>
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
            showResult("设置已保存", "配置成功！现在划选文字即可开始“推敲”。");
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
                ${isLoading ? `<div style="text-align:center; padding: 20px;"><span class="loading-spinner"></span><br><br><span style="font-size:12px; color:#6b7280;">正在推敲中...</span></div>` : formatResponse(content)}
            </div>
        `;
        bindBasicEvents();
    }

    function formatResponse(text) {
        if (!text) return "未能获取结果，请检查 API Key 或网络。";
        const sections = text.split('\n\n');
        return sections.map(s => {
            if (s.includes('：') || s.includes(':')) {
                const parts = s.split(/[:：]/);
                const label = parts[0].replace(/[#*]/g, '').trim();
                const body = parts.slice(1).join(':').trim();
                if (label.length < 15) {
                    return `<div class="audit-card"><span class="card-label">${label}</span><div class="card-body">${body}</div></div>`;
                }
            }
            return `<p>${s.replace(/\n/g, '<br>')}</p>`;
        }).join('');
    }

    async function callGemini(selectedText) {
        if (!settings.apiKey) { showConfig(); return; }
        showResult("推敲中...", "", true);

        const systemPrompt = `你是一个说话直白、专门讲“大白话”的逻辑审计师。你的任务是帮普通人看穿言论背后的真相。
请按以下格式输出，禁止使用专业术语，要像在咖啡馆聊天一样直白：
1. 到底在说什么：(一句话总结对方的本质意图)
2. 他在忽悠什么：(拆穿那些虚头巴脑的逻辑或夸大的词)
3. 谁在赚你的钱：(分析这条信息火了对谁有好处)
4. 大白话真相：(用第一性原理说出这件事的真实逻辑)`;

        const payload = {
            contents: [{ parts: [{ text: selectedText }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };

        // 统一使用 v1beta 接口
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
                        showResult("推敲审计报告", text);
                    } else {
                        showResult("出错啦", `错误码 ${response.status}: ${data.error?.message || 'API 拒绝了请求'}`);
                    }
                } catch (e) {
                    showResult("解析失败", "返回数据格式不对，请检查 API Key。");
                }
            },
            onerror: () => showResult("网络错误", "无法连接到 Google 节点，请检查梯子。")
        });
    }

    document.addEventListener('mouseup', (e) => {
        const selection = window.getSelection().toString().trim();
        if (selection.length < 5) return;
        if (!floatingBtn) {
            floatingBtn = document.createElement('div');
            floatingBtn.innerHTML = '🔍';
            floatingBtn.style = `position: fixed; cursor: pointer; font-size: 18px; z-index: 2147483646; background: white; border: 1px solid #2563eb; border-radius: 8px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); transition: transform 0.1s;`;
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
