/* IgniteAI Expo — 2026 site script */
(function () {
    'use strict';

    // ---------------------------------------------------------------
    // YEARLY CONFIG — update these each season.
    // Times are Pacific (PDT = UTC-7 through Nov 1, 2026).
    // ---------------------------------------------------------------
    var APPLY_URL = 'register.html'; // Application form (Appwrite-backed, see js/register.js)
    var DEADLINE  = new Date('2026-10-02T23:50:00-07:00'); // Application due
    var INTERVIEW = new Date('2026-10-04T09:30:00-07:00'); // Final interview check-in
    var INTERVIEW_END = new Date('2026-10-04T11:30:00-07:00');
    var AWARDS    = new Date('2026-10-09T00:00:00-07:00'); // Award announcement day

    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

    document.documentElement.classList.add('js');

    // ----- Apply buttons -----
    if (APPLY_URL) {
        $$('.js-apply').forEach(function (a) {
            a.href = APPLY_URL;
            if (/^https?:/.test(APPLY_URL)) { a.target = '_blank'; a.rel = 'noopener'; }
        });
        var note = $('#apply-pending');
        if (note) note.hidden = true;
    }

    // ----- Nav -----
    var nav = $('.nav');
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 12); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    $('.nav-toggle').addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        this.setAttribute('aria-expanded', open);
    });
    $$('.nav-links a').forEach(function (a) {
        a.addEventListener('click', function () { nav.classList.remove('open'); });
    });

    // ----- Rotating "AI + X" word -----
    var words = ['Medicine', 'Music', 'Climate', 'Art', 'Business', 'Sports', 'History', 'Biology', 'Education', 'Robotics', 'Anything'];
    var rot = $('#rot');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rot && !reduced) {
        var i = 0;
        setInterval(function () {
            rot.classList.add('out');
            setTimeout(function () {
                i = (i + 1) % words.length;
                rot.textContent = words[i];
                rot.classList.remove('out');
            }, 350);
        }, 2200);
    }

    // ----- Season phase + countdown -----
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var cd = $('#countdown');
    var label = $('#deadline-label');
    var dateEl = $('#deadline-date');
    var pill = $('#status-pill');
    var pillText = $('#status-text');
    var steps = $$('.tl-step');

    function setSteps(current) {
        steps.forEach(function (s, idx) {
            s.classList.toggle('done', idx < current);
            s.classList.toggle('current', idx === current);
        });
    }

    function tick() {
        var now = new Date();
        var target;
        if (now < DEADLINE) {
            target = DEADLINE;
            setSteps(0);
        } else if (now < INTERVIEW_END) {
            target = INTERVIEW;
            label.textContent = 'Final interviews begin in';
            dateEl.textContent = 'Sunday, October 4, 2026 · 9:30 AM PT';
            pill.classList.add('closed');
            pillText.textContent = 'Applications closed · Final interviews Oct 4';
            $('#deadline-local').setAttribute('data-iso', INTERVIEW.toISOString());
            setSteps(1);
        } else {
            target = AWARDS;
            label.textContent = now < AWARDS ? 'Awards announced in' : 'Thank you for an incredible 2026 season';
            dateEl.textContent = 'Award Announcement · Friday, October 9, 2026';
            pill.classList.add('closed');
            pillText.textContent = 'Award announcement · Oct 9, 2026';
            $('#deadline-local').removeAttribute('data-iso');
            $('#deadline-local').textContent = '';
            setSteps(2);
        }
        if (now >= DEADLINE) {
            $$('.js-apply').forEach(function (a) {
                a.removeAttribute('target');
                a.href = '#timeline';
                a.firstChild.textContent = 'Applications closed ';
            });
        }
        var ms = Math.max(0, target - now);
        var s = Math.floor(ms / 1000);
        $('.days', cd).textContent = pad(Math.floor(s / 86400));
        $('.hours', cd).textContent = pad(Math.floor(s % 86400 / 3600));
        $('.minutes', cd).textContent = pad(Math.floor(s % 3600 / 60));
        $('.seconds', cd).textContent = pad(s % 60);
        if (ms === 0 && now >= AWARDS) cd.hidden = true;
    }
    tick();
    setInterval(tick, 1000);

    // ----- Show each date in the visitor's own time zone -----
    function localTimes() {
        var tz;
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return; }
        if (!tz || tz === 'America/Los_Angeles') return;
        $$('[data-iso]').forEach(function (el) {
            var d = new Date(el.getAttribute('data-iso'));
            if (isNaN(d)) return;
            el.textContent = 'Your time: ' + d.toLocaleString(undefined, {
                weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
            });
        });
    }
    localTimes();

    // ----- Scroll reveal -----
    if ('IntersectionObserver' in window && !reduced) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        $$('.reveal').forEach(function (el) { io.observe(el); });
    } else {
        $$('.reveal').forEach(function (el) { el.classList.add('in'); });
    }

    // ----- Gallery lightbox -----
    var lb = $('#lightbox');
    if (lb && lb.showModal) {
        var lbImg = $('img', lb);
        $$('.gallery a').forEach(function (a) {
            a.addEventListener('click', function (e) {
                e.preventDefault();
                lbImg.src = a.href;
                lb.showModal();
            });
        });
        lb.addEventListener('click', function () { lb.close(); });
    }
})();
