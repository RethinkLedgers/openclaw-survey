// POST /api/submit — Atomically increment vote counts in Upstash Redis
// Uses HINCRBY (atomic) so 100+ concurrent submissions are safe

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
        const { answers } = req.body;
        if (!answers || typeof answers !== 'object') {
            return res.status(400).json({ error: 'Invalid payload' });
        }

        // Build atomic pipeline: HINCRBY for each answer + INCR total + SET timestamp
        const pipeline = [];

        for (const [qid, values] of Object.entries(answers)) {
            // Validate question ID format
            if (!/^q\d+$/.test(qid)) continue;
            if (!Array.isArray(values)) continue;

            for (const val of values) {
                if (typeof val !== 'string' || val.length > 200) continue;
                pipeline.push(['HINCRBY', `oc:${qid}`, val, 1]);
            }
        }

        pipeline.push(['INCR', 'oc:total']);
        pipeline.push(['SET', 'oc:lastResponseTime', Date.now().toString()]);

        await redis(pipeline);

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Submit error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
