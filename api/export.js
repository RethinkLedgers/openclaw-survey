// GET /api/export — Download all survey results as CSV (password protected)

const UPSTASH_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_PASSWORD = 'opencl@w';

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

const QUESTIONS = [
    { id: 'q1', text: 'Will AI eventually replace most financial analysts?' },
    { id: 'q2', text: 'Should AI be allowed to make loan approval decisions without human review?' },
    { id: 'q3', text: 'Is the financial industry moving too slowly in adopting AI?' },
    { id: 'q4', text: 'Will autonomous AI agents become a standard part of banking within the next five years?' },
    { id: 'q5', text: 'Should customers always be told when they are interacting with AI instead of a human?' },
    { id: 'q6', text: 'Does AI reduce bias in financial decision-making, or create new forms of bias?' },
    { id: 'q7', text: 'Should regulators approve AI systems before they are deployed in financial services?' },
    { id: 'q8', text: 'Would you trust an AI financial advisor with your retirement savings?' },
    { id: 'q9', text: 'Will AI create more jobs in financial services than it eliminates?' },
    { id: 'q10', text: 'Are traditional banks better positioned than fintechs to lead the AI revolution?' },
    { id: 'q11', text: 'Should banks be allowed to use customer data to train AI models?' },
    { id: 'q12', text: 'Is generative AI currently overhyped in financial services?' },
    { id: 'q13', text: 'Will AI-powered fraud detection significantly reduce financial crime?' },
    { id: 'q14', text: 'Will AI make financial services more accessible to underserved communities?' },
    { id: 'q15', text: 'Are current regulations helping or hindering AI innovation in finance?' },
    { id: 'q16', text: 'Which poses the greater threat to financial institutions: falling behind in AI adoption or moving too quickly?' },
    { id: 'q17', text: 'In ten years, will customers prefer AI-driven financial services over human-led experiences?' },
    { id: 'q18', text: 'Would you let AI manage your personal investments?' },
    { id: 'q19', text: 'Will the CEO of a major bank be an AI within 25 years?' },
    { id: 'q20', text: 'Should AI-generated financial advice carry legal liability?' },
];

function escapeCSV(val) {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { password } = req.query;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const pipeline = [];
        for (let i = 1; i <= 20; i++) {
            pipeline.push(['HGETALL', `oc:q${i}`]);
        }
        pipeline.push(['HGETALL', 'oc:respondents']);

        const results = await redis(pipeline);

        // Build question results
        const questionData = [];
        for (let i = 0; i < 20; i++) {
            const hashData = results[i]?.result;
            const map = {};
            if (hashData && Array.isArray(hashData)) {
                for (let j = 0; j < hashData.length; j += 2) {
                    map[hashData[j]] = parseInt(hashData[j + 1], 10) || 0;
                }
            }
            questionData.push(map);
        }

        // Build respondents list
        const respondentsRaw = results[20]?.result;
        const respondents = [];
        if (respondentsRaw && Array.isArray(respondentsRaw)) {
            for (let j = 0; j < respondentsRaw.length; j += 2) {
                try {
                    respondents.push(JSON.parse(respondentsRaw[j + 1]));
                } catch { /* skip */ }
            }
        }

        // === CSV Part 1: Aggregated Results ===
        let csv = 'AGGREGATED RESULTS\n';
        csv += 'Question,Option,Count\n';

        for (let i = 0; i < 20; i++) {
            const q = QUESTIONS[i];
            const counts = questionData[i];
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            for (const [option, count] of sorted) {
                csv += `${escapeCSV(q.text)},${escapeCSV(option)},${count}\n`;
            }
        }

        // === CSV Part 2: Respondents ===
        csv += '\nRESPONDENTS\n';
        csv += 'Name,Email,Timestamp\n';
        respondents
            .sort((a, b) => (b.ts || 0) - (a.ts || 0))
            .forEach(r => {
                const date = r.ts ? new Date(r.ts).toISOString() : '';
                csv += `${escapeCSV(r.name)},${escapeCSV(r.email)},${date}\n`;
            });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="signal-noise-debate-results.csv"');
        return res.status(200).send(csv);
    } catch (err) {
        console.error('Export error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
