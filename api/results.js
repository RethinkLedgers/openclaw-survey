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

// Single-select question IDs (used to calculate unique respondents)
const SINGLE_SELECT_IDS = [1, 2, 3, 5, 7, 9, 10, 11, 14, 16];

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const pipeline = [];
        for (let i = 1; i <= 16; i++) {
            pipeline.push(['HGETALL', `oc:q${i}`]);
        }
        pipeline.push(['GET', 'oc:lastResponseTime']);
        // Fetch individual responses for masterclass questions
        pipeline.push(['LRANGE', 'oc:ind:q14', 0, -1]);
        pipeline.push(['LRANGE', 'oc:ind:q15', 0, -1]);
        pipeline.push(['LRANGE', 'oc:ind:q16', 0, -1]);

        const results = await redis(pipeline);

        const questions = {};
        let maxRespondents = 0;

        for (let i = 0; i < 16; i++) {
            const hashData = results[i]?.result;
            const map = {};
            let qTotal = 0;

            if (hashData && Array.isArray(hashData)) {
                for (let j = 0; j < hashData.length; j += 2) {
                    const count = parseInt(hashData[j + 1], 10) || 0;
                    map[hashData[j]] = count;
                    qTotal += count;
                }
            }

            questions[`q${i + 1}`] = { counts: map, total: qTotal };

            // For single-select questions, total votes = unique respondents
            // Use the max across single-select questions as best estimate
            if (SINGLE_SELECT_IDS.includes(i + 1) && qTotal > maxRespondents) {
                maxRespondents = qTotal;
            }
        }

        const lastResponseTime = parseInt(results[16]?.result, 10) || null;

        // Parse individual responses for q14-q16
        const individual = {};
        ['q14', 'q15', 'q16'].forEach((qid, idx) => {
            const raw = results[17 + idx]?.result || [];
            individual[qid] = raw.map(item => {
                try { return JSON.parse(item); } catch { return null; }
            }).filter(Boolean);
        });

        res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');

        return res.status(200).json({
            total: maxRespondents,
            lastResponseTime,
            questions,
            individual
        });
    } catch (err) {
        console.error('Results error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
