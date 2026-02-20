const express = require('express');
const cors = require('cors');
const basicAuth = require('express-basic-auth');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.use(cors());

// --- Basic Authentication ---
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPass = process.env.ADMIN_PASS || 'mcp-secret';
app.use(basicAuth({
    users: { [adminUser]: adminPass },
    challenge: true,
    realm: 'MCP Insider Admin'
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, '../src/data');
const ANALYZED_DATA_PATH = path.join(DATA_DIR, 'analyzed_data.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');

// --- Helper Functions ---
function readJson(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {
        console.error(`Error reading ${filePath}:`, e);
    }
    return defaultValue;
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// --- API Endpoints ---

// Get all analyzed data
app.get('/api/data', (req, res) => {
    const data = readJson(ANALYZED_DATA_PATH, { projects: [] });
    res.json(data);
});

// Update an item (status, text, etc.)
app.post('/api/data/:url', (req, res) => {
    const url = decodeURIComponent(req.params.url);
    const updates = req.body;

    const data = readJson(ANALYZED_DATA_PATH, { projects: [] });
    const projectIndex = data.projects.findIndex(p => p.url === url);

    if (projectIndex !== -1) {
        data.projects[projectIndex] = { ...data.projects[projectIndex], ...updates };
        writeJson(ANALYZED_DATA_PATH, data);
        res.json({ success: true, project: data.projects[projectIndex] });
    } else {
        res.status(404).json({ error: "Project not found" });
    }
});

// Delete an item
app.delete('/api/data/:url', (req, res) => {
    const url = decodeURIComponent(req.params.url);
    const data = readJson(ANALYZED_DATA_PATH, { projects: [] });
    const initialLength = data.projects.length;
    data.projects = data.projects.filter(p => p.url !== url);

    if (data.projects.length < initialLength) {
        data.total_count = data.projects.length;
        writeJson(ANALYZED_DATA_PATH, data);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Project not found" });
    }
});

// Get settings
app.get('/api/settings', (req, res) => {
    const settings = readJson(SETTINGS_PATH, { auto_publish: false, retention_days: 30, maintenance_mode: false });
    res.json(settings);
});

// Update settings
app.post('/api/settings', (req, res) => {
    writeJson(SETTINGS_PATH, req.body);
    res.json({ success: true });
});

// Run scripts
function runScript(command, res) {
    const cwd = path.join(__dirname, '..');
    exec(command, { cwd }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            return res.status(500).json({ error: error.message, stderr });
        }
        res.json({ success: true, stdout, stderr });
    });
}

app.post('/api/collect', (req, res) => {
    runScript('npm run collect', res);
});

app.post('/api/analyze', (req, res) => {
    runScript('npm run analyze', res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Admin server running at http://localhost:${PORT}`);
});
