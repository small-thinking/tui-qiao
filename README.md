# Tui-Qiao (推敲) 🧠

A selection-based auditing tool to find "First Principles" within the AI hype.
在 AI 泡沫中寻找“第一性原理”的划词审计工具。

### What it does? / 它能做什么？
When you see "Token Flexing", Hardware FOMO, or marketing vibes on X/Twitter or any webpage:
当你在 X/Twitter 或网页上看到“Token 炫耀”、硬件 FOMO 或各类营销 Vibes 时：

1. **Select text** / 划选文字
2. Click the **🧠 button** / 点击出现的 **🧠 按钮**
3. Get a **Logic Audit Report** deconstructing: Hidden Assumptions, Logical Leaps, Cui Bono (Who benefits), and First Principles.
   获取一份**“逻辑审计报告”**：拆解核心假设、逻辑断层、利益相关与 ROI。

---

### Quick Start / 如何开始？

#### 1. Run Local Bridge (Mac/Linux) / 运行本地 Bridge
Ensure you have `gemini-cli` installed and configured:
确保你已安装并配置好 `gemini-cli`：

```bash
git clone https://github.com/small-thinking/tui-qiao.git
cd tui-qiao
npm install express cors
node gemini_bridge.js
```

#### 2. Install Userscript / 安装油猴脚本
Copy the code from `first-principle-auditor.user.js` and install it into your browser extension (e.g., Tampermonkey).
将 `first-principle-auditor.user.js` 的代码复制并安装到你的浏览器插件 (Tampermonkey) 中。

---
*Powered by [small-thinking](https://github.com/small-thinking). ROI over Vibes.*
