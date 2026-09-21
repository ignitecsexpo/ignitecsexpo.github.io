/* IgniteAI Expo — judge portal */
(function () {
    'use strict';

    var X = EXPO, CFG = X.CFG, T = CFG.T, $ = X.$, $$ = X.$$, esc = X.esc, Query = X.Query;
    var S = { me: null, seasons: [], season: null, projects: [], reviews: [] };
    var main = $('#main');
    var f = { scope: 'mine', division: '', track: '', q: '' };

    var CRITERIA = [
        ['scoreDemo', 'Live, working demo', 'Did it run live? Does it do what the student says it does?'],
        ['scoreUnderstanding', 'Understands how it works', 'Can the student explain how they built it, step by step, in their own words — including any AI tools they used?'],
        ['scoreUsefulness', 'Usefulness', 'Is there a real problem and a real use? Who would want this?'],
        ['scoreCreativity', 'Imagination', 'Originality and ambition for their grade. Did it make you say “wow”?']
    ];
    var RECS = [['award', 'Award contender'], ['strong', 'Strong'], ['solid', 'Solid'], ['developing', 'Still developing']];

    X.requireRole('judge').then(function (m) {
        S.me = m;
        $('#who').textContent = m.user.name || 'Judge';
        $('#who-email').textContent = m.user.email;
        $('#to-admin').hidden = !m.isAdmin;
        $('#signout').addEventListener('click', X.signOut);
        return X.loadSeasons();
    }).then(function (se) {
        S.seasons = se.list; S.season = se.active || {};
        var sel = $('#season');
        sel.innerHTML = S.seasons.map(function (x) { return '<option value="' + esc(x.$id) + '"' + (x.$id === S.season.$id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
        sel.onchange = function () { S.season = S.seasons.filter(function (x) { return x.$id === sel.value; })[0]; X.rememberSeason(S.season.$id); load().then(route, X.fail); };
        return load();
    }).then(function () {
        $('#loading').hidden = true; $('#shell').hidden = false;
        $$('#nav a').forEach(function (a) { a.addEventListener('click', function () { location.hash = a.getAttribute('data-tab'); }); });
        window.addEventListener('hashchange', route);
        route();
    }).catch(X.fail);

    function load() {
        return Promise.all([
            X.listAll(T.proj, X.inSeason(S.season.$id)),
            X.listAll(T.rev, X.inSeason(S.season.$id, [Query.equal('judgeId', S.me.user.$id)]))
        ]).then(function (r) {
            S.projects = r[0].filter(function (p) { return p.status !== 'rejected' && p.status !== 'withdrawn'; });
            S.reviews = r[1];
        });
    }
    function mine(p) { return (p.assignedJudges || []).indexOf(S.me.user.$id) > -1; }
    function reviewOf(p) { return S.reviews.filter(function (v) { return v.projectId === p.$id; })[0] || null; }
    function route() {
        var tab = (location.hash || '#projects').slice(1);
        $$('#nav a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-tab') === tab); });
        closeDrawer();
        (tab === 'rubric' ? rubric : list)();
    }

    function openDrawer(html) {
        $('#drawer-host').innerHTML = '<div class="drawer-bg"></div><aside class="drawer"><button class="x" aria-label="Close">×</button>' + html + '</aside>';
        $('.drawer-bg').addEventListener('click', closeDrawer);
        $('.drawer .x').addEventListener('click', closeDrawer);
        return $('.drawer');
    }
    function closeDrawer() { $('#drawer-host').innerHTML = ''; }

    // ---------------------------------------------------------------- list
    function list() {
        var assigned = S.projects.filter(mine);
        var done = assigned.filter(function (p) { var v = reviewOf(p); return v && v.submitted; }).length;
        $('#n-mine').textContent = assigned.length ? done + '/' + assigned.length : '';
        if (!assigned.length && f.scope === 'mine') f.scope = 'all';

        main.innerHTML = '<div class="p-head"><div><h1>Projects to review</h1><p>' + (assigned.length ? 'You have submitted <b>' + done + '</b> of <b>' + assigned.length + '</b> assigned reviews.' : 'Nothing has been assigned to you yet, so all projects are shown.') + ' Your scores and notes are visible only to you and the organizers.</p></div></div>' +
            '<div class="toolbar"><select id="f-scope"><option value="mine"' + (f.scope === 'mine' ? ' selected' : '') + '>Assigned to me</option><option value="all"' + (f.scope === 'all' ? ' selected' : '') + '>All projects</option></select>' +
            '<select id="f-div">' + X.opts(CFG.DIVISIONS, f.division, 'All divisions') + '</select><select id="f-track">' + X.opts(CFG.TRACKS, f.track, 'All tracks') + '</select>' +
            '<input type="search" id="f-q" placeholder="Search…" value="' + esc(f.q) + '"><span class="count" id="f-count"></span></div><div class="tbl-wrap" id="tbl"></div>';

        function draw() {
            var rows = S.projects.filter(function (p) {
                if (f.scope === 'mine' && !mine(p)) return false;
                if (f.division && p.division !== f.division) return false;
                if (f.track && p.track !== f.track) return false;
                if (f.q && ((p.entryNumber || '') + ' ' + p.title + ' ' + p.members + ' ' + (p.xField || '')).toLowerCase().indexOf(f.q.toLowerCase()) === -1) return false;
                return true;
            }).sort(function (a, b) { return (a.interviewTime || '~').localeCompare(b.interviewTime || '~') || (a.entryNumber || 0) - (b.entryNumber || 0); });
            $('#f-count').textContent = rows.length + ' project' + (rows.length === 1 ? '' : 's');
            $('#tbl').innerHTML = rows.length ? '<table class="tbl"><thead><tr><th>Entry</th><th>Project</th><th>Division</th><th>Track</th><th>Interview</th><th>My review</th><th class="num">My score</th></tr></thead><tbody>' + rows.map(function (p) {
                var v = reviewOf(p);
                return '<tr class="click" data-id="' + p.$id + '"><td class="num"><b>' + (p.entryNumber || '—') + '</b></td><td><b>' + esc(p.title) + '</b><small>' + esc(p.members) + '</small></td><td>' + esc(X.divLabel(p.division)) + '</td><td>' + esc(p.track) + '</td><td>' + esc(p.interviewTime || '—') + '</td>' +
                    '<td>' + (v ? (v.submitted ? '<span class="tag green">submitted</span>' : '<span class="tag gold">draft</span>') : '<span class="tag">not started</span>') + '</td><td class="num">' + (v && v.total != null ? v.total + ' / 40' : '—') + '</td></tr>';
            }).join('') + '</tbody></table>' : '<div class="empty">No projects match.</div>';
            $$('#tbl tr.click').forEach(function (tr) { tr.addEventListener('click', function () { open(S.projects.filter(function (p) { return p.$id === tr.getAttribute('data-id'); })[0]); }); });
        }
        draw();
        $('#f-scope').addEventListener('change', function () { f.scope = this.value; draw(); });
        $('#f-div').addEventListener('change', function () { f.division = this.value; draw(); });
        $('#f-track').addEventListener('change', function () { f.track = this.value; draw(); });
        $('#f-q').addEventListener('input', function () { f.q = this.value; draw(); });
    }

    // ---------------------------------------------------------------- review
    function open(p) {
        var v = reviewOf(p) || {};
        var link = function (u) { return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + '</a>' : '—'; };
        var d = openDrawer('<h2>' + esc(p.title) + '</h2><p class="sub">Entry #' + esc(p.entryNumber || '—') + ' · ' + esc(X.divLabel(p.division)) + ' · ' + esc(p.track) + (p.interviewTime ? ' · ' + esc(p.interviewTime) : '') + '</p>' +
            '<dl class="kv"><dt>Students</dt><dd>' + esc(p.members) + '</dd><dt>Entry</dt><dd>' + (p.entryType === 'team' ? 'Team of ' + (p.memberCount || '') + (p.teamName ? ' — “' + esc(p.teamName) + '”' : '') + '. Expect more from a larger team.' : 'Individual') + '</dd>' +
            '<dt>Their “X”</dt><dd>' + esc(p.xField || '—') + '</dd><dt>From</dt><dd>' + esc(p.country || '—') + '</dd><dt>Demo / video</dt><dd>' + link(p.demoUrl) + '</dd><dt>Code</dt><dd>' + link(p.codeUrl) + '</dd><dt>AI tools used</dt><dd>' + esc(p.aiTools || 'Not stated — ask.') + '</dd></dl>' +
            (p.summary ? '<div class="prose">' + esc(p.summary) + '</div>' : '<div class="note">No written summary was provided.</div>') +
            '<div class="sect">Your review</div>' +
            CRITERIA.map(function (c) {
                var val = v[c[0]] == null ? 5 : v[c[0]];
                return '<div class="score"><h4>' + c[1] + '</h4><output id="o-' + c[0] + '">' + val + '</output><input type="range" min="0" max="10" step="1" value="' + val + '" data-score="' + c[0] + '"><p>' + c[2] + '</p></div>';
            }).join('') +
            '<div class="total-line"><span>Total</span><span><b id="total">0</b> / 40</span></div>' +
            '<div class="f"><span class="lbl">Overall</span><div class="checks">' + RECS.map(function (r) { return '<label><input type="radio" name="rec" value="' + r[0] + '"' + (v.recommendation === r[0] ? ' checked' : '') + '> ' + r[1] + '</label>'; }).join('') + '</div></div>' +
            '<div class="f"><label>Feedback for the student</label><textarea id="v-comments" maxlength="4000" placeholder="What impressed you, and one or two things to try next. Organizers may share this with the family.">' + esc(v.comments) + '</textarea></div>' +
            '<div class="f"><label>Private note to the committee <i style="font-weight:400;color:var(--dim)">(never shared)</i></label><textarea id="v-private" maxlength="2000" style="min-height:80px" placeholder="Concerns about authorship, a conflict of interest, award thoughts…">' + esc(v.privateNotes) + '</textarea></div>' +
            '<div class="p-actions"><button class="pbtn primary" id="v-submit">' + (v.submitted ? 'Update submitted review' : 'Submit review') + '</button><button class="pbtn" id="v-draft">Save as draft</button></div>' +
            (v.$updatedAt ? '<p style="color:var(--muted);font-size:13px;margin-top:12px">Last saved ' + esc(X.fmtDate(v.$updatedAt)) + (v.submitted ? ' · submitted' : ' · draft') + '</p>' : ''));

        function total() { var t = 0; $$('[data-score]', d).forEach(function (r) { t += parseInt(r.value, 10); }); $('#total', d).textContent = t; return t; }
        $$('[data-score]', d).forEach(function (r) { r.addEventListener('input', function () { $('#o-' + r.getAttribute('data-score'), d).textContent = r.value; total(); }); });
        total();

        function save(submitted) {
            var rec = $('input[name="rec"]:checked', d);
            if (submitted && !rec) return X.toast('Choose an overall rating before submitting.', true);
            var data = { season: p.season, projectId: p.$id, judgeId: S.me.user.$id, judgeName: (S.me.user.name || S.me.user.email).slice(0, 120), total: total(), recommendation: rec ? rec.value : null,
                comments: $('#v-comments', d).value.trim() || null, privateNotes: $('#v-private', d).value.trim() || null, submitted: submitted };
            $$('[data-score]', d).forEach(function (r) { data[r.getAttribute('data-score')] = parseInt(r.value, 10); });
            var existing = reviewOf(p), uid = S.me.user.$id;
            var job = existing ? X.updateRow(T.rev, existing.$id, data)
                : X.createRow(T.rev, data, [X.Permission.read(X.Role.user(uid)), X.Permission.update(X.Role.user(uid))]);
            $('#v-submit', d).disabled = $('#v-draft', d).disabled = true;
            job.then(function (row) {
                if (existing) S.reviews[S.reviews.indexOf(existing)] = row; else S.reviews.push(row);
                X.toast(submitted ? 'Review submitted. Thank you!' : 'Draft saved.');
                closeDrawer(); list();
            }, function (e) { $('#v-submit', d).disabled = $('#v-draft', d).disabled = false; X.fail(e); });
        }
        $('#v-submit', d).addEventListener('click', function () { save(true); });
        $('#v-draft', d).addEventListener('click', function () { save(false); });
    }

    // ---------------------------------------------------------------- guide
    function rubric() {
        main.innerHTML = '<div class="p-head"><div><h1>Judging guide</h1><p>Four criteria, each scored 0–10, for a total out of 40. Judge every project against others in the same grade division.</p></div></div>' +
            '<div class="panel">' + CRITERIA.map(function (c, i) { return '<div class="score" style="grid-template-columns:1fr"><h4>' + (i + 1) + '. ' + c[1] + '</h4><p>' + c[2] + '</p></div>'; }).join('') + '</div>' +
            '<div class="grid2"><div class="panel"><h2>Scoring scale</h2><dl class="kv" style="margin:0"><dt>9 – 10</dt><dd>Exceptional for this grade level</dd><dt>7 – 8</dt><dd>Strong, with clear ownership</dd><dt>5 – 6</dt><dd>Solid, meets expectations</dd><dt>3 – 4</dt><dd>Partly working, or thinly understood</dd><dt>0 – 2</dt><dd>Not demonstrated</dd></dl></div>' +
            '<div class="panel"><h2>Things to keep in mind</h2><ul style="list-style:disc;padding-left:18px;color:var(--muted);font-size:14.5px"><li>AI tools are allowed. What counts is whether the student understands and can explain their own project.</li><li>Expect more from a team, in proportion to its size.</li><li>A project that follows a tutorial without adding anything of the student\'s own should score low on imagination.</li><li>If you know a student personally, say so in the private note and skip the review.</li><li>Your feedback may be shared with the family. Be specific and kind.</li></ul></div></div>';
    }
})();
