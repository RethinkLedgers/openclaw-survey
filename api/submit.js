// POST /api/submit — Atomically increment vote counts in Upstash Redis
// Supports single-question submissions: { qid, values, isFinal }
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
        const { qid, values, isFinal, name, email } = req.body;

        // Validate
        if (!qid || !/^q\d+$/.test(qid)) {
            return res.status(400).json({ error: 'Invalid question ID' });
        }
        if (!Array.isArray(values) || values.length === 0) {
            return res.status(400).json({ error: 'Invalid values' });
        }

        const pipeline = [];

        for (const val of values) {
            if (typeof val !== 'string' || val.length > 200) continue;
            pipeline.push(['HINCRBY', `oc:${qid}`, val, 1]);
        }

        // Store respondent info (keyed by email to deduplicate)
        if (name && email) {
            pipeline.push(['HSET', 'oc:respondents', email, JSON.stringify({ name, email, ts: Date.now() })]);
        }

        // Store individual responses for masterclass questions (q14, q15, q16)
        const individualQids = ['q14', 'q15', 'q16'];
        if (individualQids.includes(qid) && name) {
            pipeline.push(['RPUSH', `oc:ind:${qid}`, JSON.stringify({
                name: name || 'Anonymous',
                email: email || '',
                values,
                ts: Date.now()
            })]);
        }

        // Only increment total respondent count on the final question
        if (isFinal) {
            pipeline.push(['INCR', 'oc:total']);
        }

        pipeline.push(['SET', 'oc:lastResponseTime', Date.now().toString()]);

        await redis(pipeline);

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Submit error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
