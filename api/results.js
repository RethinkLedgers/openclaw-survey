// GET /api/results — Fetch all aggregated results from Upstash Redis

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(commands) {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${UPSTASH_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Redis error: ${res.status}`);
    return res.json();
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Fetch all question hashes + total + timestamp in one pipeline
        const pipeline = [];
        for (let i = 1; i <= 16; i++) {
            pipeline.push(['HGETALL', `oc:q${i}`]);
        }
        pipeline.push(['GET', 'oc:total']);
        pipeline.push(['GET', 'oc:lastResponseTime']);

        const results = await redis(pipeline);

        // Parse results
        const questions = {};
        for (let i = 0; i < 16; i++) {
            const hashData = results[i]?.result;
            if (hashData && Array.isArray(hashData)) {
                // HGETALL returns flat array: [key1, val1, key2, val2, ...]
                const map = {};
                for (let j = 0; j < hashData.length; j += 2) {
                    map[hashData[j]] = parseInt(hashData[j + 1], 10) || 0;
                }
                questions[`q${i + 1}`] = map;
            } else {
                questions[`q${i + 1}`] = {};
            }
        }

        const total = parseInt(results[16]?.result, 10) || 0;
        const lastResponseTime = parseInt(results[17]?.result, 10) || null;

        // Cache for 1 second to handle burst polling from many clients
        res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');

        return res.status(200).json({ total, lastResponseTime, questions });
    } catch (err) {
        console.error('Results error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
