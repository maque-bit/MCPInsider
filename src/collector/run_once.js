const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: '../config/.env' });

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

async function run() {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        log('Starting single-run collection...');
        const repositories = [];
        let page = 1;
        const perPage = 10;
        const maxPages = 1;

        const headers = process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {};

        while (page <= maxPages) {
            log(`Fetching page ${page}...`);
            const query = 'topic:model-context-protocol';
            const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&page=${page}&per_page=${perPage}`;
            const response = await axios.get(url, { headers });
            const items = response.data.items;
            for (const repo of items) {
                log(`  - Found ${repo.full_name}`);
                repositories.push({ name: repo.full_name, stars: repo.stargazers_count });
            }
            page++;
        }

        const result = { timestamp: new Date().toISOString(), count: repositories.length, repositories };
        fs.writeFileSync(path.join(DATA_DIR, 'raw_data.json'), JSON.stringify(result, null, 2));
        log('Done.');
    } catch (err) {
        log('Error: ' + err.message);
        process.exit(1);
    }
}

run();
