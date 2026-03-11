// GET /api/export — Download all survey results as CSV (password protected)

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
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
    { id: 'q1', text: 'How did you first hear about OpenClaw?' },
    { id: 'q2', text: 'What best describes your interest in OpenClaw?' },
    { id: 'q3', text: 'What industry are you in?' },
    { id: 'q4', text: 'What would you want to use OpenClaw for?' },
    { id: 'q5', text: 'How familiar are you with AI tools?' },
    { id: 'q6', text: 'Which features of OpenClaw interest you the most?' },
    { id: 'q7', text: 'How important is automation in your work or daily life?' },
    { id: 'q8', text: 'What problems would you want OpenClaw to help solve?' },
    { id: 'q9', text: 'Where would you most likely use OpenClaw?' },
    { id: 'q10', text: 'How large is your organization?' },
    { id: 'q11', text: 'How likely are you to try a new AI tool like OpenClaw in the next 30 days?' },
    { id: 'q12', text: 'Which tools do you currently use that OpenClaw might improve or replace?' },
    { id: 'q13', text: 'What matters most when choosing an AI platform?' },
    { id: 'q14', text: 'What pricing model would you prefer?' },
    { id: 'q15', text: 'Would you be interested in trying OpenClaw?' },
    { id: 'q16', text: 'Is this conversation helpful so far?' },
    { id: 'q17', text: 'Would you be interested in an OpenClaw MasterClass? (3–4 sessions, 1 session per week)' },
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
        for (let i = 1; i <= 17; i++) {
            pipeline.push(['HGETALL', `oc:q${i}`]);
        }
        pipeline.push(['HGETALL', 'oc:respondents']);

        const results = await redis(pipeline);

        // Build question results
        const questionData = [];
        for (let i = 0; i < 16; i++) {
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
        const respondentsRaw = results[17]?.result;
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

        for (let i = 0; i < 16; i++) {
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
        res.setHeader('Content-Disposition', 'attachment; filename="openclaw-survey-results.csv"');
        return res.status(200).send(csv);
    } catch (err) {
        console.error('Export error:', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
