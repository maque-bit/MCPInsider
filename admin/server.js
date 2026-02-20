const express = require('express');
const cors = require('cors');
const basicAuth = require('express-basic-auth');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

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
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`Successfully wrote to ${filePath}`);
    } catch (e) {
        console.error(`Failed to write to ${filePath}:`, e);
        throw e;
    }
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
    console.log('Received settings update request:', req.body);
    try {
        writeJson(SETTINGS_PATH, req.body);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// SSE Streaming for scripts
app.get('/api/stream/:action', (req, res) => {
    const action = req.params.action;
    let command = '';

    if (action === 'collect') command = 'npm run collect';
    else if (action === 'analyze') command = 'npm run analyze';
    else if (action === 'deploy') {
        command = 'git add -f src/data/analyzed_data.json src/data/settings.json && git commit -m "chore: update data from admin panel" && git push || echo "No changes to commit or push failed"';
    } else {
        return res.status(400).json({ error: 'Invalid action' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    const sendEvent = (data, event = 'message') => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const cwd = path.join(__dirname, '..');
    const child = spawn('sh', ['-c', command], {
        cwd,
        env: { ...process.env, FORCE_COLOR: '1' }
    });

    child.stdout.on('data', (data) => {
        sendEvent(data.toString());
    });

    child.stderr.on('data', (data) => {
        sendEvent(data.toString(), 'error');
    });

    child.on('close', (code) => {
        sendEvent({ code }, 'done');
        res.end();
    });

    req.on('close', () => {
        child.kill();
    });
});

// Legacy endpoints (backward compatibility)
app.post('/api/collect', (req, res) => res.status(202).json({ success: true }));
app.post('/api/analyze', (req, res) => res.status(202).json({ success: true }));
app.post('/api/deploy', (req, res) => res.status(202).json({ success: true }));

// Fallback 404 for API
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found. The server might need a restart to apply the latest updates.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Admin server running at http://localhost:${PORT}`);
});
