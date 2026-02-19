const fs = require('fs');
const path = require('path');
const axios = require('axios');
// GitHub Actions の Environment Secrets を考慮し、環境変数が設定されていない場合のみ .env を読み込む
// GITHUB_ は予約されているため、GH_TOKEN もチェック対象に含める
if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN && !process.env.GEMINI_API_KEY) {
    require('dotenv').config({ path: '../config/.env' });
}

const CONFIG_PATH = path.join(__dirname, '../config/config.json');
const DATA_DIR = path.join(__dirname, '../data');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const LOG_FILE = path.join(DATA_DIR, 'collector.log');

function log(message) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    fs.appendFileSync(LOG_FILE, formattedMessage);
}

let collectionTimer = null;
let currentIntervalHours = null;

async function getRepoDetails(fullName, headers) {
    try {
        const url = `https://api.github.com/repos/${fullName}/readme`;
        const response = await axios.get(url, { headers });
        const readmeContent = Buffer.from(response.data.content, 'base64').toString('utf8');
        return readmeContent.slice(0, 5000); // 最初の5000文字を抽出
    } catch (err) {
        console.warn(`Could not fetch README for ${fullName}: ${err.message}`);
        return null;
    }
}

async function run() {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

        if (!config.collector.enabled) {
            log('Collector is disabled. Skipping...');
            return;
        }

        log(`Starting collection for user: ${config.collector.github_user_id}`);

        const repositories = [];
        let page = 1;
        const perPage = 30; // 1ページあたりの件数
        const maxPages = 3; // 最大3ページ (計90件) 取得

        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
        const headers = token ? { Authorization: `token ${token}` } : {};

        while (page <= maxPages) {
            log(`Fetching page ${page}...`);
            const query = 'topic:model-context-protocol';
            const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&page=${page}&per_page=${perPage}`;

            try {
                const response = await axios.get(url, { headers });
                const items = response.data.items;

                if (!items || items.length === 0) {
                    log('No more items found.');
                    break;
                }

                for (const repo of items) {
                    log(`  - Processing ${repo.full_name}`);
                    repositories.push({
                        name: repo.full_name,
                        stars: repo.stargazers_count,
                        description: repo.description,
                        url: repo.html_url,
                        updated_at: repo.updated_at,
                        language: repo.language,
                        license: repo.license ? repo.license.spdx_id : null
                    });
                }
                page++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (apiErr) {
                log(`API Error on page ${page}: ${apiErr.message}`);
                if (apiErr.response && apiErr.response.status === 403) {
                    log('Rate limit hit? Stopping.');
                }
                break;
            }
        }

        const result = {
            timestamp: new Date().toISOString(),
            total_count: repositories.length,
            repositories: repositories
        };

        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
        if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR);

        // 最新版として保存
        fs.writeFileSync(path.join(DATA_DIR, 'raw_data.json'), JSON.stringify(result, null, 2));

        // 履歴として保存
        const filename = `raw_data_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        fs.writeFileSync(path.join(HISTORY_DIR, filename), JSON.stringify(result, null, 2));

        log(`Collection completed. Saved ${repositories.length} repositories.`);
    } catch (err) {
        log(`Collection failed: ${err.message}`);
    }
}

function scheduleNext() {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        const intervalHours = config.collector.interval_hours || 24;

        if (currentIntervalHours !== intervalHours) {
            log(`Updating schedule: every ${intervalHours} hours`);
            if (collectionTimer) clearInterval(collectionTimer);

            currentIntervalHours = intervalHours;
            const ms = intervalHours * 3600000;
            collectionTimer = setInterval(run, ms);
        }
    } catch (err) {
        log(`Failed to schedule next run: ${err.message}`);
    }
}

// Configファイルの監視
fs.watch(CONFIG_PATH, (eventType) => {
    if (eventType === 'change') {
        log('Config file changed. Reloading schedule...');
        // ファイル書き込み完了を待つために少し待機
        setTimeout(scheduleNext, 100);
    }
});

// 初回実行とスケジュール設定
scheduleNext();
run();
