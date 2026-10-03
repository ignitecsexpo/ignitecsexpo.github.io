/* IgniteAI Expo — registration form → Appwrite */
(function () {
    'use strict';

    var APPWRITE = { endpoint: 'https://sfo.cloud.appwrite.io/v1', projectId: '6aae02ba003620a19dd0', functionId: 'expo-api' };

    // Applications are saved by the expo-api function, never written from the browser.
    // It assigns the entry number, enforces the deadline and sends the confirmation email.
    function callServer(body) {
        return fetch(APPWRITE.endpoint + '/functions/' + APPWRITE.functionId + '/executions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': APPWRITE.projectId },
            body: JSON.stringify({ body: JSON.stringify(body), async: false, method: 'POST', headers: { 'content-type': 'application/json' } })
        }).then(function (res) { return res.json(); }).then(function (ex) {
            var out = {};
            try { out = JSON.parse(ex.responseBody || '{}'); } catch (e) { /* fall through */ }
            if (!out.ok && !out.message) out.message = ex.message || 'The server did not respond. Please try again.';
            return out;
        });
    }

    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

    var form = $('#reg-form');
    var notice = $('#reg-notice');
    var msg = $('#form-msg');
    var submitBtn = $('#reg-submit');

    function showNotice(html) { notice.innerHTML = html; notice.hidden = false; }
    function closeForm(html) { showNotice(html); form.hidden = true; }

    // A private late-entry link (?late=<code>) keeps the form open after the deadline; the server checks the code.
    var lateCode = new URLSearchParams(location.search).get('late') || '';
    var lateCheck = lateCode ? callServer({ action: 'checkLate', code: lateCode }).then(function (r) { return !!r.valid; }, function () { return false; }) : Promise.resolve(false);

    // Open or closed? Ask for the current season (public table: name, deadline, open flag).
    var seasonQuery = encodeURIComponent(JSON.stringify({ method: 'equal', attribute: 'isCurrent', values: [true] }));
    fetch(APPWRITE.endpoint + '/tablesdb/expo/tables/seasons/rows?queries[]=' + seasonQuery, { headers: { 'X-Appwrite-Project': APPWRITE.projectId } })
        .then(function (r) { return r.json(); }).then(function (r) {
            var season = r.rows && r.rows[0];
            if (!season) return;
            var due = season.applyDeadline ? new Date(season.applyDeadline) : null;
            if (season.registrationOpen === false || (due && new Date() > due)) return lateCheck.then(function (ok) {
                if (ok) return showNotice('<b>Late entry link.</b> Applications for ' + season.name + ' are closed to the public, but you can still submit yours here.');
                closeForm('Applications for ' + season.name + ' are closed. Questions? Email <a href="mailto:hello@mail.igniteaiexpo.org" style="color:var(--accent)">hello@mail.igniteaiexpo.org</a>.');
            });
        }).catch(function () { /* the server still enforces the deadline on submit */ });

    // ----- Division (a team competes in the division of its highest grade) -----
    var GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    var MAX_MATES = 4; // plus the first student = teams of up to five
    function gradeNum(g) { return g === 'K' ? 0 : parseInt(g, 10); }
    function divisionOf(grade) {
        if (!grade) return '';
        var g = gradeNum(grade);
        if (g <= 3) return 'K-3';
        if (g <= 6) return '4-6';
        if (g <= 8) return '7-8';
        return '9-12';
    }
    function isTeam() { return $('input[name="entryType"]:checked').value === 'team'; }
    function mates() {
        return $$('#roster .mate').map(function (row) {
            return { first: $('.m-first', row).value.trim(), last: $('.m-last', row).value.trim(), grade: $('.m-grade', row).value, row: row };
        });
    }
    function topGrade() {
        var all = [$('#grade').value].concat(isTeam() ? mates().map(function (m) { return m.grade; }) : []).filter(Boolean);
        return all.sort(function (x, y) { return gradeNum(y) - gradeNum(x); })[0] || '';
    }
    function showDivision() {
        var d = divisionOf(topGrade());
        $('#division-note').textContent = d ? (isTeam() ? 'Team division: Grade ' : 'Division: Grade ') + d.replace('-', '–') : '';
    }
    $('#grade').addEventListener('change', showDivision);

    // ----- Team roster -----
    function addMate() {
        if ($$('#roster .mate').length >= MAX_MATES) return;
        var n = $$('#roster .mate').length + 2;
        var row = document.createElement('div');
        row.className = 'mate';
        row.innerHTML = '<div class="field"><label>Student ' + n + ' first name</label><input class="m-first" maxlength="80"></div>' +
            '<div class="field"><label>Last name</label><input class="m-last" maxlength="80"></div>' +
            '<div class="field"><label>Grade</label><select class="m-grade"><option value="">Choose…</option>' +
            GRADES.map(function (g) { return '<option>' + g + '</option>'; }).join('') + '</select></div>' +
            '<button type="button" class="rm" aria-label="Remove this teammate">×</button>';
        $('.rm', row).addEventListener('click', function () { row.remove(); renumber(); showDivision(); });
        $('.m-grade', row).addEventListener('change', showDivision);
        $('#roster').appendChild(row);
        renumber();
    }
    function renumber() {
        $$('#roster .mate').forEach(function (row, i) { $('label', row).textContent = 'Student ' + (i + 2) + ' first name'; });
        $('#add-mate').hidden = $$('#roster .mate').length >= MAX_MATES;
    }
    $('#add-mate').addEventListener('click', addMate);

    function syncTeam() {
        var team = isTeam();
        $$('.team-only').forEach(function (el) { el.hidden = !team; });
        $('#student-legend').textContent = team ? 'Students' : 'Student';
        $('#student-hint').textContent = team ? 'Start with the first student, then add the rest of the team below.' : 'The student who is applying.';
        $('#contact-hint').textContent = team
            ? 'One parent or guardian who will be the contact for the whole team. We send interview details and results to this one address.'
            : 'A parent or guardian. We send interview details and results to this one address.';
        if (team && !$$('#roster .mate').length) addMate();
        showDivision();
    }
    $$('input[name="entryType"]').forEach(function (r) { r.addEventListener('change', syncTeam); });
    syncTeam();

    var summary = $('#projectSummary');
    summary.addEventListener('input', function () { $('#summary-count').textContent = summary.value.length; });

    // ----- Validation -----
    function setError(input, text) {
        var field = input.closest('.field') || input.closest('.check');
        if (!field) return;
        field.classList.toggle('invalid', !!text);
        var err = $('.err', field);
        if (text && !err) {
            err = document.createElement('div');
            err.className = 'err';
            field.appendChild(err);
        }
        if (err) err.textContent = text || '';
    }

    function validate() {
        var firstBad = null;
        var team = isTeam();

        $$('input, select, textarea', form).forEach(function (el) {
            if (el.name === 'website' || el.type === 'radio' || el.closest('.mate')) return;
            var text = '';
            var val = (el.type === 'checkbox') ? el.checked : el.value.trim();
            if (el.required && !val) text = el.type === 'checkbox' ? 'Please confirm to continue.' : 'This field is required.';
            else if (el.id === 'teamName' && team && !val) text = 'Enter your team name.';
            else if (el.id === 'projectSummary' && !val) text = 'Please describe your project.';
            else if (val && (el.type === 'email' || el.type === 'url') && !el.checkValidity()) text = el.type === 'email' ? 'Enter a valid email address.' : 'Enter a full link starting with https://';
            setError(el, text);
            if (text && !firstBad) firstBad = el;
        });

        $('#roster-err').textContent = '';
        if (team) {
            var list = mates();
            if (!list.length) { $('#roster-err').textContent = 'A team needs at least two students. Add a teammate, or choose Individual.'; firstBad = firstBad || $('#add-mate'); }
            list.forEach(function (m) {
                [['.m-first', m.first], ['.m-last', m.last], ['.m-grade', m.grade]].forEach(function (pair) {
                    var el = $(pair[0], m.row);
                    setError(el, pair[1] ? '' : 'Required.');
                    if (!pair[1] && !firstBad) firstBad = el;
                });
            });
        }
        return firstBad;
    }

    form.addEventListener('input', function (e) {
        var f = e.target.closest('.field.invalid, .check.invalid');
        if (f) setError(e.target, '');
    });

    // ----- Submit -----
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        msg.textContent = '';
        if (form.website.value) return; // bot

        var bad = validate();
        if (bad) {
            msg.textContent = 'Please fix the highlighted fields.';
            bad.focus();
            return;
        }

        var v = function (id) { var s = $('#' + id).value.trim(); return s === '' ? null : s; };
        var team = isTeam();
        var roster = team ? mates() : [];

        var data = {
            firstName: v('firstName'),
            lastName: v('lastName'),
            grade: v('grade'),
            school: v('school'),
            city: v('city'),
            country: v('country'),
            studentEmail: v('studentEmail'),
            parentName: v('parentName'),
            parentEmail: v('parentEmail'),
            parentPhone: v('parentPhone'),
            projectTitle: v('projectTitle'),
            track: v('track'),
            xField: v('xField'),
            entryType: team ? 'team' : 'individual',
            teamName: team ? v('teamName') : null,
            memberNames: roster.map(function (m) { return (m.first + ' ' + m.last).slice(0, 160); }),
            memberGrades: roster.map(function (m) { return m.grade; }),
            projectSummary: v('projectSummary'),
            agreedToRules: true,
            parentApproved: true
        };

        submitBtn.disabled = true;
        submitBtn.firstChild.textContent = 'Submitting… ';

        callServer({ action: 'register', data: data, late: lateCode || undefined }).then(function (out) {
            if (out.closed) { closeForm(out.message); window.scrollTo(0, 0); return; }
            if (!out.ok) throw new Error(out.message);
            form.hidden = true;
            $('.reg-hero').hidden = true;
            $('#done-name').textContent = data.firstName;
            $('#done-id').textContent = out.entryNumber;
            $('#done-email').textContent = data.parentEmail;
            $('#done-emailed').hidden = !out.emailed;
            $('#reg-done').hidden = false;
            window.scrollTo(0, 0);
        }).catch(function (err) {
            submitBtn.disabled = false;
            submitBtn.firstChild.textContent = 'Submit application ';
            msg.textContent = 'Sorry, we could not submit your application. Your answers are still here — please try again, or email hello@mail.igniteaiexpo.org. (' + err.message + ')';
        });
    });
})();
