/* IgniteAI Expo — admin portal */
(function () {
    'use strict';

    var X = EXPO, CFG = X.CFG, T = CFG.T, $ = X.$, $$ = X.$$, esc = X.esc, Query = X.Query;
    var S = { me: null, seasons: [], season: null, signups: [], regs: [], projects: [], reviews: [], certs: [], notifs: [], judges: [], admins: [], settings: {}, email: null };
    var main = $('#main');
    var filters = { reg: { q: '', division: '', track: '', status: '' }, proj: { q: '', division: '', track: '', status: '' }, score: { division: '', track: '' } };

    // =====================================================================
    // Boot
    // =====================================================================
    X.requireRole('admin').then(function (m) {
        S.me = m;
        $('#who').textContent = m.user.name || 'Admin';
        $('#who-email').textContent = m.user.email;
        $('#signout').addEventListener('click', X.signOut);
        return X.loadSeasons();
    }).then(function (se) {
        S.seasons = se.list; S.season = se.active;
        if (!S.season) throw new Error('No season exists yet. Run scripts/appwrite_setup.py first.');
        drawSeasonPicker();
        return loadAll();
    }).then(function () {
        $('#loading').hidden = true;
        $('#shell').hidden = false;
        $$('#nav a').forEach(function (a) { a.addEventListener('click', function () { location.hash = a.getAttribute('data-tab'); }); });
        window.addEventListener('hashchange', route);
        route();
        X.callFn({ action: 'emailStatus' }).then(function (r) { S.email = r; if (currentTab() === 'notify' || currentTab() === 'settings') route(); }, function () {});
    }).catch(X.fail);

    function drawSeasonPicker() {
        var sel = $('#season');
        sel.innerHTML = S.seasons.map(function (x) { return '<option value="' + esc(x.$id) + '"' + (x.$id === S.season.$id ? ' selected' : '') + '>' + esc(x.name) + (x.isCurrent ? '' : ' (not current)') + '</option>'; }).join('');
        sel.onchange = function () {
            S.season = byId(S.seasons, sel.value); X.rememberSeason(S.season.$id);
            loadAll().then(route, X.fail);
        };
    }
    function sid() { return S.season.$id; }

    function loadAll() {
        var here = function (extra) { return X.inSeason(sid(), extra); };
        return Promise.all([
            X.listAll(T.reg, here([Query.orderDesc('entryNumber')])), X.listAll(T.proj, here()), X.listAll(T.rev, here()), X.listAll(T.cert, here()),
            X.listAll(T.notif, here([Query.orderDesc('$createdAt')])), loadPeople(), X.getRow(T.set, sid()).catch(function () { return {}; }), X.listAll(T.judge, here())
        ]).then(function (r) {
            S.regs = r[0]; S.projects = r[1]; S.reviews = r[2]; S.certs = r[3]; S.notifs = r[4]; S.settings = r[6] || {}; S.signups = r[7] || [];
            counts();
        });
    }
    function loadPeople() {
        // Via the server function: browser sessions cannot see other members' names or ids.
        return X.callFn({ action: 'listPeople' }).then(function (r) {
            if (!r.ok) throw new Error(r.message || 'Could not load judges.');
            S.judges = r.judges; S.admins = r.admins;
        });
    }
    function counts() {
        $('#n-reg').textContent = S.regs.length || '';
        $('#n-proj').textContent = S.projects.length || '';
        $('#n-cert').textContent = S.certs.length || '';
    }
    function currentTab() { return (location.hash || '#dashboard').slice(1); }
    function route() {
        var tab = currentTab();
        if (!TABS[tab]) tab = 'dashboard';
        $$('#nav a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-tab') === tab); });
        closeDrawer();
        TABS[tab]();
        window.scrollTo(0, 0);
    }

    // =====================================================================
    // Small helpers
    // =====================================================================
    function head(title, sub, actions) {
        return '<div class="p-head"><div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><div class="p-actions">' + (actions || '') + '</div></div>';
    }
    function statusTag(s) {
        var cls = { accepted: 'green', finalist: 'gold', rejected: 'red', withdrawn: 'red', 'new': 'blue', submitted: 'blue' }[s] || '';
        return '<span class="tag ' + cls + '">' + esc(s || 'new') + '</span>';
    }
    function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].$id === id) return list[i]; return null; }
    function fullName(r) { return ((r.firstName || '') + ' ' + (r.lastName || '')).trim(); }
    // A team is ONE registration: first student in firstName/lastName/grade, the rest in memberNames/memberGrades.
    function studentsOf(r) {
        var list = [{ name: fullName(r), grade: r.grade }];
        (r.memberNames || []).forEach(function (n, i) { if (n) list.push({ name: n, grade: (r.memberGrades || [])[i] || '' }); });
        return list;
    }
    function shortName(n) { if (/[^\u0000-\u024f]/.test(n)) return n; /* initials don't work for non-Latin names */ var parts = String(n).trim().split(/\s+/); return parts.length > 1 ? parts[0] + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.' : n; }
    function joinNames(list) { return list.length < 2 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }
    function entryLabel(r) { return r.entryType === 'team' ? (r.teamName || 'Team') + ' (' + studentsOf(r).length + ')' : fullName(r); }
    function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9À-￿]+/g, ''); }
    function divIndex(d) { return CFG.DIVISIONS.indexOf(d); }
    function regsOf(p) { return S.regs.filter(function (r) { return r.projectId === p.$id; }); }
    function reviewsOf(p) { return S.reviews.filter(function (v) { return v.projectId === p.$id && v.submitted; }); }
    function judgeList() { return S.judges.filter(function (j) { return j.confirm; }); }
    function judgeName(id) { var j = S.judges.filter(function (x) { return x.userId === id; })[0]; return j ? (j.userName || j.userEmail) : id; }
    function avg(list, key) { if (!list.length) return null; return list.reduce(function (a, v) { return a + (v[key] || 0); }, 0) / list.length; }
    function n1(v) { return v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1); }
    function matches(row, f, fields) {
        if (f.division && row.division !== f.division) return false;
        if (f.track && row.track !== f.track) return false;
        if (f.status && (row.status || (row.firstName ? 'new' : 'submitted')) !== f.status) return false;
        if (f.q) {
            var hay = fields.map(function (k) { return Array.isArray(row[k]) ? row[k].join(' ') : (row[k] == null ? '' : row[k]); }).join(' ').toLowerCase();
            if (hay.indexOf(f.q.toLowerCase()) === -1) return false;
        }
        return true;
    }
    function filterBar(key, statuses) {
        var f = filters[key];
        return '<div class="toolbar" data-filter="' + key + '">' +
            '<input type="search" placeholder="Search…" value="' + esc(f.q) + '" data-k="q">' +
            '<select data-k="division">' + X.opts(CFG.DIVISIONS, f.division, 'All divisions') + '</select>' +
            '<select data-k="track">' + X.opts(CFG.TRACKS, f.track, 'All tracks') + '</select>' +
            (statuses ? '<select data-k="status">' + X.opts(statuses, f.status, 'Any status') + '</select>' : '') +
            '<span class="count" id="count-' + key + '"></span></div>';
    }
    function bindFilters(key, rerender) {
        $$('[data-filter="' + key + '"] [data-k]').forEach(function (el) {
            el.addEventListener(el.type === 'search' ? 'input' : 'change', function () { filters[key][el.getAttribute('data-k')] = el.value; rerender(); });
        });
    }

    // ----- drawer -----
    function openDrawer(html) {
        $('#drawer-host').innerHTML = '<div class="drawer-bg"></div><aside class="drawer"><button class="x" aria-label="Close">×</button>' + html + '</aside>';
        $('.drawer-bg').addEventListener('click', closeDrawer);
        $('.drawer .x').addEventListener('click', closeDrawer);
        return $('.drawer');
    }
    function closeDrawer() { $('#drawer-host').innerHTML = ''; }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

    function progressPanel(title) {
        var d = openDrawer('<h2>' + esc(title) + '</h2><p class="sub" id="pg-text">Starting…</p><div class="progress"><i id="pg-bar"></i></div><div id="pg-out"></div>');
        return {
            tick: function (done, total, label) { $('#pg-bar', d).style.width = Math.round(done / total * 100) + '%'; $('#pg-text', d).textContent = (label || 'Working') + ' ' + done + ' / ' + total; },
            done: function (html) { $('#pg-bar', d).style.width = '100%'; $('#pg-text', d).textContent = 'Finished.'; $('#pg-out', d).innerHTML = html + '<p style="margin-top:18px"><button class="pbtn dark" id="pg-close">Close</button></p>'; $('#pg-close', d).addEventListener('click', function () { closeDrawer(); route(); }); }
        };
    }

    var TABS = {};

    // =====================================================================
    // Dashboard
    // =====================================================================
    TABS.dashboard = function () {
        var active = S.regs.filter(function (r) { return r.status !== 'withdrawn' && r.status !== 'rejected'; });
        var unlinked = active.filter(function (r) { return !r.projectId; }).length;
        var countries = {}; active.forEach(function (r) { if (r.country) countries[r.country.trim().toLowerCase()] = 1; });
        var liveProjects = S.projects.filter(function (p) { return p.status !== 'withdrawn' && p.status !== 'rejected'; });
        var submitted = S.reviews.filter(function (v) { return v.submitted; });
        var unreviewed = liveProjects.filter(function (p) { return !reviewsOf(p).length; }).length;
        var unassigned = liveProjects.filter(function (p) { return !(p.assignedJudges || []).length; }).length;
        var winners = S.projects.filter(function (p) { return p.award; }).length;

        function bars(list, key, labels) {
            var max = 1, c = {};
            list.forEach(function (r) { c[r[key]] = (c[r[key]] || 0) + 1; });
            labels.forEach(function (l) { max = Math.max(max, c[l] || 0); });
            return '<div class="bars">' + labels.map(function (l) {
                return '<div><span>' + esc(key === 'division' ? X.divLabel(l) : l) + '</span><i style="width:' + ((c[l] || 0) / max * 100) + '%"></i><em>' + (c[l] || 0) + '</em></div>';
            }).join('') + '</div>';
        }
        var todo = [];
        if (unlinked) todo.push(['<b>' + unlinked + '</b> registration' + (unlinked > 1 ? 's have' : ' has') + ' not been turned into a project yet. Judges can only see projects.', 'projects', 'Build projects']);
        if (!judgeList().length || judgeList().length < 2) todo.push(['Invite your judges so they can set a password before interview day.', 'judges', 'Invite judges']);
        if (S.projects.length && unassigned) todo.push(['<b>' + unassigned + '</b> project' + (unassigned > 1 ? 's have' : ' has') + ' no judge assigned.', 'projects', 'Assign judges']);
        if (S.projects.length && unreviewed) todo.push(['<b>' + unreviewed + '</b> project' + (unreviewed > 1 ? 's have' : ' has') + ' no submitted review yet.', 'scores', 'See scores']);
        var waiting = S.signups.filter(function (j) { return j.status === 'pending'; }).length;
        if (waiting) todo.push(['<b>' + waiting + '</b> judge sign-up' + (waiting > 1 ? 's are' : ' is') + ' waiting for your approval.', 'judges', 'Review']);
        if (S.email && !S.email.configured) todo.push(['Email sending is not set up yet, so notifications cannot go out.', 'settings', 'Set up email']);
        if (!S.settings.signerName) todo.push(['Add the name that signs the certificates.', 'settings', 'Open settings']);

        main.innerHTML = head('Dashboard', esc(S.season.name) + ' at a glance.' + (S.season.isCurrent ? '' : ' <b>This is not the current season.</b>')) +
            '<div class="cards">' +
            '<div class="card"><b>' + S.regs.length + '</b><span>Registrations</span></div>' +
            '<div class="card"><b>' + S.projects.length + '</b><span>Projects</span></div>' +
            '<div class="card"><b>' + Object.keys(countries).length + '</b><span>Countries</span></div>' +
            '<div class="card"><b>' + judgeList().length + '</b><span>Judges</span></div>' +
            '<div class="card"><b>' + submitted.length + '</b><span>Reviews submitted</span></div>' +
            '<div class="card"><b>' + winners + '</b><span>Awards recorded</span></div>' +
            '<div class="card"><b>' + S.certs.length + '</b><span>Certificates</span></div>' +
            '</div>' +
            (todo.length ? '<div class="panel"><h2>Next steps</h2><ul class="todo">' + todo.map(function (t) {
                return '<li><span>' + t[0] + '</span><a class="pbtn sm" href="#' + t[1] + '">' + t[2] + '</a></li>';
            }).join('') + '</ul></div>' : '') +
            '<div class="grid2"><div class="panel"><h2>Registrations by division</h2>' + bars(active, 'division', CFG.DIVISIONS) + '</div>' +
            '<div class="panel"><h2>Registrations by track</h2>' + bars(active, 'track', CFG.TRACKS) + '</div></div>';
    };

    // =====================================================================
    // Registrations
    // =====================================================================
    var REG_STATUS = ['new', 'accepted', 'rejected', 'withdrawn'];
    var REG_COLS = ['entryNumber', 'season', '$createdAt', 'status', 'firstName', 'lastName', 'grade', 'division', 'school', 'city', 'country', 'studentEmail',
        'parentName', 'parentEmail', 'parentPhone', 'projectTitle', 'track', 'xField', 'entryType', 'teamName', 'memberNames', 'memberGrades',
        'projectSummary', 'demoUrl', 'codeUrl', 'aiTools', 'projectId', 'adminNotes'];

    TABS.registrations = function () {
        main.innerHTML = head('Registrations', 'Every application, exactly as submitted. Contact details here are never shown to judges.',
            '<button class="pbtn" id="reg-refresh">Refresh</button><button class="pbtn" id="reg-csv">Export CSV</button>') +
            filterBar('reg', REG_STATUS) + '<div class="tbl-wrap" id="reg-table"></div>';
        var draw = function () {
            var rows = S.regs.filter(function (r) { return matches(r, filters.reg, ['entryNumber', 'firstName', 'lastName', 'memberNames', 'school', 'country', 'projectTitle', 'teamName', 'parentEmail', 'parentName']); });
            $('#count-reg').textContent = rows.length + ' of ' + S.regs.length;
            $('#reg-table').innerHTML = rows.length ? '<table class="tbl"><thead><tr><th>Entry</th><th>Student</th><th>Division</th><th>Project</th><th>Track</th><th>Entry</th><th>Country</th><th>Status</th><th>Received</th></tr></thead><tbody>' +
                rows.map(function (r) {
                    return '<tr class="click" data-id="' + r.$id + '"><td class="num"><b>' + (r.entryNumber || '—') + '</b></td><td><b>' + esc(fullName(r)) + '</b>' + ((r.memberNames || []).length ? '<small>+ ' + esc(r.memberNames.join(', ')) + '</small>' : '') + '<small>' + esc(r.school) + '</small></td>' +
                        '<td>' + esc(X.divLabel(r.division)) + '<small>Grade ' + esc(r.grade) + '</small></td>' +
                        '<td>' + esc(r.projectTitle) + (r.projectId ? '' : '<small>not in a project yet</small>') + '</td><td>' + esc(r.track) + '</td>' +
                        '<td>' + (r.entryType === 'team' ? 'Team<small>' + esc(r.teamName) + '</small>' : 'Individual') + '</td>' +
                        '<td>' + esc(r.country) + '</td><td>' + statusTag(r.status || 'new') + '</td><td>' + esc(X.fmtDate(r.$createdAt)) + '</td></tr>';
                }).join('') + '</tbody></table>' : '<div class="empty">No registrations match.</div>';
            $$('#reg-table tr.click').forEach(function (tr) { tr.addEventListener('click', function () { regDrawer(byId(S.regs, tr.getAttribute('data-id'))); }); });
            return rows;
        };
        bindFilters('reg', draw);
        var visible = draw();
        $('#reg-refresh').addEventListener('click', function () { loadAll().then(route, X.fail); });
        $('#reg-csv').addEventListener('click', function () {
            visible = draw();
            X.download('igniteai-registrations-' + sid() + '.csv', X.toCsv(visible, REG_COLS), 'text/csv');
        });
    };

    function regDrawer(r) {
        var link = function (u) { return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + '</a>' : '—'; };
        var p = r.projectId ? byId(S.projects, r.projectId) : null;
        var d = openDrawer('<h2>' + esc(fullName(r)) + '</h2><p class="sub">' + 'Entry #' + esc(r.entryNumber || '—') + ' · ' + esc(r.projectTitle) + '</p>' +
            '<div class="frow"><div class="f"><label>Status</label><select id="r-status">' + X.opts(REG_STATUS, r.status || 'new') + '</select></div>' +
            '<div class="f"><label>Project</label><div style="padding-top:8px">' + (p ? '<a href="#projects" style="color:var(--accent-dark);text-decoration:underline">' + esc(p.title) + '</a>' : 'Not in a project yet') + '</div></div></div>' +
            '<div class="f"><label>Organizer notes <i style="font-weight:400;color:var(--dim)">(private)</i></label><textarea id="r-notes">' + esc(r.adminNotes) + '</textarea></div>' +
            '<div class="sect">Student</div><dl class="kv"><dt>Grade</dt><dd>' + esc(r.grade) + ' · ' + esc(X.divLabel(r.division)) + '</dd><dt>School</dt><dd>' + esc(r.school) + '</dd>' +
            '<dt>Location</dt><dd>' + esc(r.city) + ', ' + esc(r.country) + '</dd><dt>Student email</dt><dd>' + esc(r.studentEmail || '—') + '</dd></dl>' +
            '<div class="sect">Parent or guardian</div><dl class="kv"><dt>Name</dt><dd>' + esc(r.parentName) + '</dd><dt>Email</dt><dd><a href="mailto:' + esc(r.parentEmail) + '">' + esc(r.parentEmail) + '</a></dd><dt>Phone</dt><dd>' + esc(r.parentPhone || '—') + '</dd></dl>' +
            '<div class="sect">Project</div><dl class="kv"><dt>Track</dt><dd>' + esc(r.track) + '</dd><dt>Their “X”</dt><dd>' + esc(r.xField || '—') + '</dd>' +
            '<dt>Entry</dt><dd>' + (r.entryType === 'team' ? 'Team “' + esc(r.teamName) + '”' : 'Individual') + '</dd>' +
            '<dt>Students</dt><dd>' + studentsOf(r).map(function (x) { return esc(x.name) + ' <span style="color:var(--muted)">(Grade ' + esc(x.grade) + ')</span>'; }).join('<br>') + '</dd>' +
            (r.demoUrl ? '<dt>Demo</dt><dd>' + link(r.demoUrl) + '</dd>' : '') + (r.codeUrl ? '<dt>Code</dt><dd>' + link(r.codeUrl) + '</dd>' : '') + (r.aiTools ? '<dt>AI tools</dt><dd>' + esc(r.aiTools) + '</dd>' : '') + '</dl>' +
            (r.projectSummary ? '<div class="prose">' + esc(r.projectSummary) + '</div>' : '<div class="note">No summary provided.</div>') +
            '<div class="sect">Correct a detail</div><div class="frow">' +
            '<div class="f"><label>First name</label><input id="r-first" value="' + esc(r.firstName) + '"></div><div class="f"><label>Last name</label><input id="r-last" value="' + esc(r.lastName) + '"></div>' +
            '<div class="f"><label>Grade</label><select id="r-grade">' + X.opts(['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], r.grade) + '</select></div>' +
            '<div class="f"><label>Track</label><select id="r-track">' + X.opts(CFG.TRACKS, r.track) + '</select></div>' +
            '<div class="f"><label>Contact email</label><input id="r-pemail" type="email" value="' + esc(r.parentEmail) + '"></div><div class="f"><label>Team name</label><input id="r-team" value="' + esc(r.teamName) + '"></div></div>' +
            '<div class="f"><label>Teammates <i style="font-weight:400;color:var(--dim)">(one per line: Name | Grade — leave empty for an individual entry)</i></label><textarea id="r-mates" style="min-height:90px">' + esc((r.memberNames || []).map(function (n, i) { return n + ' | ' + ((r.memberGrades || [])[i] || ''); }).join('\n')) + '</textarea><small>Names appear on certificates exactly as written here.</small></div>' +
            '<div class="p-actions" style="margin-top:10px"><button class="pbtn primary" id="r-save">Save changes</button><button class="pbtn danger" id="r-del">Delete registration</button></div>');

        $('#r-save', d).addEventListener('click', function () {
            var g = $('#r-grade', d).value, names = [], grades = [];
            $('#r-mates', d).value.split('\n').forEach(function (line) {
                var parts = line.split('|'), n = (parts[0] || '').trim(), gr = (parts[1] || '').trim().toUpperCase();
                if (n) { names.push(n.slice(0, 160)); grades.push(/^(K|[1-9]|1[0-2])$/.test(gr) ? gr : ''); }
            });
            var gi = Math.max.apply(null, [g].concat(grades).filter(Boolean).map(function (x) { return x === 'K' ? 0 : parseInt(x, 10); }));
            var data = {
                memberNames: names, memberGrades: grades, entryType: names.length ? 'team' : 'individual',
                status: $('#r-status', d).value, adminNotes: $('#r-notes', d).value.trim() || null,
                firstName: $('#r-first', d).value.trim(), lastName: $('#r-last', d).value.trim(), grade: g,
                division: gi <= 3 ? 'K-3' : gi <= 6 ? '4-6' : gi <= 8 ? '7-8' : '9-12',
                track: $('#r-track', d).value, parentEmail: $('#r-pemail', d).value.trim(), teamName: $('#r-team', d).value.trim() || null
            };
            X.updateRow(T.reg, r.$id, data).then(function (row) {
                S.regs[S.regs.indexOf(r)] = row; X.toast('Saved.'); route();
            }, X.fail);
        });
        $('#r-del', d).addEventListener('click', function () {
            if (!confirm('Delete ' + fullName(r) + '\'s registration permanently? This cannot be undone.')) return;
            X.deleteRow(T.reg, r.$id).then(function () { S.regs.splice(S.regs.indexOf(r), 1); counts(); X.toast('Registration deleted.'); route(); }, X.fail);
        });
    }

    // =====================================================================
    // Projects
    // =====================================================================
    var PROJ_STATUS = ['submitted', 'accepted', 'finalist', 'rejected', 'withdrawn'];

    function projectDataFrom(r) {
        var people = studentsOf(r);
        return {
            season: sid(), entryNumber: r.entryNumber || null,
            title: r.projectTitle, track: r.track, division: r.division, entryType: r.entryType, teamName: r.entryType === 'team' ? r.teamName : null,
            members: people.map(function (x) { return x.name + ' (Gr ' + x.grade + ')'; }).join(', ').slice(0, 800), memberCount: people.length,
            country: r.country, xField: r.xField || null, summary: r.projectSummary || null, demoUrl: r.demoUrl || null, codeUrl: r.codeUrl || null,
            aiTools: r.aiTools || null, status: 'submitted'
        };
    }

    // One registration (individual or whole team) becomes one project. The project reuses the
    // registration's row id (as the expo-api function does), so a second build can never duplicate it.
    function buildProjects() {
        var fresh = S.regs.filter(function (r) { return !r.projectId && r.status !== 'withdrawn' && r.status !== 'rejected'; });
        if (!fresh.length) return X.toast('Every registration already has a project.');
        var pg = progressPanel('Building projects'), errors = [];
        X.pool(fresh, function (r) {
            return X.createRow(T.proj, projectDataFrom(r), null, r.$id).catch(function (e) {
                if (e.code === 409) return X.getRow(T.proj, r.$id); // already built (by the function, or another admin)
                throw e;
            }).then(function (p) {
                if (!byId(S.projects, p.$id)) S.projects.push(p);
                return X.updateRow(T.reg, r.$id, { projectId: p.$id }).then(function (row) { S.regs[S.regs.indexOf(r)] = row; });
            });
        }, 3, function (done, total) { pg.tick(done, total, 'Projects'); }).then(function (res) {
            res.forEach(function (x) { if (!x.ok) errors.push(x.error.message); });
            counts();
            pg.done('<div class="note ok">Created <b>' + (res.length - errors.length) + '</b> project' + (res.length - errors.length === 1 ? '' : 's') + '. Judges can see them now.</div>' +
                (errors.length ? '<div class="note">' + errors.length + ' problem(s): ' + esc(errors.slice(0, 3).join(' · ')) + '</div>' : ''));
        });
    }

    TABS.projects = function () {
        var unlinked = S.regs.filter(function (r) { return !r.projectId && r.status !== 'withdrawn' && r.status !== 'rejected'; }).length;
        main.innerHTML = head('Projects', 'What judges see: one row per entry, with no contact details.',
            '<button class="pbtn primary" id="p-build">Build from registrations' + (unlinked ? ' (' + unlinked + ' new)' : '') + '</button><button class="pbtn" id="p-assign">Assign judges…</button><button class="pbtn" id="p-csv">Export CSV</button>') +
            filterBar('proj', PROJ_STATUS) + '<div class="tbl-wrap" id="proj-table"></div>';
        var rowsNow = [];
        var draw = function () {
            rowsNow = S.projects.filter(function (p) { return matches(p, filters.proj, ['entryNumber', 'title', 'members', 'teamName', 'country', 'xField']); })
                .sort(function (a, b) { return (a.entryNumber || 0) - (b.entryNumber || 0); });
            $('#count-proj').textContent = rowsNow.length + ' of ' + S.projects.length;
            $('#proj-table').innerHTML = rowsNow.length ? '<table class="tbl"><thead><tr><th>Entry</th><th>Project</th><th>Division</th><th>Track</th><th>Judges</th><th class="num">Reviews</th><th class="num">Avg / ' + CFG.SCORE_MAX + '</th><th>Status</th><th>Award</th></tr></thead><tbody>' +
                rowsNow.map(function (p) {
                    var rv = reviewsOf(p);
                    return '<tr class="click" data-id="' + p.$id + '"><td class="num"><b>' + (p.entryNumber || '—') + '</b></td><td><b>' + esc(p.title) + '</b><small>' + esc(p.members) + '</small></td><td>' + esc(X.divLabel(p.division)) + '</td><td>' + esc(p.track) + '</td>' +
                        '<td>' + ((p.assignedJudges || []).map(function (id) { return esc(judgeName(id)); }).join('<br>') || '<small>none</small>') + '</td>' +
                        '<td class="num">' + rv.length + '</td><td class="num">' + n1(avg(rv, 'total')) + '</td><td>' + statusTag(p.status || 'submitted') + '</td><td>' + (p.award ? '<span class="tag gold">' + esc(p.award) + '</span>' : '') + '</td></tr>';
                }).join('') + '</tbody></table>' : '<div class="empty">' + (S.projects.length ? 'No projects match.' : 'No projects yet. Click “Build from registrations” to create them.') + '</div>';
            $$('#proj-table tr.click').forEach(function (tr) { tr.addEventListener('click', function () { projectDrawer(byId(S.projects, tr.getAttribute('data-id'))); }); });
        };
        bindFilters('proj', draw); draw();
        $('#p-build').addEventListener('click', buildProjects);
        $('#p-assign').addEventListener('click', function () { assignDrawer(rowsNow); });
        $('#p-csv').addEventListener('click', function () {
            X.download('igniteai-projects-' + sid() + '.csv', X.toCsv(rowsNow.map(function (p) {
                var rv = reviewsOf(p), o = X.clean(p); o.reviews = rv.length; o.average = n1(avg(rv, 'total'));
                o.assignedJudges = (p.assignedJudges || []).map(judgeName); return o;
            }), ['entryNumber', 'title', 'division', 'track', 'entryType', 'teamName', 'members', 'country', 'xField', 'status', 'assignedJudges', 'reviews', 'average', 'award', 'interviewTime', 'demoUrl', 'codeUrl']), 'text/csv');
        });
    };

    function reviewCards(p, includePrivate) {
        var all = S.reviews.filter(function (v) { return v.projectId === p.$id; });
        if (!all.length) return '<div class="note">No reviews yet.</div>';
        return all.map(function (v) {
            return '<div class="review-card"><header><span>' + esc(v.judgeName || judgeName(v.judgeId)) + (v.submitted ? '' : ' <span class="tag">draft</span>') + '</span><span>' + (v.total == null ? '—' : v.total) + ' / ' + CFG.SCORE_MAX + '</span></header>' +
                '<div class="scores">' + CFG.CRITERIA.map(function (c) { return esc(c[1]) + ' ' + (v[c[0]] == null ? '—' : v[c[0]]); }).join(' · ') + '</div>' +
                (v.comments ? '<span class="lbl2">To the students</span><p>' + esc(v.comments) + '</p>' : '') +
                (includePrivate && v.privateNotes ? '<span class="lbl2">Private</span><p style="color:var(--muted)">' + esc(v.privateNotes) + '</p>' : '') + '</div>';
        }).join('');
    }

    function projectDrawer(p) {
        var assigned = p.assignedJudges || [];
        var link = function (u) { return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + '</a>' : '—'; };
        var d = openDrawer('<h2>' + esc(p.title) + '</h2><p class="sub">Entry #' + esc(p.entryNumber || '—') + ' · ' + esc(X.divLabel(p.division)) + ' · ' + esc(p.track) + ' · ' + esc(p.members) + '</p>' +
            '<div class="frow"><div class="f"><label>Status</label><select id="p-status">' + X.opts(PROJ_STATUS, p.status || 'submitted') + '</select></div>' +
            '<div class="f"><label>Award</label><input id="p-award" list="award-list" value="' + esc(p.award) + '" placeholder="None"><datalist id="award-list">' + CFG.AWARDS.map(function (a) { return '<option value="' + esc(a) + '">'; }).join('') + '</datalist></div></div>' +
            '<div class="f"><label>Interview time <i style="font-weight:400;color:var(--dim)">(shown to judges, and usable in emails)</i></label><input id="p-time" value="' + esc(p.interviewTime) + '" placeholder="e.g. 9:50 AM PT · Room 2"></div>' +
            '<div class="f"><span class="lbl">Assigned judges</span><div class="checks">' + (judgeList().map(function (j) {
                return '<label><input type="checkbox" class="p-judge" value="' + j.userId + '"' + (assigned.indexOf(j.userId) > -1 ? ' checked' : '') + '> ' + esc(j.userName || j.userEmail) + '</label>';
            }).join('') || '<small>No judges have joined yet.</small>') + '</div></div>' +
            '<div class="sect">Shown to judges</div><div class="frow"><div class="f"><label>Title</label><input id="p-title" value="' + esc(p.title) + '"></div><div class="f"><label>Track</label><select id="p-track">' + X.opts(CFG.TRACKS, p.track) + '</select></div>' +
            '<div class="f"><label>Division</label><select id="p-div">' + X.opts(CFG.DIVISIONS, p.division) + '</select></div><div class="f"><label>Students</label><input id="p-members" value="' + esc(p.members) + '"></div></div>' +
            '<div class="f"><label>Summary</label><textarea id="p-summary" style="min-height:180px">' + esc(p.summary) + '</textarea></div>' +
            '<dl class="kv"><dt>Their “X”</dt><dd>' + esc(p.xField || '—') + '</dd>' + (p.demoUrl ? '<dt>Demo</dt><dd>' + link(p.demoUrl) + '</dd>' : '') + (p.codeUrl ? '<dt>Code</dt><dd>' + link(p.codeUrl) + '</dd>' : '') + (p.aiTools ? '<dt>AI tools</dt><dd>' + esc(p.aiTools) + '</dd>' : '') + '<dt>Country</dt><dd>' + esc(p.country || '—') + '</dd></dl>' +
            '<div class="p-actions"><button class="pbtn primary" id="p-save">Save changes</button><button class="pbtn danger" id="p-del">Delete project</button></div>' +
            '<div class="sect">Reviews</div>' + reviewCards(p, true));

        $('#p-save', d).addEventListener('click', function () {
            X.updateRow(T.proj, p.$id, {
                status: $('#p-status', d).value, award: $('#p-award', d).value.trim() || null, interviewTime: $('#p-time', d).value.trim() || null,
                assignedJudges: $$('.p-judge:checked', d).map(function (c) { return c.value; }),
                title: $('#p-title', d).value.trim(), track: $('#p-track', d).value, division: $('#p-div', d).value,
                members: $('#p-members', d).value.trim(), summary: $('#p-summary', d).value.trim() || null
            }).then(function (row) { S.projects[S.projects.indexOf(p)] = row; X.toast('Saved.'); route(); }, X.fail);
        });
        $('#p-del', d).addEventListener('click', function () {
            if (!confirm('Delete this project? Its registrations are kept and can be rebuilt into a project again. Reviews of it will be orphaned.')) return;
            var linked = regsOf(p);
            X.deleteRow(T.proj, p.$id).then(function () {
                S.projects.splice(S.projects.indexOf(p), 1);
                return Promise.all(linked.map(function (r) { return X.updateRow(T.reg, r.$id, { projectId: null }).then(function (row) { S.regs[S.regs.indexOf(r)] = row; }); }));
            }).then(function () { counts(); X.toast('Project deleted.'); route(); }, X.fail);
        });
    }

    function assignDrawer(rows) {
        var judges = judgeList();
        if (!judges.length) return X.toast('No judges have accepted their invitation yet.', true);
        var d = openDrawer('<h2>Assign judges</h2><p class="sub">Applies to the <b>' + rows.length + '</b> project' + (rows.length === 1 ? '' : 's') + ' currently listed. Use the filters first to narrow by division or track.</p>' +
            '<div class="f"><span class="lbl">Judges</span><div class="checks">' + judges.map(function (j) { return '<label><input type="checkbox" class="a-judge" value="' + j.userId + '"> ' + esc(j.userName || j.userEmail) + '</label>'; }).join('') + '</div></div>' +
            '<div class="f"><span class="lbl">How</span><div class="checks"><label><input type="radio" name="a-mode" value="add" checked> Add to each project\'s judges</label><label><input type="radio" name="a-mode" value="replace"> Replace each project\'s judges</label><label><input type="radio" name="a-mode" value="spread"> Spread evenly (each project gets <input id="a-per" type="number" min="1" max="9" value="2" style="width:56px;padding:3px 6px"> of them)</label></div></div>' +
            '<button class="pbtn primary" id="a-go">Assign</button>');
        $('#a-go', d).addEventListener('click', function () {
            var ids = $$('.a-judge:checked', d).map(function (c) { return c.value; });
            if (!ids.length) return X.toast('Pick at least one judge.', true);
            var mode = $('input[name="a-mode"]:checked', d).value, per = Math.max(1, Math.min(ids.length, parseInt($('#a-per', d).value, 10) || 2)), cursor = 0;
            var pg = progressPanel('Assigning judges');
            X.pool(rows, function (p) {
                var next;
                if (mode === 'replace') next = ids.slice();
                else if (mode === 'spread') { next = []; for (var i = 0; i < per; i++) next.push(ids[(cursor + i) % ids.length]); cursor = (cursor + per) % ids.length; }
                else { next = (p.assignedJudges || []).slice(); ids.forEach(function (id) { if (next.indexOf(id) === -1) next.push(id); }); }
                return X.updateRow(T.proj, p.$id, { assignedJudges: next }).then(function (row) { S.projects[S.projects.indexOf(p)] = row; });
            }, 1, function (a, b) { pg.tick(a, b, 'Projects'); }).then(function (res) {
                var bad = res.filter(function (r) { return !r.ok; }).length;
                pg.done('<div class="note ok">Updated ' + (rows.length - bad) + ' project(s).' + (bad ? ' ' + bad + ' failed.' : '') + '</div>');
            });
        });
    }

    // =====================================================================
    // Judges & admins
    // =====================================================================
    TABS.judges = function () {
        function table(list, team) {
            return list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Status</th>' + (team === 'judges' ? '<th class="num">Assigned</th><th class="num">Submitted</th>' : '') + '<th></th></tr></thead><tbody>' + list.map(function (m) {
                var assigned = S.projects.filter(function (p) { return (p.assignedJudges || []).indexOf(m.userId) > -1; }).length;
                var done = S.reviews.filter(function (v) { return v.judgeId === m.userId && v.submitted; }).length;
                return '<tr><td><b>' + esc(m.userName || '—') + '</b></td><td>' + esc(m.userEmail) + '</td><td>' + (m.confirm ? '<span class="tag green">active</span>' : '<span class="tag">invited</span>') + '</td>' +
                    (team === 'judges' ? '<td class="num">' + assigned + '</td><td class="num">' + done + '</td>' : '') +
                    '<td class="num">' + (m.userId === S.me.user.$id ? '<small>you</small>' : '<button class="pbtn sm danger" data-rm="' + m.$id + '" data-team="' + team + '">Remove</button>') + '</td></tr>';
            }).join('') + '</tbody></table></div>' : '<div class="tbl-wrap"><div class="empty">Nobody yet.</div></div>';
        }

        var s = S.settings, base = (s.siteUrl || X.siteBase()).replace(/\/$/, '') + '/judge-signup.html?contest=' + encodeURIComponent(sid());
        var inviteUrl = s.judgeSignupCode ? base + '&code=' + encodeURIComponent(s.judgeSignupCode) : '';
        var pending = S.signups.filter(function (j) { return j.status === 'pending'; });
        var signupPanel = '<div class="panel"><h2>Judge sign-up page <small>' + esc(S.season.name) + '</small></h2>' +
            '<p style="color:var(--muted);font-size:14px;margin-bottom:14px">Share the <b>invite link</b> with volunteers you trust: anyone who signs up through it is approved at once and can sign in straight away. People who find the plain page without the code land in the list below as <i>pending</i> until you approve them.</p>' +
            '<div class="frow"><div class="f"><label>Invite code</label><div style="display:flex;gap:8px"><input id="js-code" value="' + esc(s.judgeSignupCode) + '" placeholder="none yet" style="flex:1"><button class="pbtn sm" id="js-gen" type="button">New code</button></div><small>Change it to switch off a link that has spread too far.</small></div>' +
            '<div class="f"><label>Judges\' Discord invite <i style="font-weight:400;color:var(--dim)">(shown only to approved judges)</i></label><input id="js-discord" type="url" value="' + esc(s.judgeDiscordUrl) + '" placeholder="https://discord.gg/…"></div></div>' +
            '<div class="frow"><div class="f"><label>Judges\' Zoom link <i style="font-weight:400;color:var(--dim)">(briefing / judges\' room, shown in the judge portal)</i></label><input id="js-zoom" type="url" value="' + esc(s.judgeZoomUrl) + '" placeholder="https://zoom.us/j/…"></div>' +
            '<div class="f"><label>Note to judges <i style="font-weight:400;color:var(--dim)">(shown in the judge portal)</i></label><textarea id="js-notes" maxlength="2000" style="min-height:60px" placeholder="Schedule, which room to join, who to ask for help…">' + esc(s.judgeNotes) + '</textarea></div></div>' +
            '<p style="color:var(--muted);font-size:13px;margin:-4px 0 14px">Judges also see the per-division interview Zoom links from Settings.</p>' +
            '<div class="f"><label>What you are asking of judges <i style="font-weight:400;color:var(--dim)">(shown on the sign-up page)</i></label><input id="js-commit" value="' + esc(s.judgeCommitment) + '" placeholder="About 1–2 hours on Zoom, interviewing 6–8 student projects (5–10 minutes each) and scoring them in the judge portal."></div>' +
            '<label style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><input type="checkbox" id="js-open"' + (s.judgeSignupOpen === false ? '' : ' checked') + '> Sign-up is open</label>' +
            '<div class="p-actions"><button class="pbtn primary" id="js-save">Save</button><button class="pbtn" id="js-copy"' + (s.judgeSignupCode ? '' : ' disabled') + '>Copy invite link</button><button class="pbtn" id="js-copy-plain">Copy plain link (needs approval)</button><a class="pbtn" href="' + esc(inviteUrl || base) + '" target="_blank">Preview ↗</a></div>' +
            '<p style="color:var(--muted);font-size:13px;margin-top:10px;word-break:break-all">' + (inviteUrl ? esc(inviteUrl) + '<br>This link signs people up for <b>' + esc(S.season.name) + '</b>.' : 'Set an invite code and save to get an invite link.') + '</p></div>' +
            '<h2 style="font-family:var(--body);font-size:16px;margin:0 0 10px">Sign-ups' + (pending.length ? ' <span class="tag gold">' + pending.length + ' waiting for approval</span>' : '') + '</h2>' +
            '<div class="tbl-wrap" style="margin-bottom:28px">' + (S.signups.length ? '<table class="tbl"><thead><tr><th>Name</th><th>From</th><th>Would like to judge</th><th>Status</th><th>Signed up</th><th></th></tr></thead><tbody>' +
                S.signups.slice().sort(function (a, b) { return (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || a.name.localeCompare(b.name); }).map(function (j) {
                    return '<tr class="click" data-signup="' + j.$id + '"><td><b>' + esc(j.name) + '</b><small>' + esc(j.email) + '</small></td><td>' + esc(j.affiliation) + '<small>' + esc(j.role) + '</small></td>' +
                        '<td>' + esc((j.divisions || []).map(function (d) { return d.replace('-', '–'); }).join(', ') || 'Any division') + '<small>' + esc((j.tracks || []).join(', ') || 'Any track') + '</small></td>' +
                        '<td>' + (j.status === 'approved' ? '<span class="tag green">approved</span>' : j.status === 'declined' ? '<span class="tag red">declined</span>' : '<span class="tag gold">pending</span>') + '</td><td>' + esc(X.fmtDate(j.$createdAt)) + '</td>' +
                        '<td class="num">' + (j.status !== 'approved' ? '<button class="pbtn sm primary" data-approve="' + j.$id + '">Approve</button> ' : '') + (j.status !== 'declined' ? '<button class="pbtn sm danger" data-decline="' + j.$id + '">' + (j.status === 'approved' ? 'Remove' : 'Decline') + '</button>' : '') + '</td></tr>';
                }).join('') + '</tbody></table>' : '<div class="empty">No one has signed up yet. Share the invite link above.</div>') + '</div>';
        main.innerHTML = head('Judges &amp; admins', 'Volunteers sign themselves up from the judge sign-up page; you can also invite someone directly by email.') + signupPanel +
            '<div class="panel"><h2>Invite a judge directly</h2><div class="toolbar" style="margin:0"><input type="search" id="j-name" placeholder="Name" style="max-width:220px"><input type="search" id="j-email" placeholder="Email" style="max-width:280px"><button class="pbtn primary" id="j-invite">Send invitation</button></div></div>' +
            '<h2 style="font-family:var(--body);font-size:16px;margin:0 0 10px">Judges</h2>' + table(S.judges.filter(function (m) { return m.roles.indexOf('owner') === -1; }), 'judges') +
            '<div class="panel" style="margin-top:28px"><h2>Invite another organizer <small>full access to everything here</small></h2><div class="toolbar" style="margin:0"><input type="search" id="a-name" placeholder="Name" style="max-width:220px"><input type="search" id="a-email" placeholder="Email" style="max-width:280px"><button class="pbtn" id="a-invite">Send invitation</button></div><p style="color:var(--muted);font-size:13.5px;margin-top:10px">They receive two emails (organizer access, and permission to manage judges) and should accept both.</p></div>' +
            '<h2 style="font-family:var(--body);font-size:16px;margin:0 0 10px">Organizers</h2>' + table(S.admins, 'admins');


        $('#js-gen').addEventListener('click', function () { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', c = 'JUDGE-'; for (var i = 0; i < 6; i++) c += a.charAt(Math.floor(Math.random() * a.length)); $('#js-code').value = c; });
        $('#js-save').addEventListener('click', function () {
            X.updateRow(T.set, sid(), { judgeSignupCode: $('#js-code').value.trim() || null, judgeDiscordUrl: $('#js-discord').value.trim() || null, judgeCommitment: $('#js-commit').value.trim() || null, judgeSignupOpen: $('#js-open').checked,
                judgeZoomUrl: $('#js-zoom').value.trim() || null, judgeNotes: $('#js-notes').value.trim() || null })
                .then(function (row) { S.settings = row; X.toast('Saved.'); route(); }, X.fail);
        });
        var copy = function (text, note) { navigator.clipboard.writeText(text).then(function () { X.toast(note); }, X.fail); };
        $('#js-copy').addEventListener('click', function () { copy(inviteUrl, 'Invite link copied. Anyone who signs up with it is approved at once.'); });
        $('#js-copy-plain').addEventListener('click', function () { copy(base, 'Plain link copied. Sign-ups from it wait for your approval.'); });
        function setStatus(id, status) {
            return X.callFn({ action: 'setJudgeStatus', id: id, status: status }).then(function (r) {
                if (!r.ok) throw new Error(r.message);
                return Promise.all([X.listAll(T.judge, X.inSeason(sid())).then(function (l) { S.signups = l; }), loadPeople()]);
            }).then(function () { X.toast(status === 'approved' ? 'Approved. They can sign in now, and we emailed them.' : 'Done. Their portal access is removed.'); route(); }, X.fail);
        }
        $$('[data-approve]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); b.disabled = true; setStatus(b.getAttribute('data-approve'), 'approved'); }); });
        $$('[data-decline]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); if (!confirm('Remove this person from judging? They will lose access to the judge portal.')) return; b.disabled = true; setStatus(b.getAttribute('data-decline'), 'declined'); }); });
        $$('[data-signup]').forEach(function (tr) {
            tr.addEventListener('click', function () {
                var j = byId(S.signups, tr.getAttribute('data-signup'));
                openDrawer('<h2>' + esc(j.name) + '</h2><p class="sub">' + esc(j.role) + ' · ' + esc(j.affiliation) + '</p><dl class="kv"><dt>Email</dt><dd><a href="mailto:' + esc(j.email) + '">' + esc(j.email) + '</a></dd><dt>Phone</dt><dd>' + esc(j.phone || '—') + '</dd>' +
                    '<dt>Divisions</dt><dd>' + esc((j.divisions || []).join(', ') || 'Any') + '</dd><dt>Tracks</dt><dd>' + esc((j.tracks || []).join(', ') || 'Any') + '</dd><dt>Knows students</dt><dd>' + esc(j.conflicts || '—') + '</dd><dt>Status</dt><dd>' + esc(j.status) + '</dd></dl>' +
                    (j.background ? '<div class="sect">Background</div><div class="prose">' + esc(j.background) + '</div>' : ''));
            });
        });
        var url = X.siteBase() + 'portal/';
        function invite(team, roles, name, email) {
            return X.teams.createMembership({ teamId: team, roles: roles, email: email, name: name || undefined, url: url });
        }
        $('#j-invite').addEventListener('click', function () {
            var email = $('#j-email').value.trim(); if (!email) return X.toast('Enter an email.', true);
            invite('judges', ['judge'], $('#j-name').value.trim(), email).then(function () { X.toast('Invitation sent to ' + email + '.'); return loadPeople(); }).then(route, X.fail);
        });
        $('#a-invite').addEventListener('click', function () {
            var email = $('#a-email').value.trim(), name = $('#a-name').value.trim(); if (!email) return X.toast('Enter an email.', true);
            if (!confirm('Give ' + email + ' full organizer access, including every family\'s contact details?')) return;
            invite('admins', ['owner'], name, email).then(function () { return invite('judges', ['owner'], name, email); })
                .then(function () { X.toast('Invitations sent to ' + email + '.'); return loadPeople(); }).then(route, X.fail);
        });
        $$('[data-rm]').forEach(function (b) {
            b.addEventListener('click', function () {
                if (!confirm('Remove this person\'s access?')) return;
                X.teams.deleteMembership({ teamId: b.getAttribute('data-team'), membershipId: b.getAttribute('data-rm') }).then(loadPeople).then(function () { X.toast('Removed.'); route(); }, X.fail);
            });
        });
    };

    // =====================================================================
    // Scores & awards
    // =====================================================================
    TABS.scores = function () {
        var f = filters.score;
        main.innerHTML = head('Scores &amp; awards', 'Projects ranked by average judge score within each division and track. Record the award here; publish on the Results tab.',
            '<button class="pbtn" id="s-refresh">Refresh reviews</button><button class="pbtn" id="s-csv">Export CSV</button>') +
            '<div class="toolbar"><select id="s-div">' + X.opts(CFG.DIVISIONS, f.division, 'All divisions') + '</select><select id="s-track">' + X.opts(CFG.TRACKS, f.track, 'All tracks') + '</select></div><div id="s-body"></div>';

        var flat = [];
        function draw() {
            flat = [];
            var html = '';
            CFG.DIVISIONS.forEach(function (dv) {
                if (f.division && f.division !== dv) return;
                CFG.TRACKS.forEach(function (tr) {
                    if (f.track && f.track !== tr) return;
                    var list = S.projects.filter(function (p) { return p.division === dv && p.track === tr && p.status !== 'withdrawn' && p.status !== 'rejected'; });
                    if (!list.length) return;
                    list.forEach(function (p) { p._rv = reviewsOf(p); p._avg = avg(p._rv, 'total'); });
                    list.sort(function (a, b) { return (b._avg == null ? -1 : b._avg) - (a._avg == null ? -1 : a._avg); });
                    html += '<div class="panel" style="padding:0;overflow:hidden"><h2 style="padding:16px 20px 0">' + esc(X.divLabel(dv)) + ' · ' + esc(tr) + '<small>' + list.length + ' project' + (list.length === 1 ? '' : 's') + '</small></h2>' +
                        '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>#</th><th>Project</th><th class="num">Reviews</th><th class="num">Avg / ' + CFG.SCORE_MAX + '</th>' + CFG.CRITERIA.map(function (c) { return '<th class="num">' + esc(c[1].split(' ')[0]) + '</th>'; }).join('') + '<th>Finalist</th><th>Award</th></tr></thead><tbody>' +
                        list.map(function (p, i) {
                            flat.push(p);
                            return '<tr><td>' + (p._avg == null ? '—' : i + 1) + '</td><td><a data-open="' + p.$id + '" style="cursor:pointer"><b>' + esc(p.title) + '</b></a> <span style="color:var(--muted)">#' + (p.entryNumber || '—') + '</span><small>' + esc(p.members) + '</small></td><td class="num">' + p._rv.length + ' / ' + (p.assignedJudges || []).length + '</td>' +
                                '<td class="num"><b>' + n1(p._avg) + '</b></td>' + CFG.CRITERIA.map(function (c) { return '<td class="num">' + n1(avg(p._rv, c[0])) + '</td>'; }).join('') +
                                '<td><input type="checkbox" data-fin="' + p.$id + '"' + (p.status === 'finalist' ? ' checked' : '') + '></td>' +
                                '<td><input data-award="' + p.$id + '" list="award-list" value="' + esc(p.award) + '" placeholder="—" style="font:inherit;font-size:13.5px;padding:5px 8px;border:1.5px solid var(--line);border-radius:6px;width:210px"></td></tr>';
                        }).join('') + '</tbody></table></div></div>';
                });
            });
            $('#s-body').innerHTML = (html || '<div class="tbl-wrap"><div class="empty">No projects here yet.</div></div>') + '<datalist id="award-list">' + CFG.AWARDS.map(function (a) { return '<option value="' + esc(a) + '">'; }).join('') + '</datalist>';
            $$('[data-open]').forEach(function (a) { a.addEventListener('click', function () { projectDrawer(byId(S.projects, a.getAttribute('data-open'))); }); });
            $$('[data-award]').forEach(function (inp) {
                inp.addEventListener('change', function () {
                    var p = byId(S.projects, inp.getAttribute('data-award')), val = inp.value.trim() || null;
                    var place = val ? CFG.AWARDS.indexOf(val) : -1;
                    X.updateRow(T.proj, p.$id, { award: val, place: place > -1 && place < 5 ? place + 1 : null }).then(function (row) { S.projects[S.projects.indexOf(p)] = row; X.toast(val ? 'Recorded: ' + val : 'Award cleared.'); }, X.fail);
                });
            });
            $$('[data-fin]').forEach(function (cb) {
                cb.addEventListener('change', function () {
                    var p = byId(S.projects, cb.getAttribute('data-fin'));
                    X.updateRow(T.proj, p.$id, { status: cb.checked ? 'finalist' : 'accepted' }).then(function (row) { S.projects[S.projects.indexOf(p)] = row; X.toast(cb.checked ? 'Marked as finalist.' : 'Finalist removed.'); }, X.fail);
                });
            });
        }
        draw();
        $('#s-div').addEventListener('change', function () { f.division = this.value; draw(); });
        $('#s-track').addEventListener('change', function () { f.track = this.value; draw(); });
        $('#s-refresh').addEventListener('click', function () { X.listAll(T.rev, X.inSeason(sid())).then(function (r) { S.reviews = r; draw(); X.toast('Reviews refreshed.'); }, X.fail); });
        $('#s-csv').addEventListener('click', function () {
            var rows = [];
            flat.forEach(function (p) {
                (p._rv.length ? p._rv : [{}]).forEach(function (v) {
                    rows.push({ entryNumber: p.entryNumber, division: p.division, track: p.track, project: p.title, students: p.members, average: n1(p._avg), award: p.award, judge: v.judgeName, technical: v.scoreTechnical, idea: v.scoreIdea, presentation: v.scorePresentation, total: v.total, publicComment: v.comments, privateComment: v.privateNotes });
                });
            });
            X.download('igniteai-scores-' + sid() + '.csv', X.toCsv(rows, ['entryNumber', 'division', 'track', 'project', 'students', 'average', 'award', 'judge', 'technical', 'idea', 'presentation', 'total', 'publicComment', 'privateComment']), 'text/csv');
        });
    };

    // =====================================================================
    // Results (public page)
    // =====================================================================
    TABS.results = function () {
        var winners = S.projects.filter(function (p) { return p.award; });
        main.innerHTML = head('Results', 'Publishing copies the awards below to the public results page. Nothing is public until you press Publish.',
            '<a class="pbtn" href="../results.html?season=' + encodeURIComponent(sid()) + '" target="_blank">Open public page ↗</a>') +
            '<div class="panel"><h2>Publish</h2><div class="f" style="max-width:420px"><label>How student names appear publicly</label><select id="res-names"><option value="full">Full name — Ada Lee</option><option value="initial" selected>First name and last initial — Ada L.</option><option value="none">No names, project titles only</option></select></div>' +
            '<div class="p-actions"><button class="pbtn primary" id="res-pub"' + (winners.length ? '' : ' disabled') + '>Publish ' + winners.length + ' result' + (winners.length === 1 ? '' : 's') + '</button><button class="pbtn danger" id="res-unpub">Unpublish everything</button></div><p id="res-state" style="color:var(--muted);font-size:13.5px;margin-top:10px"></p></div>' +
            '<div class="tbl-wrap">' + (winners.length ? '<table class="tbl"><thead><tr><th>Division</th><th>Track</th><th>Award</th><th>Project</th><th>Students</th></tr></thead><tbody>' +
                winners.sort(sortWinners).map(function (p) { return '<tr><td>' + esc(X.divLabel(p.division)) + '</td><td>' + esc(p.track) + '</td><td><span class="tag gold">' + esc(p.award) + '</span></td><td><b>' + esc(p.title) + '</b></td><td>' + esc(p.members) + '</td></tr>'; }).join('') +
                '</tbody></table>' : '<div class="empty">No awards recorded yet. Set them on the Scores &amp; awards tab.</div>') + '</div>';

        X.listAll(T.res, X.inSeason(sid())).then(function (rows) { $('#res-state').textContent = rows.length ? rows.length + ' result(s) are public right now.' : 'Nothing is public right now.'; }, function () {});

        function clearPublic() {
            return X.listAll(T.res, X.inSeason(sid())).then(function (rows) { return X.pool(rows, function (r) { return X.deleteRow(T.res, r.$id); }, 3); });
        }
        $('#res-unpub').addEventListener('click', function () {
            if (!confirm('Remove all results from the public page?')) return;
            clearPublic().then(function () { X.toast('Results unpublished.'); route(); }, X.fail);
        });
        $('#res-pub').addEventListener('click', function () {
            var mode = $('#res-names').value;
            if (!confirm('Publish ' + winners.length + ' result(s) to the public results page? This replaces whatever is there now.')) return;
            var pg = progressPanel('Publishing results');
            clearPublic().then(function () {
                return X.pool(winners, function (p) {
                    var people = []; regsOf(p).forEach(function (r) { studentsOf(r).forEach(function (x) { people.push(mode === 'full' ? x.name : shortName(x.name)); }); });
                    var names = mode === 'none' ? '' : people.join(', ');
                    var ai = CFG.AWARDS.indexOf(p.award);
                    return X.createRow(T.res, { season: sid(), projectId: p.$id, title: p.title, division: p.division, track: p.track, award: p.award, place: p.place || null, students: names.slice(0, 800) || null, country: mode === 'none' ? null : (p.country || null), sort: ai === -1 ? 50 : ai });
                }, 3, function (a, b) { pg.tick(a, b, 'Results'); });
            }).then(function (res) {
                var bad = res.filter(function (r) { return !r.ok; });
                pg.done('<div class="note ok">Published ' + (res.length - bad.length) + ' result(s). <a href="../results.html?season=' + encodeURIComponent(sid()) + '" target="_blank" style="text-decoration:underline">View the public page</a>.</div>' + (bad.length ? '<div class="note">' + bad.length + ' failed: ' + esc(bad[0].error.message) + '</div>' : ''));
            }, X.fail);
        });
    };
    function sortWinners(a, b) {
        var ai = CFG.AWARDS.indexOf(a.award), bi = CFG.AWARDS.indexOf(b.award);
        return divIndex(a.division) - divIndex(b.division) || a.track.localeCompare(b.track) || (ai === -1 ? 50 : ai) - (bi === -1 ? 50 : bi);
    }

    // =====================================================================
    // Notifications
    // =====================================================================
    var TEMPLATES = {
        blank: { name: 'Blank message', subject: '', body: '' },
        received: { name: 'Application received (resend confirmation)', subject: 'Entry #{{entryNumber}}: we received your {{eventName}} application', body: 'Hello,\n\nThank you — we received the {{eventName}} application for {{studentFullNames}}.\n\nProject: {{projectTitle}}\nTrack: {{track}}\nDivision: Grade {{division}}\nEntry number: {{entryNumber}}\n\nFinal interviews take place online on {{interviewDate}}. We will email this address with the details.\n\nQuestions? Just reply to this email.\n\nThe IgniteAI Expo team' },
        accepted: { name: 'Application accepted', subject: 'Entry #{{entryNumber}}: accepted to {{eventName}}', body: 'Hello,\n\nGood news — “{{projectTitle}}” by {{studentNames}} has been accepted to {{eventName}} in the {{track}} track, Grade {{division}} division.\n\nFinal interviews take place online on {{interviewDate}}. We will send the Zoom link and schedule shortly.\n\nThe IgniteAI Expo team' },
        interview: { name: 'Interview details', subject: 'Entry #{{entryNumber}}: your final interview — {{interviewDate}}', body: 'Hello,\n\n{{studentNames}} will present “{{projectTitle}}” to our judges.\n\nWhen: {{interviewDate}}\nYour time slot: {{interviewTime}}\nZoom link (Grade {{division}}): {{zoomLink}}\n\nPlease join a few minutes early. Have a live, working demo ready, and keep a backup video just in case. Judges will ask how the project was built, so be ready to explain it.\n\nGood luck!\nThe IgniteAI Expo team' },
        results: { name: 'Results announced', subject: '{{eventName}} results are out', body: 'Hello,\n\nThe {{eventName}} results have been announced:\n{{siteUrl}}/results.html?season={{season}}\n\nThank you to {{studentNames}} for presenting “{{projectTitle}}”. Every project this year took real work and imagination, and the judges were impressed.\n\nCertificates will follow in a separate email.\n\nThe IgniteAI Expo team' },
        winner: { name: 'Congratulations to a winner', subject: 'Congratulations — {{award}} at {{eventName}}', body: 'Hello,\n\nCongratulations! “{{projectTitle}}” earned the {{award}} in the {{track}} track, Grade {{division}} division, at {{eventName}}.\n\nFull results: {{siteUrl}}/results.html?season={{season}}\n\nCertificates:\n{{certificateUrl}}\n\nWe hope to see another project next year.\n\nThe IgniteAI Expo team' },
        certificate: { name: 'Your certificate is ready', subject: 'Your {{eventName}} certificate', body: 'Hello,\n\nThank you for taking part in {{eventName}}. The certificate for {{studentNames}} is ready to view and download:\n\n{{certificateUrl}}\n\nThe IgniteAI Expo team' }
    };
    var AUDIENCES = {
        all: ['Everyone who registered', function () { return true; }],
        active: ['Everyone except rejected / withdrawn', function (r) { return r.status !== 'rejected' && r.status !== 'withdrawn'; }],
        accepted: ['Accepted registrations', function (r) { return r.status === 'accepted'; }],
        finalists: ['Finalists', function (r, p) { return p && p.status === 'finalist'; }],
        winners: ['Award winners', function (r, p) { return p && p.award; }],
        nonwinners: ['Participants without an award', function (r, p) { return r.status !== 'rejected' && r.status !== 'withdrawn' && !(p && p.award); }],
        withcert: ['Anyone who has a certificate', function (r) { return !!bestCert(r); }]
    };
    // Not families: organizers, and a single test inbox. Fill-ins use a sample entry (the first matching family).
    var TEST_EMAIL = 'yu.sun.cs@gmail.com';
    var PEOPLE = {
        admins: ['All admins', function () { return S.admins.filter(function (m) { return m.confirm && m.userEmail; }).map(function (m) { return m.userEmail; }); }],
        test: ['Test: ' + TEST_EMAIL + ' only', function () { return [TEST_EMAIL]; }]
    };
    // Best certificate for each student in an entry (award beats finalist beats participation).
    function certsFor(r) {
        var order = { award: 0, finalist: 1, participation: 2 }, best = {};
        S.certs.filter(function (c) { return c.registrationId === r.$id; }).forEach(function (c) {
            if (!best[c.recipientName] || order[c.kind] < order[best[c.recipientName].kind]) best[c.recipientName] = c;
        });
        return Object.keys(best).map(function (k) { return best[k]; });
    }
    function bestCert(r) { return certsFor(r)[0] || null; }
    function zoomFor(division) { return S.settings[{ 'K-3': 'zoomK3', '4-6': 'zoom46', '7-8': 'zoom78', '9-12': 'zoom912' }[division]] || ''; }
    function mergeFields(r) {
        var p = r.projectId ? byId(S.projects, r.projectId) : null, certs = certsFor(r), site = (S.settings.siteUrl || 'https://igniteaiexpo.org').replace(/\/$/, '');
        var people = studentsOf(r), firsts = people.map(function (x) { return x.name.split(/\s+/)[0]; });
        var links = certs.map(function (c) { return (certs.length > 1 ? c.recipientName + ': ' : '') + site + '/certificate.html?id=' + c.$id; }).join('\n');
        return {
            studentNames: joinNames(firsts), studentFullNames: joinNames(people.map(function (x) { return x.name; })), teamName: r.teamName || '',
            firstName: r.firstName, lastName: r.lastName, parentName: r.parentName, projectTitle: (p && p.title) || r.projectTitle, track: (p && p.track) || r.track,
            division: String((p && p.division) || r.division).replace('-', '–'), award: (p && p.award) || '', interviewDate: S.settings.interviewDate || '', interviewTime: (p && p.interviewTime) || 'to be confirmed',
            zoomLink: zoomFor((p && p.division) || r.division) || '(link to follow)', certificateUrl: links || '(certificate not issued yet)', season: sid(), entryNumber: r.entryNumber || '', confirmationId: r.entryNumber || '', eventName: S.season.name, siteUrl: site
        };
    }
    function fill(text, fields) { return text.replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) { return fields[k] != null ? fields[k] : m; }); }

    TABS.notify = function () {
        var emailNote = !S.email ? '<div class="note">Checking whether email is set up…</div>'
            : S.email.configured ? '<div class="note ok">Email is set up. Messages are sent from <b>' + esc(S.email.from) + '</b>, with replies going to ' + esc(S.settings.replyTo || 'the same address') + '.</div>'
            : '<div class="note"><b>Email sending is not set up yet.</b> You can still write a message and use “Copy addresses” or “Export mail-merge CSV” to send it from your own mail program. To send from here, see <a href="#settings" style="text-decoration:underline">Settings</a>.</div>';
        main.innerHTML = head('Notifications', 'Email families. One message per entry (a team gets one), with their details filled in. It goes to the contact address, with the student copied if they gave an email.') + emailNote +
            '<div class="grid2"><div class="panel"><h2>Compose</h2>' +
            '<div class="frow"><div class="f"><label>To</label><select id="n-aud"><optgroup label="Families">' + Object.keys(AUDIENCES).map(function (k) { return '<option value="' + k + '"' + (k === 'active' ? ' selected' : '') + '>' + esc(AUDIENCES[k][0]) + '</option>'; }).join('') + '</optgroup>' +
                '<optgroup label="Organizers">' + Object.keys(PEOPLE).map(function (k) { return '<option value="' + k + '">' + esc(PEOPLE[k][0]) + '</option>'; }).join('') + '</optgroup></select></div>' +
            '<div class="f"><label>Start from</label><select id="n-tpl">' + Object.keys(TEMPLATES).map(function (k) { return '<option value="' + k + '">' + esc(TEMPLATES[k].name) + '</option>'; }).join('') + '</select></div>' +
            '<div class="f"><label>Division</label><select id="n-div">' + X.opts(CFG.DIVISIONS, '', 'All divisions') + '</select></div><div class="f"><label>Track</label><select id="n-track">' + X.opts(CFG.TRACKS, '', 'All tracks') + '</select></div></div>' +
            '<div class="f"><label>Subject</label><input id="n-subject"></div><div class="f"><label>Message</label><textarea id="n-body" style="min-height:260px"></textarea>' +
            '<small>Fill-ins: {{studentNames}} {{studentFullNames}} {{teamName}} {{parentName}} {{projectTitle}} {{track}} {{division}} {{award}} {{interviewDate}} {{interviewTime}} {{zoomLink}} {{certificateUrl}} {{entryNumber}} {{eventName}} {{siteUrl}}</small></div>' +
            '<div class="p-actions"><button class="pbtn primary" id="n-send">Send</button><button class="pbtn" id="n-test">Send a test to me</button><button class="pbtn" id="n-copy">Copy addresses</button><button class="pbtn" id="n-csv">Export mail-merge CSV</button></div></div>' +
            '<div class="panel"><h2>Preview <small id="n-count"></small></h2><div id="n-preview"></div></div></div>' +
            '<h2 style="font-family:var(--body);font-size:16px;margin:8px 0 10px">Sent</h2><div class="tbl-wrap">' + (S.notifs.length ? '<table class="tbl"><thead><tr><th>When</th><th>Subject</th><th>To</th><th class="num">Sent</th><th class="num">Failed</th><th>By</th></tr></thead><tbody>' +
                S.notifs.map(function (n) { return '<tr><td>' + esc(X.fmtDate(n.$createdAt)) + '</td><td><b>' + esc(n.subject) + '</b>' + (n.errors ? '<small>' + esc(n.errors.slice(0, 160)) + '</small>' : '') + '</td><td>' + esc(n.audience) + '</td><td class="num">' + (n.sentCount || 0) + '</td><td class="num">' + (n.failedCount || 0) + '</td><td>' + esc(n.sentBy) + '</td></tr>'; }).join('') +
                '</tbody></table>' : '<div class="empty">Nothing sent yet.</div>') + '</div>';

        function families(key) {
            var aud = AUDIENCES[key][1], dv = $('#n-div').value, tr = $('#n-track').value;
            return S.regs.filter(function (r) {
                var p = r.projectId ? byId(S.projects, r.projectId) : null;
                if (dv && ((p && p.division) || r.division) !== dv) return false;
                if (tr && ((p && p.track) || r.track) !== tr) return false;
                return r.parentEmail && aud(r, p);
            });
        }
        // Everyone this message goes to: { to, cc, fields } — a family with its own fill-ins, or an organizer.
        function recipients() {
            var key = $('#n-aud').value;
            if (PEOPLE[key]) {
                var sample = families('active')[0], f = sample ? mergeFields(sample) : { eventName: S.season.name, siteUrl: (S.settings.siteUrl || 'https://igniteaiexpo.org').replace(/\/$/, ''), season: sid(), interviewDate: S.settings.interviewDate || '' };
                return PEOPLE[key][1]().map(function (email) { return { to: email, fields: f, sample: sample }; });
            }
            return families(key).map(function (r) { return { to: r.parentEmail, cc: r.studentEmail || undefined, fields: mergeFields(r), reg: r }; });
        }
        function audienceLabel() { var k = $('#n-aud').value; return PEOPLE[k] ? PEOPLE[k][0] : AUDIENCES[k][0] + ($('#n-div').value ? ' · ' + X.divLabel($('#n-div').value) : '') + ($('#n-track').value ? ' · ' + $('#n-track').value : ''); }
        function preview() {
            var list = recipients(), x = list[0];
            $('#n-count').textContent = list.length + ' recipient' + (list.length === 1 ? '' : 's');
            if (!list.length) { $('#n-preview').innerHTML = '<div class="empty">Nobody matches.</div>'; return; }
            var to = PEOPLE[$('#n-aud').value] ? list.map(function (y) { return y.to; }).join(', ') : x.to;
            $('#n-preview').innerHTML = (x.sample ? '<div class="note" style="font-size:13px">Fill-ins use entry #' + esc(x.sample.entryNumber) + ' as a sample, so you see what a family would get.</div>' : '') +
                '<dl class="kv"><dt>To</dt><dd>' + esc(to) + (x.cc ? ' <span style="color:var(--muted)">cc ' + esc(x.cc) + '</span>' : '') + '</dd><dt>Subject</dt><dd><b>' + esc(fill($('#n-subject').value, x.fields)) + '</b></dd></dl><div class="prose" style="margin:0">' + esc(fill($('#n-body').value, x.fields)) + '</div>';
        }
        ['n-aud', 'n-div', 'n-track'].forEach(function (id) { $('#' + id).addEventListener('change', preview); });
        $('#n-aud').addEventListener('change', function () { var org = !!PEOPLE[this.value]; $('#n-div').disabled = $('#n-track').disabled = org; });
        ['n-subject', 'n-body'].forEach(function (id) { $('#' + id).addEventListener('input', preview); });
        $('#n-tpl').addEventListener('change', function () { var t = TEMPLATES[this.value]; $('#n-subject').value = t.subject; $('#n-body').value = t.body; preview(); });
        preview();

        function compose(list) {
            var subject = $('#n-subject').value.trim(), body = $('#n-body').value.trim();
            if (!subject || !body) { X.toast('Write a subject and a message first.', true); return null; }
            return list.map(function (x) { return { to: x.to, cc: x.cc, subject: fill(subject, x.fields), text: fill(body, x.fields) }; });
        }
        $('#n-copy').addEventListener('click', function () {
            var list = recipients().map(function (x) { return x.to; }).filter(function (e, i, a) { return a.indexOf(e) === i; });
            navigator.clipboard.writeText(list.join(', ')).then(function () { X.toast(list.length + ' address(es) copied. Paste them into BCC.'); }, X.fail);
        });
        $('#n-csv').addEventListener('click', function () {
            X.download('igniteai-mail-merge.csv', X.toCsv(recipients().map(function (x) { var f = Object.assign({}, x.fields); f.email = x.to; f.studentEmail = x.cc || ''; return f; }),
                ['email', 'studentEmail', 'studentNames', 'studentFullNames', 'teamName', 'parentName', 'projectTitle', 'track', 'division', 'award', 'interviewDate', 'interviewTime', 'zoomLink', 'certificateUrl', 'entryNumber']), 'text/csv');
        });
        $('#n-test').addEventListener('click', function () {
            var list = recipients(); if (!list.length) return X.toast('Nobody matches, so there is nothing to preview.', true);
            var msgs = compose([list[0]]); if (!msgs) return;
            msgs[0].to = S.me.user.email; msgs[0].cc = undefined; msgs[0].subject = '[TEST] ' + msgs[0].subject;
            X.callFn({ action: 'sendEmails', season: sid(), eventName: S.season.name, messages: msgs }).then(function (r) {
                if (!r.ok) return X.toast(r.message, true);
                X.toast(r.results[0].ok ? 'Test sent to ' + S.me.user.email + '.' : 'Test failed: ' + r.results[0].error, !r.results[0].ok);
            }, X.fail);
        });
        $('#n-send').addEventListener('click', function () {
            var list = recipients(), msgs = compose(list); if (!msgs) return;
            if (!list.length) return X.toast('Nobody matches.', true);
            if (!confirm('Send this email to ' + list.length + ' recipient(s) now?')) return;
            var chunks = []; for (var i = 0; i < msgs.length; i += 10) chunks.push(msgs.slice(i, i + 10));
            var pg = progressPanel('Sending email'), sent = 0, failed = [], fatal = null;
            X.pool(chunks, function (chunk) {
                if (fatal) return null;
                return X.callFn({ action: 'sendEmails', season: sid(), eventName: S.season.name, messages: chunk }).then(function (r) {
                    if (!r.ok) { fatal = r.message; return; }
                    r.results.forEach(function (x) { if (x.ok) sent++; else failed.push(x.to + ': ' + x.error); });
                });
            }, 1, function (a, b) { pg.tick(Math.min(a * 10, msgs.length), msgs.length, 'Emails'); }).then(function () {
                return X.createRow(T.notif, { season: sid(), subject: $('#n-subject').value.trim().slice(0, 300), body: $('#n-body').value.slice(0, 10000), audience: audienceLabel().slice(0, 300), recipientCount: msgs.length, sentCount: sent, failedCount: failed.length, status: fatal ? 'failed' : (failed.length ? 'partial' : 'sent'), sentBy: (S.me.user.name || S.me.user.email).slice(0, 120), errors: (fatal || failed.join(' | ')).slice(0, 4000) || null });
            }).then(function (row) {
                S.notifs.unshift(row);
                pg.done(fatal ? '<div class="note"><b>Stopped:</b> ' + esc(fatal) + '</div>' : '<div class="note ok">Sent <b>' + sent + '</b> of ' + msgs.length + '.</div>' + (failed.length ? '<div class="note"><b>' + failed.length + ' failed:</b><br>' + failed.map(esc).join('<br>') + '</div>' : ''));
            }, X.fail);
        });
    };

    // =====================================================================
    // Certificates
    // =====================================================================
    function certData(c) { var o = X.clean(c); o.id = c.$id; return o; }

    TABS.certificates = function () {
        var signer = S.settings.signerName;
        main.innerHTML = head('Certificates', 'One certificate per student — every member of a team gets their own. Each has a private link the family can open to view and download the PDF.',
            '<button class="pbtn" id="c-zip"' + (S.certs.length ? '' : ' disabled') + '>Download all as ZIP</button><button class="pbtn" id="c-links"' + (S.certs.length ? '' : ' disabled') + '>Export links CSV</button>') +
            (signer ? '' : '<div class="note">No signer name is set, so the signature line will be blank. Add one in <a href="#settings" style="text-decoration:underline">Settings</a> before issuing.</div>') +
            '<div class="panel"><h2>Issue certificates</h2><div class="p-actions">' +
            '<button class="pbtn primary" data-issue="award">Award certificates for winners</button><button class="pbtn" data-issue="finalist">Finalist certificates</button><button class="pbtn" data-issue="participation">Participation for everyone</button></div>' +
            '<p style="color:var(--muted);font-size:13.5px;margin-top:10px">Safe to press again — people who already have that certificate are skipped. Signed by <b>' + esc(signer || '—') + '</b>, ' + esc(S.settings.signerTitle || '') + ', dated ' + esc(S.settings.issuedOn || '—') + '.</p></div>' +
            '<div class="tbl-wrap">' + (S.certs.length ? '<table class="tbl"><thead><tr><th>Recipient</th><th>Type</th><th>Award</th><th>Project</th><th></th></tr></thead><tbody>' +
                S.certs.slice().sort(function (a, b) { return a.recipientName.localeCompare(b.recipientName); }).map(function (c) {
                    return '<tr><td><b>' + esc(c.recipientName) + '</b><small>' + esc(X.divLabel(c.division)) + '</small></td><td><span class="tag ' + (c.kind === 'award' ? 'gold' : c.kind === 'finalist' ? 'blue' : '') + '">' + esc(c.kind) + '</span></td><td>' + esc(c.awardText || '') + '</td><td>' + esc(c.projectTitle) + '</td>' +
                        '<td class="num"><button class="pbtn sm" data-view="' + c.$id + '">Preview</button> <button class="pbtn sm" data-pdf="' + c.$id + '">PDF</button> <button class="pbtn sm" data-link="' + c.$id + '">Copy link</button> <button class="pbtn sm danger" data-cdel="' + c.$id + '">Delete</button></td></tr>';
                }).join('') + '</tbody></table>' : '<div class="empty">No certificates issued yet.</div>') + '</div>';

        $$('[data-issue]').forEach(function (b) { b.addEventListener('click', function () { issue(b.getAttribute('data-issue')); }); });
        $$('[data-view]').forEach(function (b) {
            b.addEventListener('click', function () {
                var c = byId(S.certs, b.getAttribute('data-view')), d = openDrawer('<h2>' + esc(c.recipientName) + '</h2><p class="sub">' + esc(ExpoCert.TITLES[c.kind]) + '</p><div id="c-canvas">Rendering…</div>');
                ExpoCert.draw(certData(c)).then(function (cv) { cv.style.cssText = 'width:100%;height:auto;border:1px solid var(--line);border-radius:6px'; $('#c-canvas', d).innerHTML = ''; $('#c-canvas', d).appendChild(cv); }, X.fail);
            });
        });
        $$('[data-pdf]').forEach(function (b) {
            b.addEventListener('click', function () { var c = certData(byId(S.certs, b.getAttribute('data-pdf'))); ExpoCert.pdf(c).then(function (blob) { X.download(ExpoCert.filename(c), blob); }, X.fail); });
        });
        $$('[data-link]').forEach(function (b) {
            b.addEventListener('click', function () { navigator.clipboard.writeText(certUrl(b.getAttribute('data-link'))).then(function () { X.toast('Link copied.'); }, X.fail); });
        });
        $$('[data-cdel]').forEach(function (b) {
            b.addEventListener('click', function () {
                var c = byId(S.certs, b.getAttribute('data-cdel'));
                if (!confirm('Delete ' + c.recipientName + '\'s certificate? Their link will stop working.')) return;
                X.deleteRow(T.cert, c.$id).then(function () { S.certs.splice(S.certs.indexOf(c), 1); counts(); route(); }, X.fail);
            });
        });
        $('#c-links').addEventListener('click', function () {
            X.download('igniteai-certificate-links.csv', X.toCsv(S.certs.map(function (c) { var o = X.clean(c); o.link = certUrl(c.$id); return o; }), ['recipientName', 'email', 'kind', 'awardText', 'projectTitle', 'division', 'track', 'link']), 'text/csv');
        });
        $('#c-zip').addEventListener('click', function () {
            var zip = new JSZip(), pg = progressPanel('Rendering certificates'), used = {};
            X.pool(S.certs, function (c) {
                var data = certData(c);
                return ExpoCert.pdf(data).then(function (blob) { var name = ExpoCert.filename(data); if (used[name]) name = name.replace('.pdf', '_' + c.$id.slice(-5) + '.pdf'); used[name] = 1; zip.file(name, blob); });
            }, 1, function (a, b) { pg.tick(a, b, 'Certificates'); }).then(function () { return zip.generateAsync({ type: 'blob' }); }).then(function (blob) {
                X.download('igniteai-certificates-' + sid() + '.zip', blob);
                pg.done('<div class="note ok">ZIP downloaded.</div>');
            }, X.fail);
        });
    };
    function certUrl(id) { return (S.settings.siteUrl || X.siteBase()).replace(/\/$/, '') + '/certificate.html?id=' + id; }

    function issue(kind) {
        var todo = [];
        S.regs.forEach(function (r) {
            if (r.status === 'rejected' || r.status === 'withdrawn') return;
            var p = r.projectId ? byId(S.projects, r.projectId) : null;
            if (kind === 'award' && !(p && p.award)) return;
            if (kind === 'finalist' && !(p && p.status === 'finalist')) return;
            var awardText = kind === 'award' ? p.award : null;
            studentsOf(r).forEach(function (st) {
                var has = S.certs.some(function (c) { return c.registrationId === r.$id && c.recipientName === st.name && c.kind === kind && (c.awardText || null) === awardText; });
                if (!has) todo.push({ r: r, p: p, awardText: awardText, name: st.name });
            });
        });
        if (!todo.length) return X.toast('Nobody new needs a ' + kind + ' certificate.');
        if (!confirm('Issue ' + todo.length + ' ' + kind + ' certificate(s)?')) return;
        var pg = progressPanel('Issuing certificates');
        X.pool(todo, function (t) {
            return X.createRow(T.cert, {
                season: sid(), eventName: S.season.name,
                registrationId: t.r.$id, projectId: t.p ? t.p.$id : null, recipientName: t.name.slice(0, 200), kind: kind, awardText: t.awardText,
                projectTitle: ((t.p && t.p.title) || t.r.projectTitle || '').slice(0, 200), division: (t.p && t.p.division) || t.r.division, track: (t.p && t.p.track) || t.r.track,
                issuedOn: S.settings.issuedOn || null, signerName: S.settings.signerName || null, signerTitle: S.settings.signerTitle || null, email: t.r.parentEmail
            }).then(function (row) { S.certs.push(row); });
        }, 3, function (a, b) { pg.tick(a, b, 'Certificates'); }).then(function (res) {
            var bad = res.filter(function (x) { return !x.ok; });
            counts();
            pg.done('<div class="note ok">Issued ' + (res.length - bad.length) + ' certificate(s). To email the links, go to Notifications and start from “Your certificate is ready”.</div>' + (bad.length ? '<div class="note">' + bad.length + ' failed: ' + esc(bad[0].error.message) + '</div>' : ''));
        });
    }

    // =====================================================================
    // Seasons
    // =====================================================================
    function toLocalInput(iso) { if (!iso) return ''; var d = new Date(iso), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }

    TABS.seasons = function () {
        var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* ignore */ }
        main.innerHTML = head('Seasons', 'One season per year. Registrations, projects, reviews, results and certificates all belong to a season, and entry numbers restart at 1000 in each one. The public form always registers people into the <b>current</b> season.') +
            '<div class="tbl-wrap" style="margin-bottom:24px"><table class="tbl"><thead><tr><th>Season</th><th>Application deadline <small style="display:inline;text-transform:none;letter-spacing:0">(' + esc(tz) + ')</small></th><th>Registration</th><th>Current</th><th></th></tr></thead><tbody>' +
            S.seasons.map(function (x) {
                return '<tr data-season="' + esc(x.$id) + '"><td><input class="se-name" value="' + esc(x.name) + '" style="font:inherit;font-weight:600;padding:6px 8px;border:1.5px solid var(--line);border-radius:6px;width:230px"><small>id ' + esc(x.$id) + '</small></td>' +
                    '<td><input class="se-due" type="datetime-local" value="' + toLocalInput(x.applyDeadline) + '" style="font:inherit;padding:6px 8px;border:1.5px solid var(--line);border-radius:6px"></td>' +
                    '<td><label style="display:flex;gap:7px;align-items:center"><input class="se-open" type="checkbox"' + (x.registrationOpen === false ? '' : ' checked') + '> open</label></td>' +
                    '<td>' + (x.isCurrent ? '<span class="tag green">current</span>' : '<button class="pbtn sm se-current">Make current</button>') + '</td>' +
                    '<td class="num"><button class="pbtn sm se-save">Save</button></td></tr>';
            }).join('') + '</tbody></table></div>' +
            '<div class="panel"><h2>Start a new season</h2><div class="toolbar" style="margin:0"><input type="search" id="ns-year" placeholder="Year, e.g. ' + (new Date().getFullYear() + 1) + '" style="max-width:170px"><input type="search" id="ns-name" placeholder="Name (optional)" style="max-width:260px"><button class="pbtn primary" id="ns-go">Create season</button></div>' +
            '<p style="color:var(--muted);font-size:13.5px;margin-top:10px">Copies this season\'s settings (signer, email, site address), starts entry numbers at 1000, and leaves it closed and not current until you are ready. Judges and organizers carry over; past seasons stay available from the season menu.</p></div>';

        $$('[data-season]').forEach(function (tr) {
            var row = byId(S.seasons, tr.getAttribute('data-season'));
            $('.se-save', tr).addEventListener('click', function () {
                var due = $('.se-due', tr).value;
                X.updateRow(T.season, row.$id, { name: $('.se-name', tr).value.trim() || row.name, applyDeadline: due ? new Date(due).toISOString() : null, registrationOpen: $('.se-open', tr).checked })
                    .then(function (r) { S.seasons[S.seasons.indexOf(row)] = r; if (S.season.$id === r.$id) S.season = r; drawSeasonPicker(); X.toast('Season saved.'); route(); }, X.fail);
            });
            var cur = $('.se-current', tr);
            if (cur) cur.addEventListener('click', function () {
                if (!confirm('Make “' + row.name + '” the current season? New registrations from the public form will go into it.')) return;
                var others = S.seasons.filter(function (x) { return x.isCurrent && x.$id !== row.$id; });
                Promise.all(others.map(function (x) { return X.updateRow(T.season, x.$id, { isCurrent: false }); }))
                    .then(function () { return X.updateRow(T.season, row.$id, { isCurrent: true }); })
                    .then(function () { return X.loadSeasons(); })
                    .then(function (se) { S.seasons = se.list; S.season = byId(S.seasons, S.season.$id) || se.active; drawSeasonPicker(); X.toast('Current season changed.'); route(); }, X.fail);
            });
        });
        $('#ns-go').addEventListener('click', function () {
            var year = parseInt($('#ns-year').value, 10);
            if (!(year > 2000 && year < 2200)) return X.toast('Enter a four-digit year.', true);
            var id = String(year), n = 2;
            while (byId(S.seasons, id)) id = year + '-' + n++;
            var name = $('#ns-name').value.trim() || 'IgniteAI Expo ' + year;
            var base = X.clean(S.settings); base.nextEntryNumber = 1000; base.issuedOn = null; base.interviewDate = null;
            ['zoomK3', 'zoom46', 'zoom78', 'zoom912'].forEach(function (k) { base[k] = null; });
            X.createRow(T.season, { name: name, year: year, registrationOpen: false, isCurrent: false }, null, id)
                .then(function () { return X.createRow(T.set, base, null, id); })
                .then(function () { return X.loadSeasons(); })
                .then(function (se) { S.seasons = se.list; drawSeasonPicker(); X.toast('Created “' + name + '”. Set its deadline, open registration, then make it current.'); route(); }, X.fail);
        });
    };

    // =====================================================================
    // Settings
    // =====================================================================
    TABS.settings = function () {
        var s = S.settings, field = function (k, label, hint, type) { return '<div class="f"><label>' + label + '</label><input data-set="' + k + '" type="' + (type || 'text') + '" value="' + esc(s[k]) + '">' + (hint ? '<small>' + hint + '</small>' : '') + '</div>'; };
        main.innerHTML = head('Settings', 'These apply to <b>' + esc(S.season.name) + '</b>. Deadline and open/closed are on the Seasons tab.') +
            '<div class="panel"><h2>Entry numbers <small>' + esc(S.season.name) + '</small></h2><div class="f" style="max-width:260px;margin:0"><label>Next entry number</label><input id="set-next" type="number" min="1000" max="9999" value="' + esc(s.nextEntryNumber || 1000) + '"><small>The next application gets this number. Only change it to tidy up after test entries.</small></div></div>' +
            '<div class="grid2"><div class="panel"><h2>Certificates</h2>' + field('signerName', 'Signed by', 'Printed above the signature line.') + field('signerTitle', 'Signer\'s title') + field('issuedOn', 'Date on certificates') + '</div>' +
            '<div class="panel"><h2>Interviews</h2>' + field('interviewDate', 'Interview date and time', 'Used as {{interviewDate}} in emails.') + field('zoomK3', 'Zoom link · Grade K–3', '', 'url') + field('zoom46', 'Zoom link · Grade 4–6', '', 'url') + field('zoom78', 'Zoom link · Grade 7–8', '', 'url') + field('zoom912', 'Zoom link · Grade 9–12', '', 'url') + '</div></div>' +
            '<div class="panel"><h2>Email</h2><div class="frow">' + field('fromName', 'Sender name') + field('replyTo', 'Replies go to', '', 'email') + field('siteUrl', 'Public site address', 'Used to build certificate and results links.', 'url') +
            '<div class="f"><span class="lbl">Confirmation email</span><label style="font-weight:400;display:flex;gap:8px;align-items:center;padding-top:8px"><input type="checkbox" id="set-auto"' + (s.autoConfirmEmail === false ? '' : ' checked') + '> Email families automatically when an application arrives</label></div></div>' +
            (!S.email ? '<div class="note">Checking email status…</div>' : S.email.configured ? '<div class="note ok">Sending is set up. Messages go out from <b>' + esc(S.email.from) + '</b>.</div>' :
                '<div class="note"><b>Sending is not set up yet.</b> In the Appwrite console open Functions → <code>expo-api</code> → Settings → Environment variables, add these five, then redeploy the function:<br><br><code>SMTP_HOST</code> · <code>SMTP_PORT</code> (587) · <code>SMTP_USER</code> · <code>SMTP_PASS</code> · <code>SMTP_FROM</code> (the address mail comes from)<br><br>Any mail service with SMTP works — a Gmail or Google Workspace account with an app password, your university mail server, SendGrid, Resend, Mailgun and so on.</div>') + '</div>' +
            '<button class="pbtn primary" id="set-save">Save settings</button>';
        $('#set-save').addEventListener('click', function () {
            var next = parseInt($('#set-next').value, 10), highest = S.regs.reduce(function (m, r) { return Math.max(m, r.entryNumber || 0); }, 0);
            if (!(next >= 1000 && next <= 9999)) return X.toast('The next entry number must be between 1000 and 9999.', true);
            if (next <= highest) return X.toast('Entry #' + highest + ' already exists, so the next number must be higher than that.', true);
            var data = { autoConfirmEmail: $('#set-auto').checked, nextEntryNumber: next };
            $$('[data-set]').forEach(function (i) { data[i.getAttribute('data-set')] = i.value.trim() || null; });
            X.updateRow(T.set, sid(), data).then(function (row) { S.settings = row; X.toast('Settings saved.'); }, function (e) {
                if (e.code === 404) return X.createRow(T.set, data, null, sid()).then(function (row) { S.settings = row; X.toast('Settings saved.'); }, X.fail);
                X.fail(e);
            });
        });
    };
})();
