document.addEventListener('DOMContentLoaded', () => {
    fetchConfig();
    fetchEnv();

    document.getElementById('save-config').addEventListener('click', saveConfig);
});

async function fetchConfig() {
    const res = await fetch('/api/config');
    const config = await res.json();
    renderConfig(config);
}

async function fetchEnv() {
    const res = await fetch('/api/env');
    const env = await res.json();
    renderEnv(env);
}

function renderConfig(config) {
    const switchesDiv = document.getElementById('component-switches');
    const fieldsDiv = document.getElementById('config-fields');
    switchesDiv.innerHTML = '';
    fieldsDiv.innerHTML = '';

    // Switches for components
    const components = ['collector', 'analyzer', 'web'];
    components.forEach(comp => {
        const item = document.createElement('div');
        item.className = 'switch-item';
        item.innerHTML = `
            <span>${comp.charAt(0).toUpperCase() + comp.slice(1)}</span>
            <label class="switch">
                <input type="checkbox" id="sw-${comp}" ${config[comp].enabled ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        `;
        switchesDiv.appendChild(item);
    });

    // Custom fields
    // Collector Github User ID & Interval
    fieldsDiv.innerHTML += `
        <div class="input-group">
            <label for="github-id">GitHub Target User ID</label>
            <input type="text" id="github-id" value="${config.collector.github_user_id}">
        </div>
        <div class="input-group">
            <label for="interval-hours">Collection Interval (Hours)</label>
            <input type="number" id="interval-hours" value="${config.collector.interval_hours || 24}" min="1" max="168">
            <p class="help-text">1時間から1週間(168時間)の間で設定可能です。</p>
        </div>
        <div class="input-group">
            <label for="site-title">Site Title</label>
            <input type="text" id="site-title" value="${config.web.site_title}">
        </div>
    `;
}

function renderEnv(env) {
    const envDiv = document.getElementById('env-fields');
    envDiv.innerHTML = '';

    Object.keys(env).forEach(key => {
        const item = document.createElement('div');
        item.className = 'env-item';
        item.innerHTML = `
            <div style="flex: 1;">
                <label>${key}</label>
                <div style="display: flex; gap: 0.5rem;">
                    <input type="password" id="env-${key}" placeholder="新しい値を入力">
                    <button class="btn-primary" onclick="updateEnv('${key}')">更新</button>
                </div>
            </div>
        `;
        envDiv.appendChild(item);
    });
}

async function saveConfig() {
    const config = {
        collector: {
            enabled: document.getElementById('sw-collector').checked,
            github_user_id: document.getElementById('github-id').value,
            interval_hours: parseInt(document.getElementById('interval-hours').value) || 24
        },
        analyzer: {
            enabled: document.getElementById('sw-analyzer').checked,
            model: "gemini-1.5-flash"
        },
        web: {
            enabled: document.getElementById('sw-web').checked,
            site_title: document.getElementById('site-title').value
        },
        notification: {
            slack_enabled: false,
            discord_enabled: false
        }
    };

    const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });

    if (res.ok) {
        alert('設定を保存しました');
    }
}

async function updateEnv(key) {
    const value = document.getElementById(`env-${key}`).value;
    if (!value) return;

    const res = await fetch('/api/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
    });

    if (res.ok) {
        alert(`${key} を更新しました`);
        document.getElementById(`env-${key}`).value = '';
    }
}
