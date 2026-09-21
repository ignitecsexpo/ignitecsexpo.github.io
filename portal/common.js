/* IgniteAI Expo portal — shared Appwrite client + helpers (admin, judge, sign-in) */
var EXPO = (function () {
    'use strict';

    var CFG = {
        endpoint: 'https://sfo.cloud.appwrite.io/v1',
        projectId: '6aae02ba003620a19dd0',
        db: 'expo',
        fn: 'expo-api',
        T: {
            season: 'seasons', reg: 'registrations', proj: 'projects', rev: 'reviews', res: 'results',
            cert: 'certificates', notif: 'notifications', set: 'settings', judge: 'judges'
        },
        TRACKS: ['Artificial Intelligence', 'Data Science', 'Business & Entrepreneurship', 'Game & Animation', 'Robotics',
            'Hardware & Electronics', 'Mobile & Web', 'Algorithms', 'Cyber Security', 'Software & Systems'],
        DIVISIONS: ['K-3', '4-6', '7-8', '9-12'],
        AWARDS: ['First Place', 'Second Place', 'Third Place', 'Fourth Place', 'Fifth Place',
            'Innovative Project Award', 'Best Teamwork Award', 'Distinguished Ideas Award',
            "People's Choice Award", 'Project of the Year']
    };

    var A = window.Appwrite;
    var client = new A.Client().setEndpoint(CFG.endpoint).setProject(CFG.projectId);
    var account = new A.Account(client);
    var tables = new A.TablesDB(client);
    var teams = new A.Teams(client);
    var functions = new A.Functions(client);
    var Query = A.Query, ID = A.ID, Permission = A.Permission, Role = A.Role;

    // ----- data -----
    function listAll(tableId, queries) {
        var out = [];
        function page(cursor) {
            var q = (queries || []).concat([Query.limit(100)]);
            if (cursor) q.push(Query.cursorAfter(cursor));
            return tables.listRows({ databaseId: CFG.db, tableId: tableId, queries: q }).then(function (r) {
                out = out.concat(r.rows);
                if (r.rows.length === 100) return page(r.rows[r.rows.length - 1].$id);
                return out;
            });
        }
        return page(null);
    }
    function createRow(tableId, data, permissions, rowId) {
        var p = { databaseId: CFG.db, tableId: tableId, rowId: rowId || ID.unique(), data: data };
        if (permissions) p.permissions = permissions;
        return tables.createRow(p);
    }
    function updateRow(tableId, rowId, data) {
        return tables.updateRow({ databaseId: CFG.db, tableId: tableId, rowId: rowId, data: data });
    }
    function deleteRow(tableId, rowId) {
        return tables.deleteRow({ databaseId: CFG.db, tableId: tableId, rowId: rowId });
    }
    function getRow(tableId, rowId) {
        return tables.getRow({ databaseId: CFG.db, tableId: tableId, rowId: rowId });
    }
    // Strip Appwrite's $-prefixed system fields before sending a row back.
    function clean(row) {
        var o = {};
        Object.keys(row).forEach(function (k) { if (k.charAt(0) !== '$') o[k] = row[k]; });
        return o;
    }
    // Run promise-returning jobs a few at a time (keeps us under rate limits).
    function pool(items, worker, size, onProgress) {
        var i = 0, done = 0, results = [];
        return new Promise(function (resolve) {
            function next() {
                if (i >= items.length) { if (done === items.length) resolve(results); return; }
                var idx = i++;
                Promise.resolve().then(function () { return worker(items[idx], idx); })
                    .then(function (r) { results[idx] = { ok: true, value: r }; },
                          function (e) { results[idx] = { ok: false, error: e }; })
                    .then(function () { done++; if (onProgress) onProgress(done, items.length); next(); });
            }
            if (!items.length) return resolve(results);
            for (var k = 0; k < Math.min(size || 4, items.length); k++) next();
        });
    }

    function callFn(body) {
        return functions.createExecution({
            functionId: CFG.fn, body: JSON.stringify(body), async: false, method: 'POST',
            headers: { 'content-type': 'application/json' }
        }).then(function (ex) {
            var out;
            try { out = JSON.parse(ex.responseBody || '{}'); } catch (e) { out = { ok: false, message: 'Bad response from server function.' }; }
            if (ex.status === 'failed' && !out.message) out = { ok: false, message: 'Server function failed. Check the function logs in Appwrite.' };
            return out;
        });
    }

    // ----- auth -----
    function me() {
        return account.get().then(function (user) {
            return teams.list().then(function (t) {
                var ids = t.teams.map(function (x) { return x.$id; });
                return { user: user, isAdmin: ids.indexOf('admins') > -1, isJudge: ids.indexOf('judges') > -1 };
            });
        });
    }
    function requireRole(role) {
        return me().then(function (m) {
            if ((role === 'admin' && !m.isAdmin) || (role === 'judge' && !m.isJudge && !m.isAdmin)) {
                location.replace('./?denied=1');
                return new Promise(function () {});
            }
            return m;
        }, function () {
            location.replace('./');
            return new Promise(function () {});
        });
    }
    function signOut() {
        return account.deleteSession({ sessionId: 'current' }).catch(function () {}).then(function () { location.href = './'; });
    }

    // ----- ui helpers -----
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function $(s, r) { return (r || document).querySelector(s); }
    function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
    var toastTimer;
    function toast(text, isErr) {
        var t = $('#toast');
        if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
        t.className = 'toast' + (isErr ? ' err' : '');
        t.textContent = text;
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.hidden = true; }, isErr ? 7000 : 3200);
    }
    function fail(e) { console.error(e); toast((e && e.message) || String(e), true); }
    function fmtDate(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    function opts(list, selected, blank) {
        return (blank != null ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(function (v) {
            return '<option' + (v === selected ? ' selected' : '') + '>' + esc(v) + '</option>';
        }).join('');
    }
    function download(filename, content, type) {
        var blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }
    function toCsv(rows, cols) {
        var cell = function (v) {
            v = v == null ? '' : (Array.isArray(v) ? v.join('; ') : String(v));
            if (/^[=+\-@]/.test(v)) v = "'" + v; // stop spreadsheet formula injection
            return '"' + v.replace(/"/g, '""') + '"';
        };
        return '﻿' + [cols.map(cell).join(',')].concat(rows.map(function (r) {
            return cols.map(function (c) { return cell(r[c]); }).join(',');
        })).join('\r\n');
    }
    // ----- seasons: every row carries a `season` id; the portal works in one season at a time -----
    function loadSeasons() {
        return listAll(CFG.T.season, [Query.orderDesc('year')]).then(function (list) {
            var saved = null;
            try { saved = localStorage.getItem('expoSeason'); } catch (e) { /* ignore */ }
            var current = list.filter(function (x) { return x.isCurrent; })[0] || list[0] || null;
            var active = list.filter(function (x) { return x.$id === saved; })[0] || current;
            return { list: list, current: current, active: active };
        });
    }
    function rememberSeason(id) { try { localStorage.setItem('expoSeason', id); } catch (e) { /* ignore */ } }
    function inSeason(id, queries) { return [Query.equal('season', id)].concat(queries || []); }

    function divLabel(d) { return d ? 'Grade ' + String(d).replace('-', '–') : ''; }
    function siteBase() { return location.origin + location.pathname.replace(/portal\/[^/]*$/, ''); }

    return {
        CFG: CFG, account: account, tables: tables, teams: teams, Query: Query, ID: ID, Permission: Permission, Role: Role,
        listAll: listAll, createRow: createRow, updateRow: updateRow, deleteRow: deleteRow, getRow: getRow, clean: clean, pool: pool,
        callFn: callFn, me: me, requireRole: requireRole, signOut: signOut,
        esc: esc, $: $, $$: $$, toast: toast, fail: fail, fmtDate: fmtDate, opts: opts, download: download, toCsv: toCsv,
        divLabel: divLabel, siteBase: siteBase, loadSeasons: loadSeasons, rememberSeason: rememberSeason, inSeason: inSeason
    };
})();
