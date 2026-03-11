const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/analyze', (req, res) => {
    const text = req.body.text;
    console.log("Receiving text for analysis...");
    
    // 更加通用的“求真”逻辑
    const systemPrompt = "你是一个精通逻辑分析与第一性原理的审计师。你的目标是‘求真’。针对用户提供的任何言论、主张或信息，请进行深度的逻辑穿透。必须包含：1. 隐藏假设 (Hidden Assumptions)；2. 逻辑断层 (Logical Leaps)；3. 利益相关 (Cui Bono)；4. 第一性原理重构 (First Principles)。语气冷静、专业、不带偏见，直击核心。";
    const command = `echo "${text.replace(/"/g, '\\"')}" | gemini --system "${systemPrompt}"`;
    
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error}`);
            return res.status(500).json({ error: stderr });
        }
        res.json({ result: stdout });
    });
});

app.listen(3000, () => {
    console.log('Tui-Qiao Bridge running at http://localhost:3000');
});
