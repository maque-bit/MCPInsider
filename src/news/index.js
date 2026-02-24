const fs = require('fs');
const path = require('path');
const axios = require('axios');
const RSSParser = require('rss-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Load API Key from central config
if (!process.env.GEMINI_API_KEY) {
    const envPath = path.join(__dirname, '../config/.env');
    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
    }
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'MISSING_KEY');
const parser = new RSSParser();

// Paths
const DATA_DIR = path.join(__dirname, '../data');
const FEEDS_PATH = path.join(DATA_DIR, 'news_feeds.json');
const NEWS_DATA_PATH = path.join(DATA_DIR, 'news_data.json');

async function summarizeNews(title, content) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
以下のAI/テクノロジー関連のニュース記事を、ウェブサイトのニュースセクション向けに処理してください。

1. **魅力的な日本語タイトル**: 原文の直訳ではなく、日本のエンジニアが読みたくなるような、内容がパッと伝わるキャッチーなタイトルを生成してください。
2. **3行要約**: 内容を3行程度の日本語で簡潔に要約してください。

タイトル: ${title}
内容: ${content.substring(0, 2000)}

出力は以下のJSON形式のみで返してください：
{
  "title_ja": "生成したタイトル",
  "summary_ja": "生成した要約"
}
`;

    try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();
        // Remove markdown code blocks if present
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('Invalid JSON response');
    } catch (error) {
        console.error('Error during summarization:', error);
        return {
            title_ja: title, // Fallback to original title
            summary_ja: '要約の生成に失敗しました。'
        };
    }
}

function generateSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 50);
}

async function run() {
    console.log('--- Starting News Collection & Summarization ---');

    // 1. Load feeds
    if (!fs.existsSync(FEEDS_PATH)) {
        console.error('Feeds config not found!');
        return;
    }
    const feeds = JSON.parse(fs.readFileSync(FEEDS_PATH, 'utf-8'));

    // 2. Load existing news
    let newsData = [];
    if (fs.existsSync(NEWS_DATA_PATH)) {
        newsData = JSON.parse(fs.readFileSync(NEWS_DATA_PATH, 'utf-8'));
    }

    const newItems = [];
    const processedUrls = new Set(newsData.map(item => item.url));

    for (const feed of feeds) {
        console.log(`Fetching feed: ${feed.name}...`);
        try {
            const feedData = await parser.parseURL(feed.url);
            // 最新 3件のみ処理
            const items = feedData.items.slice(0, 3);

            for (const item of items) {
                if (processedUrls.has(item.link)) {
                    console.log(`  Skipping existing: ${item.title}`);
                    continue;
                }

                console.log(`  Summarizing: ${item.title}...`);
                const result = await summarizeNews(item.title, item.contentSnippet || item.content || '');

                const newsItem = {
                    title: item.title,
                    title_ja: result.title_ja,
                    url: item.link,
                    date: item.pubDate || new Date().toISOString(),
                    source: feed.name,
                    category: feed.category,
                    summary_ja: result.summary_ja,
                    slug: generateSlug(item.title) + '-' + Math.random().toString(36).substring(2, 7)
                };

                newItems.push(newsItem);
                processedUrls.add(item.link);
            }
        } catch (error) {
            console.error(`  Error fetching ${feed.name}:`, error.message);
        }
    }

    // 3. Save combined news (Newest first)
    const combinedNews = [...newItems, ...newsData]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 50); // 最大 50件保持

    fs.writeFileSync(NEWS_DATA_PATH, JSON.stringify(combinedNews, null, 2));
    console.log(`--- Finished! Added ${newItems.length} new items. Total: ${combinedNews.length} ---`);
}

run();
