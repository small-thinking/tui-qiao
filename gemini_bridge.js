const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/analyze', (req, res) => {
    const text = req.body.text;
    console.log("Receiving text for analysis...");
    
    // 直接在 Prompt 中定义“推敲”逻辑，不再依赖外部 Skill
    const systemPrompt = "你是一个精通批判性思维的审计师。针对提供的营销、技术或硬件讨论，请进行逻辑拆解。必须包含：核心假设(Hidden Assumptions)、逻辑断层(Logical Leaps)、利益相关(Cui Bono)、第一性原理(First Principles)。语言精炼，直击痛点。";
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
