// IgniteAI Expo — server function.
//   POST {action:"register", data:{...}}             anyone   submit an application -> entry number
//   POST {action:"getCertificate", id}               anyone   one certificate, by its private id
//   POST {action:"emailStatus"}                      admins   is SMTP configured?
//   POST {action:"listPeople"}                       admins   judges + admins with names and emails
//   POST {action:"sendEmails", messages:[...]}       admins   send up to 15 emails per call
//
// Registrations are written ONLY here (guests cannot write to the table), which is what lets us
// hand out sequential entry numbers, enforce the deadline, and send the confirmation in one step.
//
// SMTP settings come from the function's environment variables:
//   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM
import nodemailer from 'nodemailer';

const DB = 'expo';
const MAX_PER_CALL = 15;
const MAX_PER_EMAIL = 5; // applications per contact email, per season
const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const TRACKS = ['Artificial Intelligence', 'Data Science', 'Business & Entrepreneurship', 'Game & Animation', 'Robotics',
    'Hardware & Electronics', 'Mobile & Web', 'Algorithms', 'Cyber Security', 'Software & Systems'];

export default async ({ req, res, log, error }) => {
    const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
    const project = process.env.APPWRITE_FUNCTION_PROJECT_ID;
    const key = req.headers['x-appwrite-key'];

    const api = async (path, method = 'GET', body) => {
        const r = await fetch(endpoint + path, {
            method, headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': project, 'X-Appwrite-Key': key },
            body: body ? JSON.stringify(body) : undefined
        });
        const out = await r.json().catch(() => ({}));
        if (!r.ok) { const e = new Error(out.message || 'Appwrite request failed (' + r.status + ')'); e.code = r.status; e.type = out.type; throw e; }
        return out;
    };
    const q = (o) => 'queries[]=' + encodeURIComponent(JSON.stringify(o));
    const rows = (t) => `/tablesdb/${DB}/tables/${t}/rows`;

    const smtpReady = () => !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
    const transport = () => nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT || 587) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    const currentSeason = async () => {
        const r = await api(rows('seasons') + '?' + q({ method: 'equal', attribute: 'isCurrent', values: [true] }) + '&' + q({ method: 'limit', values: [1] }));
        return r.rows[0] || null;
    };
    const settingsOf = async (seasonId) => { try { return await api(rows('settings') + '/' + seasonId); } catch (e) { return {}; } };

    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const toHtml = (text, eventName) => {
        const body = esc(text)
            .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#e4472b">$1</a>')
            .split(/\n{2,}/).map((p) => '<p style="margin:0 0 16px">' + p.replace(/\n/g, '<br>') + '</p>').join('');
        return '<div style="background:#faf7f1;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#16181d;font-size:16px;line-height:1.6">' +
            '<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:6px;padding:36px 36px 28px">' +
            '<div style="font-family:Georgia,serif;font-size:22px;font-weight:bold;margin-bottom:24px">Ignite<span style="color:#e4472b;font-style:italic">AI</span> Expo</div>' +
            body +
            '<div style="border-top:1px solid #e7e2d8;margin-top:24px;padding-top:16px;font-size:13px;color:#8b909b">' + esc(eventName || 'IgniteAI Expo') + ' · igniteaiexpo.org</div>' +
            '</div></div>';
    };
    const send = async (mailer, cfg, m, eventName) => mailer.sendMail({
        from: { name: cfg.fromName || 'IgniteAI Expo', address: process.env.SMTP_FROM },
        replyTo: cfg.replyTo || undefined,
        to: m.to, cc: m.cc || undefined, subject: m.subject, text: m.text, html: toHtml(m.text, eventName)
    });

    // ---------------------------------------------------------------- register
    const str = (v, max) => { v = (v == null ? '' : String(v)).trim(); return v ? v.slice(0, max) : null; };
    const gradeNum = (g) => (g === 'K' ? 0 : parseInt(g, 10));
    const divisionOf = (g) => { const n = gradeNum(g); return n <= 3 ? 'K-3' : n <= 6 ? '4-6' : n <= 8 ? '7-8' : '9-12'; };
    const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s || '');
    const isUrl = (s) => /^https?:\/\/\S+$/i.test(s || '');

    async function register(input) {
        const bad = (message) => ({ status: 400, body: { ok: false, message } });
        if (!input || typeof input !== 'object') return bad('Missing application data.');
        if (input.website) return { status: 200, body: { ok: true, entryNumber: 0 } }; // honeypot: pretend it worked

        const season = await currentSeason();
        if (!season) return { status: 503, body: { ok: false, message: 'Registration is not open yet.' } };
        if (season.registrationOpen === false) return { status: 403, body: { ok: false, closed: true, message: 'Registration is closed.' } };
        if (season.applyDeadline && Date.now() > Date.parse(season.applyDeadline)) return { status: 403, body: { ok: false, closed: true, message: 'The application deadline has passed.' } };

        const team = input.entryType === 'team';
        const names = team && Array.isArray(input.memberNames) ? input.memberNames : [];
        const grades = team && Array.isArray(input.memberGrades) ? input.memberGrades : [];
        const data = {
            season: season.$id,
            firstName: str(input.firstName, 80), lastName: str(input.lastName, 80), grade: str(input.grade, 3),
            school: str(input.school, 160), city: str(input.city, 120), country: str(input.country, 80),
            studentEmail: str(input.studentEmail, 160), parentName: str(input.parentName, 160), parentEmail: (str(input.parentEmail, 160) || '').toLowerCase() || null,
            parentPhone: str(input.parentPhone, 40), projectTitle: str(input.projectTitle, 200), track: str(input.track, 60),
            xField: str(input.xField, 120), entryType: team ? 'team' : 'individual', teamName: team ? str(input.teamName, 120) : null,
            memberNames: [], memberGrades: [], projectSummary: str(input.projectSummary, 5000),
            demoUrl: str(input.demoUrl, 500), codeUrl: str(input.codeUrl, 500), aiTools: str(input.aiTools, 500),
            agreedToRules: input.agreedToRules === true, parentApproved: input.parentApproved === true, status: 'new'
        };
        for (const k of ['firstName', 'lastName', 'school', 'city', 'country', 'parentName', 'projectTitle', 'projectSummary']) if (!data[k]) return bad('Please fill in every required field.');
        if (!GRADES.includes(data.grade)) return bad('Please choose a grade.');
        if (!TRACKS.includes(data.track)) return bad('Please choose a track.');
        if (!isEmail(data.parentEmail)) return bad('Please enter a valid contact email.');
        if (data.studentEmail && !isEmail(data.studentEmail)) return bad('The student email does not look right.');
        for (const k of ['demoUrl', 'codeUrl']) if (data[k] && !isUrl(data[k])) return bad('Links must start with https://');
        if (!data.agreedToRules || !data.parentApproved) return bad('Please confirm both agreement boxes.');
        if (team) {
            if (!data.teamName) return bad('Please enter a team name.');
            if (names.length < 1 || names.length > 4) return bad('A team has between 2 and 5 students.');
            for (let i = 0; i < names.length; i++) {
                const n = str(names[i], 160), g = str(grades[i], 3);
                if (!n || !GRADES.includes(g)) return bad('Every teammate needs a name and a grade.');
                data.memberNames.push(n); data.memberGrades.push(g);
            }
        }
        // a team competes in the division of its highest grade
        const top = [data.grade].concat(data.memberGrades).sort((a, b) => gradeNum(b) - gradeNum(a))[0];
        data.division = divisionOf(top);

        // One contact address can only hold a few entries per season. Without this, anyone could use the
        // form to flood a stranger's inbox with confirmation emails sent from our domain.
        const same = await api(rows('registrations') + '?' + q({ method: 'equal', attribute: 'season', values: [season.$id] }) + '&' +
            q({ method: 'equal', attribute: 'parentEmail', values: [data.parentEmail.toLowerCase()] }) + '&' + q({ method: 'limit', values: [1] }));
        if (same.total >= MAX_PER_EMAIL) return { status: 429, body: { ok: false, message: 'This email address already has ' + MAX_PER_EMAIL + ' applications. Please email us if you need to submit more.' } };

        // Take the next number atomically (safe when two families submit at the same moment).
        const counter = await api(rows('settings') + '/' + season.$id + '/nextEntryNumber/increment', 'PATCH', { value: 1 });
        data.entryNumber = counter.nextEntryNumber - 1;
        const row = await api(rows('registrations'), 'POST', { rowId: 'unique()', data });
        log(`registered #${data.entryNumber} (${season.$id}) ${row.$id}`);

        let emailed = false;
        if (smtpReady()) {
            try {
                const cfg = await settingsOf(season.$id);
                if (cfg.autoConfirmEmail !== false) {
                    const students = [`${data.firstName} ${data.lastName}`].concat(data.memberNames);
                    await send(transport(), cfg, {
                        to: data.parentEmail, cc: data.studentEmail || undefined,
                        subject: `Entry #${data.entryNumber}: we received your ${season.name} application`,
                        text: `Hello,\n\nThank you — we received the ${season.name} application for ${students.join(', ')}.\n\n` +
                            `Entry number: ${data.entryNumber}\nProject: ${data.projectTitle}\n` + (team ? `Team: ${data.teamName}\n` : '') +
                            `Track: ${data.track}\nDivision: Grade ${data.division.replace('-', '–')}\n\n` +
                            `Please keep your entry number — it is how we refer to your project from now on.\n\n` +
                            (cfg.interviewDate ? `Final interviews take place online on ${cfg.interviewDate}. We will email this address with the details.\n\n` : '') +
                            `Questions? Just reply to this email.\n\nThe IgniteAI Expo team`
                    }, season.name);
                    emailed = true;
                }
            } catch (e) { error('confirmation email failed for #' + data.entryNumber + ': ' + (e.message || e)); }
        }
        return { status: 200, body: { ok: true, entryNumber: data.entryNumber, season: season.$id, seasonName: season.name, firstName: data.firstName, emailed } };
    }

    try {
        const body = req.bodyJson || {};

        if (body.action === 'register') {
            const out = await register(body.data);
            return res.json(out.body, out.status);
        }

        // ---- Public: one certificate by id ----
        if (body.action === 'getCertificate') {
            if (!/^[A-Za-z0-9_.-]{8,36}$/.test(body.id || '')) return res.json({ ok: false, message: 'Invalid certificate id.' }, 400);
            try {
                const c = await api(rows('certificates') + '/' + body.id);
                return res.json({ ok: true, certificate: {
                    id: c.$id, eventName: c.eventName, recipientName: c.recipientName, kind: c.kind, awardText: c.awardText,
                    projectTitle: c.projectTitle, division: c.division, track: c.track,
                    issuedOn: c.issuedOn, signerName: c.signerName, signerTitle: c.signerTitle } });
            } catch (e) {
                return res.json({ ok: false, message: 'Certificate not found.' }, 404);
            }
        }

        // ---- Everything below is admins only ----
        const userId = req.headers['x-appwrite-user-id'];
        if (!userId) return res.json({ ok: false, message: 'Sign in required.' }, 401);
        const m = await api(`/teams/admins/memberships?` + q({ method: 'equal', attribute: 'userId', values: [userId] }));
        if (!(m.memberships || []).some((x) => x.userId === userId && x.confirm)) {
            return res.json({ ok: false, message: 'Admins only.' }, 403);
        }

        // Appwrite hides other members' ids/names/emails from browser sessions ("membership privacy"),
        // so admins get the people list from here instead.
        if (body.action === 'listPeople') {
            const pick = (r) => (r.memberships || []).map((x) => ({ $id: x.$id, userId: x.userId, userName: x.userName, userEmail: x.userEmail, confirm: x.confirm, roles: x.roles, invited: x.invited, joined: x.joined }));
            const lim = q({ method: 'limit', values: [200] });
            const [judges, admins] = await Promise.all([api('/teams/judges/memberships?' + lim), api('/teams/admins/memberships?' + lim)]);
            return res.json({ ok: true, judges: pick(judges), admins: pick(admins) });
        }

        if (body.action === 'emailStatus') {
            return res.json({ ok: true, configured: smtpReady(), from: process.env.SMTP_FROM || null });
        }

        if (body.action === 'sendEmails') {
            if (!smtpReady()) return res.json({ ok: false, message: 'Email is not configured yet. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM to the expo-api function settings in Appwrite.' }, 400);
            const messages = Array.isArray(body.messages) ? body.messages : [];
            if (!messages.length || messages.length > MAX_PER_CALL) return res.json({ ok: false, message: `Send between 1 and ${MAX_PER_CALL} messages per call.` }, 400);
            const cfg = await settingsOf(String(body.season || ''));
            const mailer = transport();
            const results = [];
            for (const msg of messages) {
                if (!msg || !msg.to || !msg.subject || !msg.text) { results.push({ to: msg && msg.to, ok: false, error: 'Missing to, subject or text' }); continue; }
                try { await send(mailer, cfg, msg, body.eventName); results.push({ to: msg.to, ok: true }); }
                catch (e) { results.push({ to: msg.to, ok: false, error: String(e.message || e).slice(0, 200) }); }
            }
            return res.json({ ok: true, results });
        }

        return res.json({ ok: false, message: 'Unknown action.' }, 400);
    } catch (e) {
        error(String(e && e.stack || e));
        return res.json({ ok: false, message: 'Something went wrong on our side. Please try again in a moment.' }, 500);
    }
};
