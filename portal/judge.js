/* IgniteAI Expo — judge portal */
(function () {
    'use strict';

    var X = EXPO, CFG = X.CFG, T = CFG.T, $ = X.$, $$ = X.$$, esc = X.esc, Query = X.Query;
    var CRITERIA = CFG.CRITERIA, MAX = CFG.SCORE_MAX;
    // home = what the expo-api function tells us: my contests, event info (Zoom, Discord), review counts per project
    var S = { me: null, home: null, season: null, projects: [], reviews: [], counts: {} };
    var main = $('#main');
    var f = { scope: 'all', division: '', track: '', q: '' };

    X.requireRole('judge').then(function (m) {
        S.me = m;
        $('#who').textContent = m.user.name || 'Judge';
        $('#who-email').textContent = m.user.email;
        $('#to-admin').hidden = !m.isAdmin;
        $('#signout').addEventListener('click', X.signOut);
        var saved = null;
        try { saved = localStorage.getItem('expoJudgeContest'); } catch (e) { /* ignore */ }
        return loadContest(saved);
    }).then(function () {
        $('#loading').hidden = true; $('#shell').hidden = false;
        $$('#nav a').forEach(function (a) { a.addEventListener('click', function () { location.hash = a.getAttribute('data-tab'); }); });
        window.addEventListener('hashchange', function () { closeDrawer(); route(); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeDrawer();
            if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $('#f-q')) { e.preventDefault(); $('#f-q').focus(); }
        });
        route();
    }).catch(X.fail);

    function loadContest(seasonId) {
        return X.callFn({ action: 'judgeHome', season: seasonId || undefined }).then(function (h) {
            if (!h.ok) throw new Error(h.message || 'Could not load your contests.');
            S.home = h; S.season = h.season; S.counts = h.counts || {};
            drawContestPicker();
            if (!S.season) { S.projects = []; S.reviews = []; return; }
            try { localStorage.setItem('expoJudgeContest', S.season); } catch (e) { /* ignore */ }
            return Promise.all([
                X.listAll(T.proj, X.inSeason(S.season)),
                X.listAll(T.rev, X.inSeason(S.season, [Query.equal('judgeId', S.me.user.$id)]))
            ]).then(function (r) {
                S.projects = r[0].filter(function (p) { return p.status !== 'rejected' && p.status !== 'withdrawn'; });
                S.reviews = r[1];
            });
        });
    }
    function drawContestPicker() {
        var sel = $('#season'), list = S.home.contests || [];
        sel.innerHTML = list.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === S.season ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
        sel.disabled = list.length < 2;
        sel.onchange = function () { closeDrawer(); loadContest(sel.value).then(route, X.fail); };
    }

    // ---------------------------------------------------------------- helpers
    function info() { return (S.home && S.home.info) || {}; }
    function mine(p) { return (p.assignedJudges || []).indexOf(S.me.user.$id) > -1; }
    function reviewOf(p) { return S.reviews.filter(function (v) { return v.projectId === p.$id; })[0] || null; }
    function done(p) { var v = reviewOf(p); return !!(v && v.submitted); }
    function byId(id) { return S.projects.filter(function (p) { return p.$id === id; })[0]; }
    function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
    function extLink(u, label) { u = safeUrl(u); return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(label || u) + '</a>' : '—'; }
    function scoreText(v) { return v && v.total != null && v.scoreTechnical != null ? v.total + ' / ' + MAX : '—'; }
    function others(p) { var n = S.counts[p.$id] || 0; return done(p) ? n - 1 : n; }

    function counts() {
        $('#n-all').textContent = S.projects.length || '';
        $('#n-mine').textContent = S.projects.filter(done).length || '';
    }
    function route() {
        var tab = (location.hash || '#projects').slice(1);
        $$('#nav a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-tab') === tab); });
        counts();
        if (!S.season) {
            main.innerHTML = '<div class="p-head"><div><h1>No contest yet</h1><p>Your judge account is not linked to a contest yet. Use the invite link the organizers sent you, or email <a href="mailto:hello@mail.igniteaiexpo.org" style="text-decoration:underline">hello@mail.igniteaiexpo.org</a>.</p></div></div>';
            return;
        }
        ({ mine: myReviews, info: eventInfo, rubric: rubric }[tab] || list)();
    }

    function openDrawer(html) {
        $('#drawer-host').innerHTML = '<div class="drawer-bg"></div><aside class="drawer"><button class="x" aria-label="Close">×</button>' + html + '</aside>';
        $('.drawer-bg').addEventListener('click', closeDrawer);
        $('.drawer .x').addEventListener('click', closeDrawer);
        return $('.drawer');
    }
    function closeDrawer() { $('#drawer-host').innerHTML = ''; }

    // A search box that understands entry numbers ("1023", "#1023") and words from the title or student names.
    function searchHit(p, q) {
        q = q.trim().toLowerCase().replace(/^#/, '');
        if (!q) return 1;
        var num = String(p.entryNumber || '');
        if (/^\d+$/.test(q)) { if (num === q) return 3; if (num.indexOf(q) === 0) return 2; }
        var hay = [num, p.title, p.members, p.teamName, p.xField, p.track].join(' ').toLowerCase();
        return q.split(/\s+/).every(function (w) { return hay.indexOf(w) > -1; }) ? 1 : 0;
    }

    function eventStrip() {
        var i = info(), zoom = safeUrl(i.judgeZoomUrl), discord = safeUrl(i.discordUrl);
        if (!i.interviewDate && !zoom && !discord) return '';
        return '<div class="j-event"><div class="when">' + esc(i.name || '') + (i.interviewDate ? '<small>' + esc(i.interviewDate) + '</small>' : '') + '</div>' +
            (zoom ? '<a class="pbtn primary sm" href="' + esc(zoom) + '" target="_blank" rel="noopener">Join judges\' Zoom</a>' : '') +
            (discord ? '<a class="pbtn sm" href="' + esc(discord) + '" target="_blank" rel="noopener">Open Discord</a>' : '') +
            '<a class="pbtn sm" href="#info">All links</a></div>';
    }

    // ---------------------------------------------------------------- projects
    function list() {
        var anyAssigned = S.projects.some(mine);
        if (f.scope === 'assigned' && !anyAssigned) f.scope = 'all';
        var nDone = S.projects.filter(done).length;
        var scopes = [['all', 'All', S.projects.length]].concat(anyAssigned ? [['assigned', 'Assigned to me', S.projects.filter(mine).length]] : [])
            .concat([['todo', 'Not reviewed by me', S.projects.length - nDone], ['done', 'Reviewed by me', nDone]]);

        main.innerHTML = eventStrip() +
            '<div class="p-head"><div><h1>Projects</h1><p>' + S.projects.length + ' projects in ' + esc(info().name || 'this contest') + '. You have reviewed <b>' + nDone + '</b>. Click a project to read it and leave your scores and comments.</p></div></div>' +
            '<div class="j-search"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>' +
            '<input type="search" id="f-q" placeholder="Search by project name, student or entry # (press / to jump here)" value="' + esc(f.q) + '" autocomplete="off"></div>' +
            '<div class="toolbar"><div class="seg" id="f-scope">' + scopes.map(function (s) { return '<button data-scope="' + s[0] + '"' + (f.scope === s[0] ? ' class="on"' : '') + '>' + s[1] + '<b>' + s[2] + '</b></button>'; }).join('') + '</div>' +
            '<select id="f-div">' + X.opts(CFG.DIVISIONS, f.division, 'All divisions') + '</select><select id="f-track">' + X.opts(CFG.TRACKS, f.track, 'All tracks') + '</select>' +
            '<span class="count" id="f-count"></span></div><div class="tbl-wrap" id="tbl"></div>';

        var rows = [];
        function draw() {
            rows = S.projects.map(function (p) { return { p: p, hit: searchHit(p, f.q) }; }).filter(function (x) {
                var p = x.p;
                if (!x.hit) return false;
                if (f.scope === 'assigned' && !mine(p)) return false;
                if (f.scope === 'todo' && done(p)) return false;
                if (f.scope === 'done' && !done(p)) return false;
                if (f.division && p.division !== f.division) return false;
                if (f.track && p.track !== f.track) return false;
                return true;
            }).sort(function (a, b) { return b.hit - a.hit || (a.p.entryNumber || 0) - (b.p.entryNumber || 0); }).map(function (x) { return x.p; });
            $('#f-count').textContent = rows.length + ' project' + (rows.length === 1 ? '' : 's');
            $('#tbl').innerHTML = rows.length ? '<table class="tbl"><thead><tr><th>Entry</th><th>Project</th><th>Division</th><th>Track</th><th>Reviews</th><th>My review</th><th class="num">My score</th></tr></thead><tbody>' + rows.map(function (p) {
                var v = reviewOf(p), n = S.counts[p.$id] || 0;
                return '<tr class="click" data-id="' + p.$id + '"><td class="num"><b>' + esc(p.entryNumber || '—') + '</b></td><td><b>' + esc(p.title) + '</b>' + (mine(p) ? ' <span class="tag blue">assigned to you</span>' : '') + '<small>' + esc(p.members) + '</small></td>' +
                    '<td>' + esc(X.divLabel(p.division)) + '</td><td>' + esc(p.track) + '</td>' +
                    '<td>' + (n ? '<span class="tag green">' + n + ' judge' + (n === 1 ? '' : 's') + '</span>' : '<span class="tag red">none yet</span>') + '</td>' +
                    '<td>' + (v && v.submitted ? '<span class="tag green">✓ reviewed</span>' : v ? '<span class="tag gold">draft</span>' : '<span class="tag">not yet</span>') + '</td>' +
                    '<td class="num">' + (v && v.submitted ? '<b>' + scoreText(v) + '</b>' : '—') + '</td></tr>';
            }).join('') + '</tbody></table>' : '<div class="empty">' + (f.q ? 'No project matches “' + esc(f.q) + '”.' : 'No projects here.') + '</div>';
            $$('#tbl tr.click').forEach(function (tr) { tr.addEventListener('click', function () { open(byId(tr.getAttribute('data-id'))); }); });
        }
        draw();
        $$('#f-scope button').forEach(function (b) { b.addEventListener('click', function () { f.scope = b.getAttribute('data-scope'); $$('#f-scope button').forEach(function (x) { x.classList.toggle('on', x === b); }); draw(); }); });
        $('#f-div').addEventListener('change', function () { f.division = this.value; draw(); });
        $('#f-track').addEventListener('change', function () { f.track = this.value; draw(); });
        $('#f-q').addEventListener('input', function () { f.q = this.value; draw(); });
        $('#f-q').addEventListener('keydown', function (e) { if (e.key === 'Enter' && rows.length) open(rows[0]); });
    }

    // ---------------------------------------------------------------- my reviews
    function myReviews() {
        var list = S.projects.filter(function (p) { return reviewOf(p); }).sort(function (a, b) { return reviewOf(b).$updatedAt.localeCompare(reviewOf(a).$updatedAt); });
        main.innerHTML = '<div class="p-head"><div><h1>My reviews</h1><p>Every project you have scored in ' + esc(info().name || 'this contest') + ', newest first. Click one to change it — you can edit a review at any time.</p></div></div>' +
            '<div class="tbl-wrap">' + (list.length ? '<table class="tbl"><thead><tr><th>Entry</th><th>Project</th>' + CRITERIA.map(function (c) { return '<th class="num">' + esc(c[1].split(' ')[0]) + '</th>'; }).join('') + '<th class="num">Total</th><th>Comment to students</th><th>Saved</th></tr></thead><tbody>' +
                list.map(function (p) {
                    var v = reviewOf(p);
                    return '<tr class="click" data-id="' + p.$id + '"><td class="num"><b>' + esc(p.entryNumber || '—') + '</b></td><td><b>' + esc(p.title) + '</b><small>' + esc(X.divLabel(p.division)) + ' · ' + esc(p.track) + '</small></td>' +
                        CRITERIA.map(function (c) { return '<td class="num">' + (v[c[0]] == null ? '—' : v[c[0]]) + '</td>'; }).join('') +
                        '<td class="num"><b>' + scoreText(v) + '</b></td><td style="max-width:340px">' + esc((v.comments || '').slice(0, 140)) + ((v.comments || '').length > 140 ? '…' : '') + (v.submitted ? '' : ' <span class="tag gold">draft</span>') + '</td><td><small>' + esc(X.fmtDate(v.$updatedAt)) + '</small></td></tr>';
                }).join('') + '</tbody></table>' : '<div class="empty">You have not reviewed any projects yet. <a href="#projects" style="text-decoration:underline">Browse the projects</a>.</div>') + '</div>';
        $$('tr.click').forEach(function (tr) { tr.addEventListener('click', function () { open(byId(tr.getAttribute('data-id'))); }); });
    }

    // ---------------------------------------------------------------- review drawer
    function open(p) {
        if (!p) return;
        var v = reviewOf(p) || {};
        var picked = {};
        CRITERIA.forEach(function (c) { picked[c[0]] = v[c[0]] == null ? null : v[c[0]]; });

        var d = openDrawer('<h2>' + esc(p.title) + '</h2><p class="sub">Entry #' + esc(p.entryNumber || '—') + ' · ' + esc(X.divLabel(p.division)) + ' · ' + esc(p.track) + (p.interviewTime ? ' · ' + esc(p.interviewTime) : '') + '</p>' +
            '<dl class="kv"><dt>Students</dt><dd>' + esc(p.members || '—') + '</dd><dt>Entry</dt><dd>' + (p.entryType === 'team' ? 'Team of ' + esc(p.memberCount || '') + (p.teamName ? ' — “' + esc(p.teamName) + '”' : '') + '. Expect more from a larger team.' : 'Individual') + '</dd>' +
            '<dt>Their “X”</dt><dd>' + esc(p.xField || '—') + '</dd><dt>From</dt><dd>' + esc(p.country || '—') + '</dd>' +
            (p.demoUrl ? '<dt>Demo / video</dt><dd>' + extLink(p.demoUrl) + '</dd>' : '') + (p.codeUrl ? '<dt>Code</dt><dd>' + extLink(p.codeUrl) + '</dd>' : '') + (p.aiTools ? '<dt>AI tools used</dt><dd>' + esc(p.aiTools) + '</dd>' : '') + '</dl>' +
            (p.summary ? '<div class="prose">' + esc(p.summary) + '</div>' : '<div class="note">No written summary was provided.</div>') +

            '<div class="sect">Your review' + (v.submitted ? ' <span class="tag green" style="letter-spacing:.04em">saved</span>' : '') + '</div>' +
            CRITERIA.map(function (c) {
                return '<div class="score" data-crit="' + c[0] + '"><h4>' + esc(c[1]) + '</h4><output>' + (picked[c[0]] || '–') + '</output><p>' + esc(c[2]) + '</p>' +
                    '<div class="pick">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return '<button type="button" data-n="' + n + '"' + (picked[c[0]] === n ? ' class="on"' : '') + '>' + n + '</button>'; }).join('') + '</div></div>';
            }).join('') +
            '<div class="total-line"><span>Total</span><span><b id="total">–</b> / ' + MAX + '</span></div>' +
            '<div class="f"><label for="v-comments">Comment to the students <i style="font-weight:400;color:var(--dim)">(shared with the family)</i></label><textarea id="v-comments" maxlength="4000" placeholder="Start with what impressed you. Then one or two ideas they could try next. Keep it warm and specific — this may be the first real feedback they have ever had on their work.">' + esc(v.comments) + '</textarea></div>' +
            '<div class="f"><label for="v-private">Private comment <i style="font-weight:400;color:var(--dim)">(judges and organizers only — never shown to students)</i></label><textarea id="v-private" maxlength="2000" style="min-height:80px" placeholder="Award thoughts, how it compares to others, concerns about authorship, a conflict of interest…">' + esc(v.privateNotes) + '</textarea></div>' +
            '<div class="p-actions"><button class="pbtn primary" id="v-save">' + (v.submitted ? 'Update my review' : 'Submit review') + '</button><button class="pbtn" id="v-cancel">Close</button></div>' +
            (v.$updatedAt ? '<p style="color:var(--muted);font-size:13px;margin-top:12px">Last saved ' + esc(X.fmtDate(v.$updatedAt)) + '</p>' : '') +

            '<div class="sect">Other judges</div><div id="others"><div class="lock">Loading…</div></div>');

        function total() {
            var t = 0, all = true;
            CRITERIA.forEach(function (c) { if (picked[c[0]] == null) all = false; else t += picked[c[0]]; });
            $('#total', d).textContent = all ? t : '–';
            return all ? t : null;
        }
        total();
        $$('.score', d).forEach(function (box) {
            var key = box.getAttribute('data-crit');
            $$('.pick button', box).forEach(function (b) {
                b.addEventListener('click', function () {
                    picked[key] = parseInt(b.getAttribute('data-n'), 10);
                    $$('.pick button', box).forEach(function (x) { x.classList.toggle('on', x === b); });
                    $('output', box).textContent = picked[key];
                    box.classList.remove('missing');
                    total();
                });
            });
        });
        $('#v-cancel', d).addEventListener('click', closeDrawer);
        $('#v-save', d).addEventListener('click', function () {
            var missing = CRITERIA.filter(function (c) { return picked[c[0]] == null; });
            missing.forEach(function (c) { $('[data-crit="' + c[0] + '"]', d).classList.add('missing'); });
            if (missing.length) return X.toast('Give a score from 1 to 10 for ' + missing.map(function (c) { return c[1].toLowerCase(); }).join(' and ') + '.', true);
            var pub = $('#v-comments', d).value.trim();
            if (!pub) { $('#v-comments', d).focus(); return X.toast('Please write a short comment to the students.', true); }
            var data = { season: p.season, projectId: p.$id, judgeId: S.me.user.$id, judgeName: (S.me.user.name || S.me.user.email).slice(0, 120), total: total(),
                comments: pub, privateNotes: $('#v-private', d).value.trim() || null, submitted: true };
            CRITERIA.forEach(function (c) { data[c[0]] = picked[c[0]]; });
            var existing = reviewOf(p), uid = S.me.user.$id, wasDone = done(p);
            var job = existing ? X.updateRow(T.rev, existing.$id, data)
                : X.createRow(T.rev, data, [X.Permission.read(X.Role.user(uid)), X.Permission.update(X.Role.user(uid))]);
            $('#v-save', d).disabled = true;
            job.then(function (row) {
                if (existing) S.reviews[S.reviews.indexOf(existing)] = row; else S.reviews.push(row);
                if (!wasDone) S.counts[p.$id] = (S.counts[p.$id] || 0) + 1;
                X.toast(wasDone ? 'Review updated.' : 'Review submitted. Thank you!');
                route();
                open(p); // reopen: other judges' reviews are now unlocked
            }, function (e) {
                $('#v-save', d).disabled = false;
                // Saved from another tab or device a moment ago: pick that up instead of failing.
                if (e.code === 409) return loadContest(S.season).then(function () { route(); open(byId(p.$id)); X.toast('You already had a review of this project; it is loaded now. Save again to update it.', true); }, X.fail);
                X.fail(e);
            });
        });
        loadOthers(p, d);
    }

    function loadOthers(p, d) {
        X.callFn({ action: 'projectReviews', projectId: p.$id }).then(function (r) {
            var box = $('#others', d);
            if (!box) return;
            if (!r.ok) throw new Error(r.message);
            if (r.locked) {
                box.innerHTML = '<div class="lock">' + (r.count ? r.count + ' other judge' + (r.count === 1 ? ' has' : 's have') + ' reviewed this project.' : 'No one else has reviewed this project yet.') + '<br>Other judges\' scores and comments appear here once you submit your own, so everyone scores independently.</div>';
                return;
            }
            if (!r.reviews.length) { box.innerHTML = '<div class="lock">No other judge has reviewed this project yet.</div>'; return; }
            box.innerHTML = r.reviews.map(function (v) {
                return '<div class="review-card"><header><span>' + esc(v.judgeName || 'Judge') + '</span><span>' + (v.scoreTechnical == null ? '—' : v.total + ' / ' + MAX) + '</span></header>' +
                    '<div class="scores">' + CRITERIA.map(function (c) { return esc(c[1]) + ' ' + (v[c[0]] == null ? '—' : v[c[0]]); }).join(' · ') + '</div>' +
                    (v.comments ? '<span class="lbl2">To the students</span><p>' + esc(v.comments) + '</p>' : '') +
                    (v.privateNotes ? '<span class="lbl2">Private</span><p>' + esc(v.privateNotes) + '</p>' : '') + '</div>';
            }).join('');
        }).catch(function (e) { var box = $('#others', d); if (box) box.innerHTML = '<div class="lock">Could not load other reviews (' + esc(e.message) + ').</div>'; });
    }

    // ---------------------------------------------------------------- event info
    function eventInfo() {
        var i = info(), zoom = safeUrl(i.judgeZoomUrl), discord = safeUrl(i.discordUrl), rooms = (i.rooms || []).filter(function (r) { return safeUrl(r.url); });
        var contact = i.contactEmail || 'hello@mail.igniteaiexpo.org';
        main.innerHTML = '<div class="p-head"><div><h1>Zoom &amp; Discord</h1><p>Everything you need on interview day for ' + esc(i.name || 'this contest') + '.</p></div></div>' +
            '<div class="info-grid">' +
            '<div class="info-card"><h3>When</h3><b style="font-size:17px">' + esc(i.interviewDate || 'To be announced') + '</b><p>Please join a few minutes early.</p></div>' +
            '<div class="info-card"><h3>Judges\' Zoom</h3>' + (zoom ? '<p>Briefing and judges\' room.</p><a class="pbtn primary" href="' + esc(zoom) + '" target="_blank" rel="noopener">Join Zoom</a><p style="word-break:break-all;font-size:12.5px">' + esc(zoom) + '</p>' : '<p>The organizers will post the Zoom link here before interview day.</p>') + '</div>' +
            '<div class="info-card"><h3>Discord</h3>' + (discord ? '<p>Updates, questions and help during the event.</p><a class="pbtn" href="' + esc(discord) + '" target="_blank" rel="noopener">Open Discord</a>' : '<p>No Discord link has been posted yet.</p>') + '</div>' +
            '</div>' +
            (rooms.length ? '<div class="info-card" style="margin-bottom:20px"><h3>Interview rooms (Zoom, by grade division)</h3><div class="rooms">' + rooms.map(function (r) { return '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(X.divLabel(r.division)) + '<span>Join</span></a>'; }).join('') + '</div></div>' : '') +
            (i.notes ? '<div class="panel"><h2>From the organizers</h2><div class="prose" style="margin:0;background:none;border:0;padding:0">' + esc(i.notes) + '</div></div>' : '') +
            '<p style="color:var(--muted);font-size:14px">Something not working? Email <a href="mailto:' + esc(contact) + '" style="text-decoration:underline">' + esc(contact) + '</a>' + (discord ? ' or ask in Discord' : '') + '.</p>';
    }

    // ---------------------------------------------------------------- guide
    function rubric() {
        main.innerHTML = '<div class="p-head"><div><h1>Judging guide</h1><p>Three scores, each from 1 to 10, for a total out of ' + MAX + '. Compare each project with others in the same grade division, not with adult work.</p></div></div>' +
            '<div class="panel">' + CRITERIA.map(function (c, i) { return '<div class="score" style="grid-template-columns:1fr"><h4>' + (i + 1) + '. ' + esc(c[1]) + '</h4><p>' + esc(c[2]) + '</p></div>'; }).join('') + '</div>' +
            '<div class="grid2"><div class="panel"><h2>Scoring scale</h2><dl class="kv" style="margin:0"><dt>9 – 10</dt><dd>Exceptional for this grade level</dd><dt>7 – 8</dt><dd>Strong, with clear ownership</dd><dt>5 – 6</dt><dd>Solid, meets expectations</dd><dt>3 – 4</dt><dd>Partly working, or thinly understood</dd><dt>1 – 2</dt><dd>Not really demonstrated</dd></dl></div>' +
            '<div class="panel"><h2>Two comments, two audiences</h2><ul style="list-style:disc;padding-left:18px;color:var(--muted);font-size:14.5px"><li><b>Comment to the students</b> is shared with the family. Lead with what they did well, then give one or two concrete next steps. Be encouraging.</li><li><b>Private comment</b> is for other judges and the organizers only: award thoughts, comparisons, concerns.</li><li>Other judges\' reviews of a project appear after you submit yours, so everyone scores independently.</li></ul></div></div>' +
            '<div class="panel"><h2>Things to keep in mind</h2><ul style="list-style:disc;padding-left:18px;color:var(--muted);font-size:14.5px"><li>AI tools are allowed. What counts is whether the student understands and can explain their own project.</li><li>Expect more from a team, in proportion to its size.</li><li>A project that follows a tutorial without adding anything of the student\'s own should score low on idea.</li><li>If you know a student personally, do not review that project. Let the organizers know so they can reassign it.</li><li>You can edit your review at any time until the organizers close judging.</li></ul></div>';
    }
})();
