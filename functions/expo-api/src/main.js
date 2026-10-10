// IgniteAI Expo — server function.
//   POST {action:"register", data:{...}, late?}      anyone   submit an application -> entry number
//   POST {action:"checkLate", code}                  anyone   is this private late-entry code valid?
//   POST {action:"getCertificate", id}               anyone   one certificate, by its private id
//   POST {action:"judgeInfo", season?, code}         anyone   what the judge sign-up page shows
//   POST {action:"judgeSignup", season?, data, code} signed-in  save a judge profile; right code -> approved at once
//   POST {action:"judgeStatus"}                      signed-in  has my sign-up been approved?
//   POST {action:"judgeHome", season?}               judges   my contests, event info (Zoom, Discord), review counts
//   POST {action:"projectReviews", projectId}        judges   every judge's review of a project, once I have reviewed it
//   POST {action:"setJudgeStatus", id, status}       admins   approve / decline a sign-up
//   POST {action:"resetJudgePassword", userId}       admins   give a judge a new random password (returned once)
//   POST {action:"emailStatus"}                      admins   is SMTP configured?
//   POST {action:"listPeople"}                       admins   judges + admins with names and emails
//   POST {action:"sendEmails", messages:[...]}       admins   send up to 15 emails per call (each may carry PDF attachments)
//
// Registrations are written ONLY here (guests cannot write to the table), which is what lets us
// hand out sequential entry numbers, enforce the deadline, and send the confirmation in one step.
//
// SMTP settings come from the function's environment variables:
//   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM
import nodemailer from 'nodemailer';
import { randomInt } from 'node:crypto';

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
    // A judge invite link names its contest (season id); without one, the current season is meant.
    const seasonById = async (id) => {
        if (!id) return currentSeason();
        if (!/^[A-Za-z0-9_.-]{1,36}$/.test(String(id))) return null;
        try { return await api(rows('seasons') + '/' + id); } catch (e) { return null; }
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
    // Optional PDF attachments (certificates), sent from the admin portal as base64.
    const MAX_ATTACH = 6, MAX_ATTACH_BYTES = 4 * 1024 * 1024;
    const attachmentsOf = (m) => {
        const list = Array.isArray(m.attachments) ? m.attachments : [];
        if (list.length > MAX_ATTACH) throw new Error('At most ' + MAX_ATTACH + ' attachments per email.');
        return list.map((a) => {
            const filename = String((a && a.filename) || '').replace(/[\\/\r\n]/g, '_').slice(0, 150);
            const content = String((a && a.content) || '');
            if (!/\.pdf$/i.test(filename) || !/^[A-Za-z0-9+/=]+$/.test(content)) throw new Error('Attachments must be PDF files.');
            if (content.length * 0.75 > MAX_ATTACH_BYTES) throw new Error('An attachment is too large.');
            return { filename, content, encoding: 'base64', contentType: 'application/pdf' };
        });
    };
    const send = async (mailer, cfg, m, eventName) => mailer.sendMail({
        from: { name: cfg.fromName || 'IgniteAI Expo', address: process.env.SMTP_FROM },
        replyTo: cfg.replyTo || undefined,
        to: m.to, cc: m.cc || undefined, subject: m.subject, text: m.text, html: toHtml(m.text, eventName),
        attachments: attachmentsOf(m)
    });

    // ---------------------------------------------------------------- register
    const str = (v, max) => { v = (v == null ? '' : String(v)).trim(); return v ? v.slice(0, max) : null; };
    const gradeNum = (g) => (g === 'K' ? 0 : parseInt(g, 10));
    const divisionOf = (g) => { const n = gradeNum(g); return n <= 3 ? 'K-3' : n <= 6 ? '4-6' : n <= 8 ? '7-8' : '9-12'; };
    const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s || '');
    const isUrl = (s) => /^https?:\/\/\S+$/i.test(s || '');

    // One registration (an individual or a whole team) becomes one project, with the same row id,
    // so building it twice is harmless. Same mapping as projectDataFrom() in portal/admin.js.
    async function createProjectFor(r) {
        const people = [{ name: `${r.firstName || ''} ${r.lastName || ''}`.trim(), grade: r.grade }]
            .concat((r.memberNames || []).map((n, i) => ({ name: n, grade: (r.memberGrades || [])[i] || '' })).filter((x) => x.name));
        const data = {
            season: r.season, entryNumber: r.entryNumber || null, title: r.projectTitle, track: r.track, division: r.division,
            entryType: r.entryType, teamName: r.entryType === 'team' ? r.teamName : null,
            members: people.map((x) => `${x.name} (Gr ${x.grade})`).join(', ').slice(0, 800), memberCount: people.length,
            country: r.country, xField: r.xField || null, summary: r.projectSummary || null, demoUrl: r.demoUrl || null, codeUrl: r.codeUrl || null,
            aiTools: r.aiTools || null, status: 'submitted'
        };
        try { await api(rows('projects'), 'POST', { rowId: r.$id, data }); } catch (e) { if (e.code !== 409) throw e; }
        await api(rows('registrations') + '/' + r.$id, 'PATCH', { data: { projectId: r.$id } });
    }

    // A private link (register.html?late=<code>) lets organizers take an application after the
    // deadline, or while registration is switched off. The code lives in the admin-only settings row.
    const lateOk = (cfg, code) => !!cfg.lateRegistrationCode && String(code || '').trim() === cfg.lateRegistrationCode;

    async function register(input, late) {
        const bad = (message) => ({ status: 400, body: { ok: false, message } });
        if (!input || typeof input !== 'object') return bad('Missing application data.');
        if (input.website) return { status: 200, body: { ok: true, entryNumber: 0 } }; // honeypot: pretend it worked

        const season = await currentSeason();
        if (!season) return { status: 503, body: { ok: false, message: 'Registration is not open yet.' } };
        const isLate = !!late && lateOk(await settingsOf(season.$id), late);
        if (isLate) log('late entry accepted through the private link');
        else if (season.registrationOpen === false) return { status: 403, body: { ok: false, closed: true, message: 'Registration is closed.' } };
        else if (season.applyDeadline && Date.now() > Date.parse(season.applyDeadline)) return { status: 403, body: { ok: false, closed: true, message: 'The application deadline has passed.' } };

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
        // Judges work from the projects table, so every entry gets its project straight away.
        // (Admin → Projects → "Build projects" catches any that fail here.)
        try { await createProjectFor(row); } catch (e) { error('project for #' + data.entryNumber + ' failed: ' + (e.message || e)); }

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


    // ---------------------------------------------------------------- judges
    const DEFAULT_COMMITMENT = 'About 1–2 hours on Zoom, interviewing 6–8 student projects (5–10 minutes each) and scoring them in the judge portal.';
    const myJudgeRow = async (seasonId, userId) => {
        const r = await api(rows('judges') + '?' + q({ method: 'equal', attribute: 'season', values: [seasonId] }) + '&' + q({ method: 'equal', attribute: 'userId', values: [userId] }) + '&' + q({ method: 'limit', values: [1] }));
        return r.rows[0] || null;
    };
    const addToJudgesTeam = async (userId) => {
        const m = await api('/teams/judges/memberships?' + q({ method: 'equal', attribute: 'userId', values: [userId] }));
        if ((m.memberships || []).some((x) => x.userId === userId)) return;
        await api('/teams/judges/memberships', 'POST', { userId, roles: ['judge'] });
    };
    const welcomeJudge = async (season, cfg, row) => {
        if (!smtpReady()) return;
        try {
            const site = (cfg.siteUrl || 'https://igniteaiexpo.org').replace(/\/$/, '');
            await send(transport(), cfg, {
                to: row.email, subject: `You're confirmed as a judge for ${season.name}`,
                text: `Hello ${row.name.split(/\s+/)[0]},\n\nThank you for volunteering — you are confirmed as a judge for ${season.name}.\n\n` +
                    (cfg.interviewDate ? `When: ${cfg.interviewDate}\nWhere: Zoom (links will be sent before the event)\n\n` : '') +
                    `Your judge portal: ${site}/portal/\nSign in with the email and password you chose (or with Google, if you signed up that way). You will find every project in the contest there, the scoring form, the judging guide and the Zoom links.\n\n` +
                    (cfg.judgeDiscordUrl ? `Please join the judges' Discord group for updates and questions:\n${cfg.judgeDiscordUrl}\n\n` : '') +
                    `Questions? Just reply to this email.\n\nThe IgniteAI Expo team`
            }, season.name);
        } catch (e) { error('judge welcome email failed: ' + (e.message || e)); }
    };

    async function judgeSignup(userId, input, code, seasonId) {
        const bad = (message) => ({ status: 400, body: { ok: false, message } });
        const season = await seasonById(seasonId);
        if (!season) return { status: 503, body: { ok: false, message: 'Judge sign-up is not open yet.' } };
        const cfg = await settingsOf(season.$id);
        if (cfg.judgeSignupOpen === false) return { status: 403, body: { ok: false, message: 'Judge sign-up is closed for ' + season.name + '.' } };
        const user = await api('/users/' + userId);
        input = input || {};
        const list = (v, allowed, max) => (Array.isArray(v) ? v : []).filter((x) => allowed.includes(x)).slice(0, max);
        const data = {
            season: season.$id, userId, name: str(input.name, 120) || user.name, email: user.email, phone: str(input.phone, 40),
            affiliation: str(input.affiliation, 160), role: str(input.role, 60), background: str(input.background, 1500),
            tracks: list(input.tracks, TRACKS, 10), divisions: list(input.divisions, ['K-3', '4-6', '7-8', '9-12'], 4),
            conflicts: str(input.conflicts, 600), agreed: input.agreed === true
        };
        if (!data.name || !data.affiliation) return bad('Please fill in your name and affiliation.');
        if (!data.agreed) return bad('Please confirm you can take part.');

        const existing = await myJudgeRow(season.$id, userId);
        const approved = (existing && existing.status === 'approved') || (!!cfg.judgeSignupCode && String(code || '').trim() === cfg.judgeSignupCode);
        data.status = approved ? 'approved' : (existing ? existing.status : 'pending');
        const row = existing ? await api(rows('judges') + '/' + existing.$id, 'PATCH', { data }) : await api(rows('judges'), 'POST', { rowId: 'unique()', data });
        if (data.name && data.name !== user.name) { try { await api('/users/' + userId + '/name', 'PATCH', { name: data.name }); } catch (e) { /* cosmetic */ } }
        if (approved) {
            await addToJudgesTeam(userId);
            if (!existing || existing.status !== 'approved') await welcomeJudge(season, cfg, row);
        }
        log(`judge sign-up ${row.$id} ${data.status}`);
        return { status: 200, body: { ok: true, status: data.status, season: season.$id, seasonName: season.name, discordUrl: approved ? (cfg.judgeDiscordUrl || null) : null } };
    }

    const inTeam = async (team, userId) => {
        const m = await api(`/teams/${team}/memberships?` + q({ method: 'equal', attribute: 'userId', values: [userId] }));
        return (m.memberships || []).some((x) => x.userId === userId && x.confirm);
    };
    const listAllRows = async (table, queries) => {
        let out = [], cursor = null;
        for (;;) {
            const qs = queries.concat([q({ method: 'limit', values: [100] })]);
            if (cursor) qs.push(q({ method: 'cursorAfter', values: [cursor] }));
            const r = await api(rows(table) + '?' + qs.join('&'));
            out = out.concat(r.rows);
            if (r.rows.length < 100) return out;
            cursor = r.rows[r.rows.length - 1].$id;
        }
    };
    // Which contests (seasons) may this person judge? Admins: all of them. Judges: every season they
    // were approved for through the sign-up page. Someone an admin invited straight into the judges
    // team has no approved sign-up, so they get the current season.
    const judgeAccess = async (userId) => {
        const [isAdmin, isJudge] = await Promise.all([inTeam('admins', userId), inTeam('judges', userId)]);
        if (!isAdmin && !isJudge) return null;
        const seasons = await listAllRows('seasons', [q({ method: 'orderDesc', attribute: 'year' })]);
        if (isAdmin) return { isAdmin, seasons };
        const mine = await listAllRows('judges', [q({ method: 'equal', attribute: 'userId', values: [userId] })]);
        const ok = mine.filter((j) => j.status === 'approved').map((j) => j.season);
        const list = ok.length ? seasons.filter((x) => ok.includes(x.$id)) : seasons.filter((x) => x.isCurrent);
        return { isAdmin, seasons: list };
    };
    const reviewView = (v) => ({ $id: v.$id, judgeId: v.judgeId, judgeName: v.judgeName, scoreTechnical: v.scoreTechnical, scoreIdea: v.scoreIdea,
        scorePresentation: v.scorePresentation, total: v.total, comments: v.comments, privateNotes: v.privateNotes, updatedAt: v.$updatedAt });

    async function judgeHome(userId, seasonId) {
        const acc = await judgeAccess(userId);
        if (!acc) return { status: 403, body: { ok: false, message: 'This account is not a judge.' } };
        const contests = acc.seasons.map((x) => ({ id: x.$id, name: x.name, year: x.year, isCurrent: !!x.isCurrent }));
        const season = acc.seasons.find((x) => x.$id === seasonId) || acc.seasons.find((x) => x.isCurrent) || acc.seasons[0];
        if (!season) return { status: 200, body: { ok: true, isAdmin: acc.isAdmin, contests: [], season: null } };
        const cfg = await settingsOf(season.$id);
        const reviews = await listAllRows('reviews', [q({ method: 'equal', attribute: 'season', values: [season.$id] }), q({ method: 'equal', attribute: 'submitted', values: [true] }),
            q({ method: 'select', values: ['projectId', 'judgeId'] })]);
        const counts = {};
        for (const v of reviews) counts[v.projectId] = (counts[v.projectId] || 0) + 1;
        return { status: 200, body: { ok: true, isAdmin: acc.isAdmin, contests, season: season.$id, counts, info: {
            name: season.name, interviewDate: cfg.interviewDate || null, judgeZoomUrl: cfg.judgeZoomUrl || null, discordUrl: cfg.judgeDiscordUrl || null,
            notes: cfg.judgeNotes || null, contactEmail: cfg.replyTo || null,
            rooms: [['K-3', cfg.zoomK3], ['4-6', cfg.zoom46], ['7-8', cfg.zoom78], ['9-12', cfg.zoom912]].filter((r) => r[1]).map((r) => ({ division: r[0], url: r[1] }))
        } } };
    }

    // Other judges' reviews stay hidden until you have submitted your own, so nobody is anchored by them.
    async function projectReviews(userId, projectId) {
        if (!/^[A-Za-z0-9_.-]{1,36}$/.test(String(projectId || ''))) return { status: 400, body: { ok: false, message: 'Bad project id.' } };
        const acc = await judgeAccess(userId);
        if (!acc) return { status: 403, body: { ok: false, message: 'This account is not a judge.' } };
        let p;
        try { p = await api(rows('projects') + '/' + projectId); } catch (e) { return { status: 404, body: { ok: false, message: 'Project not found.' } }; }
        if (!acc.seasons.some((x) => x.$id === p.season)) return { status: 403, body: { ok: false, message: 'You are not judging this contest.' } };
        const all = (await listAllRows('reviews', [q({ method: 'equal', attribute: 'projectId', values: [p.$id] })])).filter((v) => v.submitted);
        const mineDone = all.some((v) => v.judgeId === userId);
        if (!mineDone && !acc.isAdmin) return { status: 200, body: { ok: true, locked: true, count: all.length } };
        return { status: 200, body: { ok: true, locked: false, count: all.length, reviews: all.filter((v) => v.judgeId !== userId).map(reviewView) } };
    }

    try {
        const body = req.bodyJson || {};

        if (body.action === 'register') {
            const out = await register(body.data, body.late);
            return res.json(out.body, out.status);
        }
        if (body.action === 'checkLate') {
            const season = await currentSeason();
            return res.json({ ok: true, valid: !!season && lateOk(await settingsOf(season.$id), body.code) });
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

        // ---- Public: what the judge sign-up page shows (no private links in here) ----
        if (body.action === 'judgeInfo') {
            const season = await seasonById(body.season);
            if (!season) return res.json({ ok: true, open: false, unknown: !!body.season });
            const cfg = await settingsOf(season.$id);
            return res.json({ ok: true, open: cfg.judgeSignupOpen !== false, season: season.$id, seasonName: season.name, interviewDate: cfg.interviewDate || null,
                commitment: cfg.judgeCommitment || DEFAULT_COMMITMENT, codeValid: !!cfg.judgeSignupCode && String(body.code || '').trim() === cfg.judgeSignupCode });
        }

        // ---- Signed-in (any account): judge sign-up ----
        if (['judgeSignup', 'judgeStatus', 'judgeHome', 'projectReviews'].includes(body.action)) {
            const uid = req.headers['x-appwrite-user-id'];
            if (!uid) return res.json({ ok: false, message: 'Please sign in first.' }, 401);
            let out;
            if (body.action === 'judgeSignup') out = await judgeSignup(uid, body.data, body.code, body.season);
            else if (body.action === 'judgeHome') out = await judgeHome(uid, body.season);
            else if (body.action === 'projectReviews') out = await projectReviews(uid, body.projectId);
            if (out) return res.json(out.body, out.status);
            // judgeStatus: the most recent sign-up, in any contest
            const mine = await listAllRows('judges', [q({ method: 'equal', attribute: 'userId', values: [uid] }), q({ method: 'orderDesc', attribute: '$createdAt' })]);
            const row = mine.find((j) => j.status === 'approved') || mine[0] || null;
            return res.json({ ok: true, status: row ? row.status : null });
        }

        // ---- Everything below is admins only ----
        const userId = req.headers['x-appwrite-user-id'];
        if (!userId) return res.json({ ok: false, message: 'Sign in required.' }, 401);
        if (!(await inTeam('admins', userId))) return res.json({ ok: false, message: 'Admins only.' }, 403);

        // Appwrite hides other members' ids/names/emails from browser sessions ("membership privacy"),
        // so admins get the people list from here instead.
        if (body.action === 'listPeople') {
            const pick = (r) => (r.memberships || []).map((x) => ({ $id: x.$id, userId: x.userId, userName: x.userName, userEmail: x.userEmail, confirm: x.confirm, roles: x.roles, invited: x.invited, joined: x.joined }));
            const lim = q({ method: 'limit', values: [200] });
            const [judges, admins] = await Promise.all([api('/teams/judges/memberships?' + lim), api('/teams/admins/memberships?' + lim)]);
            return res.json({ ok: true, judges: pick(judges), admins: pick(admins) });
        }

        if (body.action === 'setJudgeStatus') {
            if (!['approved', 'declined', 'pending'].includes(body.status)) return res.json({ ok: false, message: 'Bad status.' }, 400);
            const row = await api(rows('judges') + '/' + String(body.id || ''));
            const updated = await api(rows('judges') + '/' + row.$id, 'PATCH', { data: { status: body.status } });
            if (body.status === 'approved') {
                await addToJudgesTeam(row.userId);
                if (row.status !== 'approved') { const season = await api(rows('seasons') + '/' + row.season); await welcomeJudge(season, await settingsOf(row.season), row); }
            } else {
                // losing approval also removes portal access, unless they are still approved for another contest
                const others = await listAllRows('judges', [q({ method: 'equal', attribute: 'userId', values: [row.userId] }), q({ method: 'equal', attribute: 'status', values: ['approved'] })]);
                if (others.some((j) => j.$id !== row.$id)) return res.json({ ok: true, row: updated });
                const m = await api('/teams/judges/memberships?' + q({ method: 'equal', attribute: 'userId', values: [row.userId] }));
                for (const x of (m.memberships || [])) if (x.userId === row.userId && !(x.roles || []).includes('owner')) await api('/teams/judges/memberships/' + x.$id, 'DELETE');
            }
            return res.json({ ok: true, row: updated });
        }

        // Admins can't set another person's password from the browser, so it happens here. Judges only:
        // an admin's account (which can see every family's contact details) is never reset this way.
        if (body.action === 'resetJudgePassword') {
            const target = String(body.userId || '');
            if (!/^[A-Za-z0-9_.-]{1,36}$/.test(target)) return res.json({ ok: false, message: 'Bad user id.' }, 400);
            if (!(await inTeam('judges', target))) return res.json({ ok: false, message: 'That account is not a judge.' }, 400);
            if (await inTeam('admins', target)) return res.json({ ok: false, message: 'Organizer passwords can only be reset by their owner, with “Forgot password” on the sign-in page.' }, 403);
            const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/l/I)
            const part = () => Array.from({ length: 4 }, () => abc[randomInt(abc.length)]).join('');
            const password = `${part()}-${part()}-${part()}`;
            await api('/users/' + target + '/password', 'PATCH', { password });
            const u = await api('/users/' + target);
            log(`password reset for judge ${target} by admin ${userId}`);
            return res.json({ ok: true, name: u.name, email: u.email, password });
        }

        if (body.action === 'emailStatus') {
            return res.json({ ok: true, configured: smtpReady(), from: process.env.SMTP_FROM || null, attachments: true });
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
                try { await send(mailer, cfg, msg, body.eventName); results.push({ to: msg.to, ok: true, attached: (msg.attachments || []).length }); }
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
