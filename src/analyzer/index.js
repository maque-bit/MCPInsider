const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// GitHub Actions Secrets またはローカルの .env を読み込む
if (!process.env.GEMINI_API_KEY) {
    require('dotenv').config({ path: '../config/.env' });
}

const RAW_DATA_PATH = path.join(__dirname, '../data/raw_data.json');
const ANALYZED_DATA_PATH = path.join(__dirname, '../data/analyzed_data.json');
const SETTINGS_PATH = path.join(__dirname, '../data/settings.json');
const LOG_FILE = path.join(__dirname, '../data/analyzer.log');

function log(message) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    fs.appendFileSync(LOG_FILE, formattedMessage);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SUPPORTED_MODELS = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-pro"];
let currentModelIndex = 0;

async function analyzeProject(project) {
    while (currentModelIndex < SUPPORTED_MODELS.length) {
        let modelId = SUPPORTED_MODELS[currentModelIndex];
        let model = genAI.getGenerativeModel({ model: modelId });

        const prompt = `
あなたは技術トレンドに敏感なエンジニア兼テックライターです。
以下の MCP (Model Context Protocol) サーバーのリポジトリ情報を分析し、開発者がワクワクするような紹介文を日本語で作成してください。

リポジトリ名: ${project.name}
GitHub説明: ${project.description}
URL: ${project.url}

以下の項目を含むJSON形式で出力してください：
1. summary_ja: 技術者が「これは便利だ！」「面白そうだ！」と思えるような、魅力的な日本語概要（140文字程度）。
2. catchphrase: 好奇心を刺激する一言キャッチコピー。
3. wow_factor: このプロジェクトの技術的にユニークな点や、エンジニアが驚くポイント（1文）。
4. dev_utility: このツールを導入することで、開発効率がどれくらい上がるか（1-10の数値）。
5. category: ['Database', 'Search', 'API', 'Utility', 'Automation', 'DevTools', 'Communication'] から最適な複数を。
6. safety_level: 'Safe' (読み取りのみ等), 'Caution' (書き込み/実行権限が必要等), 'Unknown'。
7. use_cases: 具体的に「これを使って〇〇ができる」というシナリオを2-3個。

出力は純粋なJSONのみにしてください（マークダウンのコードブロックは不要）。
`;

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim();
            const cleanJson = text.replace(/```json|```/g, '');
            return JSON.parse(cleanJson);
        } catch (err) {
            if (err.message.includes('404') || err.message.includes('not found')) {
                log(`Model ${modelId} not found, trying next...`);
                currentModelIndex++;
                continue;
            }
            log(`Failed to analyze ${project.name} with ${modelId}: ${err.message}`);
            return null;
        }
    }
    log('No working models found in SUPPORTED_MODELS.');
    return null;
}

async function main() {
    try {
        if (!fs.existsSync(RAW_DATA_PATH)) {
            log('No raw_data.json found. Run collector first.');
            return;
        }

        const rawData = JSON.parse(fs.readFileSync(RAW_DATA_PATH, 'utf8'));
        const existingData = fs.existsSync(ANALYZED_DATA_PATH)
            ? JSON.parse(fs.readFileSync(ANALYZED_DATA_PATH, 'utf8'))
            : { projects: [] };

        let settings = { auto_publish: false, retention_days: 30, maintenance_mode: false };
        if (fs.existsSync(SETTINGS_PATH)) {
            settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        }

        log(`Settings loaded: auto_publish=${settings.auto_publish}, retention_days=${settings.retention_days}`);

        // Cleanup old data
        const now = new Date();
        let validProjects = existingData.projects.filter(p => {
            if (!p.analyzed_at) return true;
            const itemDate = new Date(p.analyzed_at);
            const diffDays = (now - itemDate) / (1000 * 60 * 60 * 24);
            return diffDays <= settings.retention_days;
        });

        // Filter out projects that are already analyzed correctly (optional: or re-analyze if needed)
        // For now, we will re-analyze if they are in rawData, or just add new ones.
        // Actually, let's just analyze ones that are in rawData. If they exist in validProjects, we might update them.
        // To be safe, let's analyze all rawData, and overwrite existing or add new ones.

        log(`Analyzing ${rawData.repositories.length} repositories...`);

        // Create a map of existing projects to preserve status if already published, etc.
        const projectsMap = new Map();
        for (const p of validProjects) {
            projectsMap.set(p.url, p);
        }

        // 並列実行だとレート制限にかかる可能性があるため、順次処理
        for (const repo of rawData.repositories) {
            log(`- Analyzing ${repo.name}...`);
            const analysis = await analyzeProject(repo);
            if (analysis) {
                const existing = projectsMap.get(repo.url);
                const status = existing && existing.status === "published" ? "published" : (settings.auto_publish ? "published" : "draft");

                projectsMap.set(repo.url, {
                    ...repo,
                    analysis: analysis,
                    status: status,
                    analyzed_at: new Date().toISOString()
                });
            }
            // レート制限への配慮
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const finalProjects = Array.from(projectsMap.values());

        const finalResult = {
            last_updated: new Date().toISOString(),
            total_count: finalProjects.length,
            projects: finalProjects
        };

        fs.writeFileSync(ANALYZED_DATA_PATH, JSON.stringify(finalResult, null, 2));
        log(`Analysis completed. Output saved to analyzed_data.json.`);

    } catch (err) {
        log(`Fatal error during analysis: ${err.message}`);
    }
}

main();
