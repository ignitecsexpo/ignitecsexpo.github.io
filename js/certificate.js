/* IgniteAI Expo — certificate renderer.
   Draws on a canvas (so names in any script render with the browser's fonts),
   then wraps the image in a letter-landscape PDF via jsPDF. */
var ExpoCert = (function () {
    'use strict';

    var W = 2200, H = 1700;
    var INK = '#16181d', MUTED = '#5d6370', ACCENT = '#e4472b', PAPER = '#fdfbf6';
    var SERIF = '"Fraunces", Georgia, "Times New Roman", "Songti SC", "Noto Serif CJK SC", serif';
    var SANS = '"Inter", "Helvetica Neue", Arial, "PingFang SC", "Noto Sans CJK SC", sans-serif';

    var TITLES = { award: 'Certificate of Achievement', finalist: 'Certificate of Merit', participation: 'Certificate of Participation' };

    function fontsReady() {
        if (!document.fonts || !document.fonts.load) return Promise.resolve();
        return Promise.all([
            document.fonts.load('600 90px Fraunces'), document.fonts.load('italic 600 120px Fraunces'),
            document.fonts.load('500 34px Inter'), document.fonts.load('700 26px Inter')
        ]).catch(function () {});
    }

    function fitText(ctx, text, maxWidth, size, font) {
        do { ctx.font = font.replace('{s}', size); size -= 4; } while (ctx.measureText(text).width > maxWidth && size > 36);
    }
    function spaced(ctx, text, x, y, spacing) {
        var total = 0, i;
        for (i = 0; i < text.length; i++) total += ctx.measureText(text[i]).width + spacing;
        var cx = x - (total - spacing) / 2;
        ctx.textAlign = 'left';
        for (i = 0; i < text.length; i++) { ctx.fillText(text[i], cx, y); cx += ctx.measureText(text[i]).width + spacing; }
        ctx.textAlign = 'center';
    }
    function hex(ctx, cx, cy, r) {
        ctx.beginPath();
        for (var i = 0; i < 6; i++) {
            var a = Math.PI / 180 * (60 * i - 90);
            ctx[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
        ctx.closePath();
    }

    function draw(c) {
        var eventName = c.eventName || 'IgniteAI Expo', year = (eventName.match(/\b(20\d\d)\b/) || [])[1] || '';
        return fontsReady().then(function () {
            var cv = document.createElement('canvas');
            cv.width = W; cv.height = H;
            var ctx = cv.getContext('2d');
            ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);

            // frame
            ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.strokeRect(70, 70, W - 140, H - 140);
            ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.5; ctx.strokeRect(96, 96, W - 192, H - 192);
            // corner marks
            ctx.fillStyle = ACCENT;
            [[96, 96], [W - 96, 96], [96, H - 96], [W - 96, H - 96]].forEach(function (p) {
                ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, Math.PI * 2); ctx.fill();
            });

            ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

            // wordmark
            ctx.fillStyle = ACCENT; hex(ctx, W / 2, 232, 46); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = '700 34px ' + SANS; ctx.fillText('AI', W / 2, 245);
            ctx.font = '700 58px ' + SERIF;
            var a = 'Ignite', b = 'AI', d = ' Expo';
            var wa = ctx.measureText(a).width, wd = ctx.measureText(d).width;
            ctx.font = 'italic 700 58px ' + SERIF; var wb = ctx.measureText(b).width;
            var x0 = W / 2 - (wa + wb + wd) / 2;
            ctx.textAlign = 'left';
            ctx.font = '700 58px ' + SERIF; ctx.fillStyle = INK; ctx.fillText(a, x0, 356);
            ctx.font = 'italic 700 58px ' + SERIF; ctx.fillStyle = ACCENT; ctx.fillText(b, x0 + wa, 356);
            ctx.font = '700 58px ' + SERIF; ctx.fillStyle = INK; ctx.fillText(d, x0 + wa + wb, 356);
            ctx.textAlign = 'center';
            ctx.fillStyle = MUTED; ctx.font = '600 24px ' + SANS;
            spaced(ctx, 'INTERNATIONAL K–12 AI + X INNOVATION SHOWCASE' + (year ? ' · ' + year : ''), W / 2, 410, 5);

            // title
            ctx.fillStyle = INK; ctx.font = '600 104px ' + SERIF;
            ctx.fillText(TITLES[c.kind] || TITLES.participation, W / 2, 590);

            ctx.fillStyle = MUTED; ctx.font = '500 34px ' + SANS;
            ctx.fillText('is proudly presented to', W / 2, 680);

            // name
            ctx.fillStyle = INK;
            fitText(ctx, c.recipientName, 1700, 136, 'italic 600 {s}px ' + SERIF);
            ctx.fillText(c.recipientName, W / 2, 850);
            ctx.strokeStyle = ACCENT; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(W / 2 - 520, 900); ctx.lineTo(W / 2 + 520, 900); ctx.stroke();

            // body
            var y = 990;
            ctx.fillStyle = MUTED; ctx.font = '500 36px ' + SANS;
            if (c.kind === 'award' && c.awardText) {
                ctx.fillText('in recognition of earning the', W / 2, y); y += 84;
                ctx.fillStyle = ACCENT;
                fitText(ctx, c.awardText, 1700, 70, '600 {s}px ' + SERIF);
                ctx.fillText(c.awardText, W / 2, y); y += 78;
            } else if (c.kind === 'finalist') {
                ctx.fillText('for being selected as a Finalist at ' + eventName, W / 2, y); y += 78;
            } else {
                ctx.fillText('for presenting an original project at ' + eventName, W / 2, y); y += 78;
            }
            if (c.projectTitle) {
                ctx.fillStyle = INK;
                var t = '“' + c.projectTitle + '”';
                fitText(ctx, t, 1750, 50, 'italic 500 {s}px ' + SERIF);
                ctx.fillText(t, W / 2, y); y += 64;
            }
            var meta = [c.track, c.division ? 'Grade ' + String(c.division).replace('-', '–') + ' Division' : ''].filter(Boolean).join('  ·  ');
            if (meta) { ctx.fillStyle = MUTED; ctx.font = '500 30px ' + SANS; ctx.fillText(meta, W / 2, y); }

            // signature + date
            var by = H - 300;
            ctx.strokeStyle = INK; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(300, by); ctx.lineTo(820, by); ctx.moveTo(W - 820, by); ctx.lineTo(W - 300, by); ctx.stroke();
            ctx.fillStyle = INK;
            if (c.signerName) { ctx.font = 'italic 600 46px ' + SERIF; ctx.fillText(c.signerName, 560, by - 22); }
            ctx.font = '600 40px ' + SERIF; ctx.fillText(c.issuedOn || '', W - 560, by - 22);
            ctx.fillStyle = MUTED; ctx.font = '500 26px ' + SANS;
            ctx.fillText(c.signerTitle || 'IgniteAI Expo Committee', 560, by + 44);
            ctx.fillText('Date', W - 560, by + 44);

            // seal
            ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(W / 2, by - 10, 92, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, by - 10, 78, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = '700 40px ' + SERIF; ctx.fillText('AI + X', W / 2, by - 6);
            if (year) { ctx.font = '700 20px ' + SANS; spaced(ctx, year, W / 2, by + 28, 6); }

            if (c.id) {
                ctx.fillStyle = '#8b909b'; ctx.font = '500 21px ' + SANS;
                ctx.fillText('Certificate ID ' + c.id + '  ·  verify at igniteaiexpo.org/certificate.html?id=' + c.id, W / 2, H - 124);
            }
            return cv;
        });
    }

    function pdf(c) {
        return draw(c).then(function (cv) {
            var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
            doc.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 792, 612);
            doc.setProperties({ title: (TITLES[c.kind] || 'Certificate') + ' — ' + c.recipientName, author: 'IgniteAI Expo' });
            return doc.output('blob');
        });
    }

    function filename(c) {
        var safe = String(c.recipientName || 'certificate').normalize('NFKD').replace(/[^\w一-鿿가-힯 -]+/g, '').trim().replace(/\s+/g, '_') || 'certificate';
        return String(c.eventName || 'IgniteAI Expo').replace(/\s+/g, '_') + '_' + safe + '_' + (c.kind || 'certificate') + '.pdf';
    }

    return { draw: draw, pdf: pdf, filename: filename, TITLES: TITLES };
})();
