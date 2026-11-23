/* HouseRunner – the floating step window.
 * Opened from the setup page, it walks people through making and publishing their Sheet one click at a time: each step
 * says which tab to be in, what to click, and shows a short zoomed-in clip (or picture) of it. It floats on top of the
 * Google tabs (Chrome and Edge: Document Picture-in-Picture); other browsers get a small separate window.
 * It moves on by itself where the setup page can tell (Make my copy clicked; the Sheet handed back), and otherwise with
 * "Done – next step". */
(function () {
    var B = '../../shared/brand/', V = B + 'steps/';
    // [where you are, what to click, a line of help, clip or picture]
    var STEPS = [
        ['setup', 'Click <b>Make my copy</b>', 'It’s the blue button on the HouseRunner setup page, behind this window. Your copy opens in a new tab.', V + 'v-copy.mp4'],
        ['google', 'Click the blue <b>Make a copy</b> button', 'Google asks “Copy document?”. If it asks you to sign in, use the Google account you want the dashboard in – the one with the family calendar.', V + 'v-makecopy.mp4'],
        ['sheet', 'Click <b>Extensions</b> in the menu along the top', 'Give the Sheet a few seconds to load first. <b>Extensions</b> is next to <b>Help</b>.', V + 'v-extensions.mp4'],
        ['sheet', 'Click <b>Apps Script</b>', 'A new tab opens with some code in it. <b>Don’t worry – you don’t need to read or change anything.</b>', V + 'v-extensions.mp4'],
        ['script', 'Click the blue <b>Deploy</b> button (top right)', 'A little menu drops down.', V + 'v-deploy.mp4'],
        ['script', 'Click <b>New deployment</b>', 'The first item in that menu.', V + 'v-deploy.mp4'],
        ['script', 'Click the ⚙ cog next to <b>“Select type”</b>, then <b>Web app</b>', 'The cog is at the top left of the “New deployment” box.', V + 'v-webapp.mp4'],
        ['script', 'Set <b>Who has access</b> to <b>Anyone</b>, then click <b>Deploy</b>', 'Leave <b>Execute as</b> on <b>Me</b>. Choose <b>Anyone</b> – not “Anyone with Google account”.', V + 'v-webapp.mp4'],
        ['script', 'Click <b>Authorize access</b>', 'A small Google window pops up.', V + 'v-authorize.mp4'],
        ['popup', 'Choose your Google account', 'The one your Sheet is in – the family account. <span class="mute">Google may also ask you to confirm it’s you on your phone – do that, then come back here.</span>', V + 'v-authorize.mp4'],
        ['popup', 'Click <b>Advanced</b>', 'Google says it hasn’t verified this app. That’s normal: it’s your own private copy, so you count as its “developer”. <b>Advanced</b> is small, at the bottom left.', V + 'p-advanced.png'],
        ['popup', 'Click <b>Go to HouseRunner (unsafe)</b>', 'It appears under <b>Advanced</b>. It’s safe – it only means Google hasn’t reviewed your private copy.', V + 'p-advanced.png'],
        ['popup', 'Tick <b>Select all</b>', 'At the top of the list. Every permission is needed for your dashboard to work.', V + 'p-selectall.png'],
        ['popup', 'Click <b>Continue</b>', 'The pop-up closes. Back in Apps Script, wait a few seconds for <b>“Deployment successfully created”</b> (or “updated”).', V + 'p-selectall.png'],
        ['script', 'Click the link under <b>Web app</b>', 'It starts <b>https://script.google.com/macros</b>. A new tab opens – it can take up to a minute to get your Sheet ready.<br><span class="mute">Clicked <b>Done</b> by mistake? Don’t deploy again: click <b>Deploy → Manage deployments</b>, then the link under <b>Web app</b>.</span>', V + 'v-weburl.mp4'],
        ['pub', 'Click <b>▶ Back to HouseRunner setup</b>', 'On the page that says <b>✅ Published!</b> Setup then carries on in your HouseRunner setup tab by itself.<br><span class="mute">Closed that page by mistake? In your Sheet, click <b>🏠 HouseRunner</b> → <b>▶ Click here to start step 16</b>.</span>', V + 'p-published.png'],
        ['tabs', 'Close every tab except <b>HouseRunner setup</b>', 'Click the ✕ on your Sheet’s tab, the Apps Script tab and the “Published” tab. Your Sheet keeps working without being open.', 'tabs']
    ];
    var WHERE = {
        setup: ['🏠', 'In the <b>HouseRunner setup</b> tab'],
        google: ['📄', 'In the <b>new tab</b> that just opened'],
        sheet: ['📗', 'In your new <b>Sheet</b> (“Copy of HouseRunner BLANK”)'],
        script: ['📜', 'In the <b>Apps Script</b> tab'],
        popup: ['🔐', 'In Google’s small <b>pop-up window</b>'],
        pub: ['✅', 'In the new <b>“Published!”</b> tab'],
        tabs: ['🧹', 'Along the top of your browser']
    };
    var VIDEO = B + 'setup.mp4';
    var KEY = 'hrfloat.v2', win = null, i = 0;
    try { i = Math.min(STEPS.length - 1, Math.max(0, +localStorage.getItem(KEY) || 0)); } catch (e) { i = 0; }
    function abs(u) { return new URL(u, location.href).href; }
    function plain(h) { var d = document.createElement('div'); d.innerHTML = h; return d.textContent; }

    var CSS = '*{box-sizing:border-box}html,body{margin:0;height:100%}body{background:#0f141b;color:#e6edf3;font:16px/1.45 "Segoe UI",Roboto,Arial,sans-serif;display:flex;flex-direction:column}' +
        '.hd{display:flex;align-items:center;gap:8px;padding:10px 14px 6px;font-size:13px;color:#9fb0c2}.hd b{color:#e6edf3}.hd .n{margin-left:auto;font-weight:700;color:#3fa9f5;font-size:14px}' +
        '.bar{height:5px;background:#243040;margin:0 14px;border-radius:3px;overflow:hidden}.bar i{display:block;height:100%;background:#3fa9f5;transition:width .2s}' +
        '.bd{flex:1;overflow:auto;padding:10px 14px}' +
        '.where{display:flex;gap:8px;align-items:center;background:#162231;border:1px solid #27405a;border-radius:10px;padding:7px 10px;font-size:14px;color:#cbd6e2}.where b{color:#fff}.where span{font-size:18px}' +
        'h2{font-size:21px;line-height:1.3;margin:12px 0 10px;font-weight:600}h2 b{color:#7cc4fa}' +
        '.media{display:block;width:100%;max-height:44vh;object-fit:contain;border-radius:10px;background:#fff;border:1px solid #2b3a4c}' +
        'p{margin:10px 0 0;color:#cbd6e2}p b{color:#fff}.mute{color:#8a9bb0;font-size:13.5px}' +
        '.vl{color:#7cc4fa;font-weight:600;text-decoration:none;font-size:13.5px}.vl:hover{text-decoration:underline}' +
        '.ft{display:flex;gap:8px;align-items:center;padding:10px 14px 12px;border-top:1px solid #1e2a38}' +
        'button{font:inherit;font-weight:700;border-radius:10px;padding:11px 16px;cursor:pointer;border:1px solid transparent}.go{background:#3fa9f5;color:#fff;margin-left:auto;font-size:16.5px}.gh{background:transparent;color:#cbd6e2;border-color:#33465c}' +
        'button:disabled{opacity:.35;cursor:default}' +
        '.tabs{display:flex;flex-wrap:wrap;gap:4px;background:#dfe3e8;border-radius:10px 10px 0 0;padding:8px 8px 0}.tab{flex:1 1 45%;min-width:0;background:#c7ccd3;color:#333;border-radius:8px 8px 0 0;padding:7px 8px;font-size:12.5px;display:flex;gap:6px;align-items:center;white-space:nowrap;overflow:hidden}' +
        '.tab.keep{background:#fff;font-weight:700}.tab i{margin-left:auto;font-style:normal;color:#b91c1c;font-weight:800}.tab.keep i{color:#15803d}.tabsb{background:#fff;border-radius:0 0 10px 10px;height:26px;border:1px solid #dfe3e8;border-top:0}' +
        '.done{margin-top:12px;padding:10px 12px;border-radius:10px;background:#123322;border:1px solid #2b7a4b;font-size:14.5px}';

    function media(m) {
        if (m === 'tabs') return '<div class="tabs"><div class="tab keep">🏠 HouseRunner setup<i>✓ keep</i></div><div class="tab">📗 Copy of HouseRunner<i>✕</i></div>' +
            '<div class="tab">📜 Apps Script<i>✕</i></div><div class="tab">✅ Published<i>✕</i></div></div><div class="tabsb"></div>';
        return /\.mp4$/.test(m) ? '<video class="media" src="' + abs(m) + '" autoplay muted loop playsinline></video>' : '<img class="media" alt="" src="' + abs(m) + '">';
    }
    function draw() {
        if (!win || win.closed) return;
        var d = win.document, s = STEPS[i], w = WHERE[s[0]], last = i === STEPS.length - 1;
        // stop the last step's clip properly, so its download doesn't hold up the next picture
        Array.prototype.forEach.call(d.querySelectorAll('video'), function (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* fine */ } });
        d.body.innerHTML =
            '<div class="hd"><b>HouseRunner setup</b><span class="n">Step ' + (i + 1) + ' of ' + STEPS.length + '</span></div>' +
            '<div class="bar"><i style="width:' + Math.round((i + 1) / STEPS.length * 100) + '%"></i></div>' +
            '<div class="bd"><div class="where"><span>' + w[0] + '</span><div>' + w[1] + '</div></div>' +
            '<h2>' + s[1] + '</h2>' + media(s[3]) + '<p>' + s[2] + '</p>' +
            (last ? '<div class="done">🎉 That’s the Google part done. Carry on in the <b>HouseRunner setup</b> tab – this window closes by itself.</div>' :
                '<p><a class="vl" target="_blank" rel="noopener" href="' + abs(VIDEO) + '">▶ Watch the whole 2-minute video</a></p>') + '</div>' +
            '<div class="ft"><button class="gh" id="bk"' + (i ? '' : ' disabled') + '>← Back</button>' +
            (last ? '<button class="go" id="cl">✕ Close this window</button>' : '<button class="go" id="nx">Done – next step →</button>') + '</div>';
        var on = function (id, f) { var b = d.getElementById(id); if (b) b.onclick = f; };
        on('bk', function () { go(i - 1); });
        on('nx', function () { go(i + 1); });
        on('cl', function () { HRFloat.close(); });
        d.title = 'Step ' + (i + 1) + ': ' + plain(s[1]) + ' – HouseRunner';
    }
    function go(k) {
        i = Math.min(STEPS.length - 1, Math.max(0, k));
        try { localStorage.setItem(KEY, String(i)); } catch (e) { /* fine */ }
        draw();
    }
    function size() { return { width: 480, height: Math.max(560, Math.min(780, (screen.availHeight || 900) - 90)) }; }
    function attach(w) {
        win = w;
        var d = w.document;
        var st = d.createElement('style'); st.textContent = CSS; d.head.appendChild(st);
        w.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); });
        w.addEventListener('pagehide', function () { if (win === w) win = null; if (HRFloat.onchange) HRFloat.onchange(); });
        draw();
        if (HRFloat.onchange) HRFloat.onchange();
    }
    function popup() {
        var z = size();
        var w = window.open('', 'hrguide', 'popup,width=' + z.width + ',height=' + z.height + ',left=' + Math.max(0, (screen.availWidth || 1200) - z.width - 20) + ',top=40');
        if (!w) return false;
        w.document.open(); w.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body></body></html>'); w.document.close();
        attach(w);
        return true;
    }

    window.HRFloat = {
        floats: 'documentPictureInPicture' in window,      // stays on top of other tabs (Chrome, Edge)
        count: STEPS.length,
        /** Every step as plain text, for the setup page's "Show all the steps". */
        list: function () { return STEPS.map(function (s) { return { where: WHERE[s[0]][1], what: s[1], help: s[2] }; }); },
        isOpen: function () { return !!(win && !win.closed); },
        /** Must be called straight from a click. fresh: start again at step 1. */
        open: function (fresh) {
            if (fresh) go(0);
            if (win && !win.closed) { try { win.focus(); } catch (e) { /* fine */ } return Promise.resolve(true); }
            if (window.documentPictureInPicture) {
                var p;
                try { p = documentPictureInPicture.requestWindow(size()); } catch (e) { return Promise.resolve(popup()); }
                return p.then(function (w) { attach(w); return true; }, function () { return false; });
            }
            return Promise.resolve(popup());
        },
        /** Move on by itself: 'copied' = Make my copy was just clicked; 'back' = the Sheet handed back to the setup page. */
        at: function (what) {
            if (what === 'copied' && i < 1) go(1);
            if (what === 'back') { go(STEPS.length - 1); setTimeout(function () { HRFloat.close(); }, 60000); }
        },
        close: function () { if (win && !win.closed) { try { win.close(); } catch (e) { /* fine */ } } win = null; },
        onchange: null
    };
})();
