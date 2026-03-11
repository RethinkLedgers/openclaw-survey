// POST /api/reset — Delete all survey data from Upstash Redis

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
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Delete all keys in one pipeline
        const pipeline = [];
        for (let i = 1; i <= 17; i++) {
            pipeline.push(['DEL', `oc:q${i}`]);
        }
        pipeline.push(['DEL', 'oc:total']);
        pipeline.push(['DEL', 'oc:lastResponseTime']);
        pipeline.push(['DEL', 'oc:respondents']);

        await redis(pipeline);

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Reset error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
