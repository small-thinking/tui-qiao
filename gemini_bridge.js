const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/analyze', (req, res) => {
    const text = req.body.text;
    console.log("Receiving text for analysis...");
    
    // 调用 Gemini-CLI 和我们的 Tui-Qiao Skill
    const command = `echo "${text.replace(/"/g, '\\"')}" | gemini skills use tui-qiao`;
    
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
