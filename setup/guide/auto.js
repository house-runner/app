/* HouseRunner – "Set it up for me": the automatic Sheet maker, built into the setup page (setup/guide/).
 * Instead of copying the template Sheet and publishing it by hand in Apps Script, this page does it with Google's own APIs,
 * in the family's account, from their browser:
 *   1. Sign in with Google (permission to make one Sheet, and to make and publish its script).
 *   2. Make a new Sheet; make its script (the standard HouseRunner loader); save a version; publish it as a web app.
 *   3. One Google approval of the script's own permissions (in the same tab). Its "Published!" page sets the Sheet up.
 *   4. Hand over to the normal setup page (Privacy, family, calendar…), already connected – it collects the access code once.
 * Nothing is kept on a server. The Google sign-in lasts only while this page is open; progress (the new Sheet's and script's
 * IDs) is remembered in this browser, so a reload or a failure carries on with the same Sheet instead of making another.
 * The setup page's first step shows this; the by-hand route (Make my copy + the step window) stays as the fallback.
 * Each step's instructions (and pictures of Google's screens) sit straight under it in the list. */
(function () {
    var SCOPES = 'openid email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/script.projects https://www.googleapis.com/auth/script.deployments';
    var KEY = 'hrbeta.install.v1', CKEY = 'hrbeta.clientId';
    var FILES = '../files/', CONFIG = '../../install/config.json';
    var S = load(), token = null, tokenAt = 0, client = null, log = [];
    var app = null, OPT = {}, started = false, cfgP = null;
    /** Where the step window is up to – it reads this (and follows changes) by itself */
    function stage(k) { try { if (localStorage.getItem('hrinstall.stage') !== k) localStorage.setItem('hrinstall.stage', k); } catch (e) { /* fine */ } }

    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* fine */ } }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function note(msg) { log.push(new Date().toISOString().slice(11, 19) + ' ' + msg); if (log.length > 80) log.shift(); }

    /* ---------------------------------------------------------------- the public Google client ID (not a secret) */
    function clientId() { return (window.HR_BETA_CLIENT || '').trim() || localStorage.getItem(CKEY) || ''; }
    function loadConfig() {
        return fetch(CONFIG + '?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : {}; }).then(function (c) { window.HR_BETA_CLIENT = c.clientId || ''; }, function () {});
    }

    /* ---------------------------------------------------------------- Google sign-in (token kept in memory only) */
    function signIn(prompt) {
        return new Promise(function (res, rej) {
            if (!window.google || !google.accounts || !google.accounts.oauth2) return rej(new Error('Google sign-in hasn’t loaded – check your connection and reload the page.'));
            client = google.accounts.oauth2.initTokenClient({
                client_id: clientId(), scope: SCOPES, prompt: prompt == null ? '' : prompt,
                callback: function (r) {
                    if (r.error) return rej(new Error(r.error === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in failed: ' + r.error));
                    if (!google.accounts.oauth2.hasGrantedAllScopes(r, 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/script.projects', 'https://www.googleapis.com/auth/script.deployments'))
                        return rej(new Error('Some permissions were unticked. Click Sign in again and tick them all – HouseRunner needs each one to make your Sheet.'));
                    token = r.access_token; tokenAt = Date.now(); res();
                },
                error_callback: function (e) { rej(new Error(e && e.type === 'popup_closed' ? 'The Google window was closed before signing in.' : 'Google sign-in couldn’t open (' + (e && e.type || 'error') + '). Allow pop-ups for houserunner.app and try again.')); }
            });
            client.requestAccessToken();
        });
    }
    function api(method, url, body) {
        return fetch(url, { method: method, headers: Object.assign({ Authorization: 'Bearer ' + token }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined })
            .then(function (r) {
                return r.text().then(function (t) {
                    var j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) { j = { raw: t }; }
                    note(method + ' ' + url.replace(/^https:\/\/[^/]+/, '') + ' → ' + r.status);
                    if (!r.ok) { var e = new Error((j.error && j.error.message) || ('Google said ' + r.status)); e.status = r.status; e.body = j; throw e; }
                    return j;
                });
            });
    }

    /* ---------------------------------------------------------------- the steps */
    var STEPS = [
        ['signin', 'Sign in with Google'],
        ['sheet', 'Make your HouseRunner Sheet'],
        ['script', 'Add the HouseRunner script to it'],
        ['publish', 'Publish it'],
        ['approve', 'Approve HouseRunner App’s permissions'],
        ['ready', 'Finish publishing, then carry on with setup']
    ];
    function stepIndex() {
        if (S.answered || S.approved) return 5;
        if (S.url) return 4;          // approval needs no sign-in here, so coming back to this page carries on
        if (!token) return 0;
        if (!S.sheetId) return 1;
        if (!S.scriptId || !S.contentDone) return 2;
        if (!S.url) return 3;
        if (!S.answered) return 4;
        return 5;
    }
    function draw(extra) {
        if (!app || !document.body.contains(app)) return;
        var k = stepIndex();
        if (k === 5) stage(S.answered ? 'done' : 'finish'); else if (k === 4) { if (stage.now !== 'google2') stage('approve'); } else if (k > 0 && !S.needSwitch) stage('making');
        var list = '<ol class="hri-steps">' + STEPS.map(function (s, i) {
            var cls = i < k ? 'ok' : i === k ? 'now' : '';
            return '<li class="' + cls + '"><span class="i">' + (i < k ? '✅' : i === k ? '▶' : '○') + '</span><span>' + s[1] + '</span></li>';
        }).join('') + '</ol>';
        if (!extra && justOn && k < 4) extra = '<div class="note ok">✅ <b>Apps Script API is switched on – thank you.</b> If the Apps Script settings tab is still open, close it. HouseRunner is carrying on…</div>';
        var body = '';
        if (!clientId()) body = devForm();
        else if (S.needSwitch && k <= 2) body = '';
        else if (k === 0) body = '<div class="card big"><h3>Sign in with the Google account for your family dashboard</h3><p>Google asks you to let the <b>HouseRunner Installer</b> make <b>one new Sheet</b> in your Drive and <b>make and publish its script</b>. It can’t see your other files.' +
            (S.email ? ' <span class="mute">Last time you used ' + esc(S.email) + ' – use the same account to carry on with the same Sheet.</span>' : '') + '</p>' +
            '<ol class="mute"><li>A Google window opens: choose <b>your</b> account.</li><li>Google says <b>“Sign in to houserunner.app”</b> with your email: click <b>Continue</b>.</li><li>Google says <b>“Google hasn’t verified this app”</b> – that’s expected, HouseRunner is new. Click <b>Continue</b> (the blue word on the left – not “Back to safety”). <span class="small">(If it shows <b>Advanced</b> instead, click that, then <b>Go to HouseRunner Installer (unsafe)</b>.)</span></li><li>Tick <b>Select all</b>, scroll down and click <b>Continue</b>.</li></ol>' +
            '<div class="hri-pics"><figure><img src="../../shared/brand/steps/h-signinto.png?v=347" alt=""><figcaption>Sign in to houserunner.app: Continue</figcaption></figure><figure><img src="../../shared/brand/steps/h-testing.png?v=345" alt=""><figcaption>Not verified yet: Continue, on the left</figcaption></figure><figure><img src="../../shared/brand/steps/h-consent-inst.png?v=348" alt=""><figcaption>Tick Select all – your own Google email shows where it’s marked</figcaption></figure><figure><img src="../../shared/brand/steps/h-continue-inst.png?v=349" alt=""><figcaption>…then scroll down: Continue</figcaption></figure></div>' + '<p>' + '<button class="btn ghost sm" data-showme type="button">🎬 Show me</button> <span class="mute small">– a small window with a short clip of each click</span>' + '</p>' +
            '<div class="row"><button class="btn" id="go">' + (S.sheetId ? 'Sign in and carry on' : 'Sign in with Google') + '</button></div></div>';
        else if (k === 4) body = '<div class="card big"><h3>One Google approval for HouseRunner App</h3><p>Your Sheet is made and published. Now approve what <b>HouseRunner App</b> does in your account – your calendar, sending your setup emails and so on (why each is needed is below). This tab goes to Google, then comes back here.</p>' +
            '<ol class="mute"><li>Google says <b>HouseRunner App (Unverified) needs your permission</b>: click <b>REVIEW PERMISSIONS</b>.</li><li>A Google window opens: choose <b>your</b> account.</li><li>Google warns it hasn’t been verified – expected: it’s your own private copy. If it shows <b>“Google hasn’t verified this app”</b>, click <b>Continue</b> on the left. <span class="small">(Or: <b>Advanced</b>, then <b>Go to HouseRunner App (unsafe)</b>.)</span></li><li>Tick <b>Select all</b>, scroll down, click <b>Continue</b>.</li><li>“Waiting for authorization…” for a few seconds – <b>stuck?</b> Press <b>F5</b>.</li><li>Google shows <b>✅ Approved</b>: click <b>▶ Back to HouseRunner setup</b>.</li></ol>' +
            '<div class="hri-pics"><figure><img src="../../shared/brand/steps/h-review.png?v=344" alt=""><figcaption>REVIEW PERMISSIONS</figcaption></figure><figure><img src="../../shared/brand/steps/h-consent.png?v=344" alt=""><figcaption>Select all, then Continue</figcaption></figure></div>' + '<p>' + '<button class="btn ghost sm" data-showme type="button">🎬 Show me</button> <span class="mute small">– a small window with a short clip of each click</span>' + '</p>' +
            '<div class="row"><button class="btn" id="approve">Approve HouseRunner App</button><span class="mute" id="watch"></span></div></div>';
        else if (k === 5 && !S.answered) body = S.manual ? manualCard() : finishCard();
        else if (k === 5) body = '<div class="note ok" style="font-size:18px">✅ <b>All done with Google.</b> Your Sheet is made, published and approved – HouseRunner checked it answers. Carrying on…</div>';
        else body = '<div class="card"><h3>⏳ ' + STEPS[k][1] + '…</h3><p class="mute">Working – this takes a few seconds. Don’t close this tab.</p></div>';
        // An earlier try that didn't finish: a new one starts by default; going back to it is one click (the old Sheet is kept either way)
        var P = prev(), again = P && !S.sheetId ? '<div class="note" id="againCard" style="margin:0 0 14px">↩ <b>Welcome back.</b> You started making a Sheet' +
            (P.started ? ' on ' + esc(new Date(P.started).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : '') + (P.email ? ' as <b>' + esc(P.email) + '</b>' : '') +
            ' but didn’t finish, so this starts afresh with a new one. <span class="mute">Rather pick up where you left off? <a href="#" id="again">Carry on with that Sheet instead</a>. Either way your earlier Sheet isn’t changed or deleted – it stays in your Google Drive as “HouseRunner MAIN DATA”.</span></div>' : '';
        if (k === 4) body += OPT.perms || '';      // why each permission is needed, right where Google asks for them
        // What to do now sits straight under the step it belongs to; the steps still to come follow below it
        list = '<ol class="hri-steps">' + STEPS.map(function (st, i) {
            var cls = i < k ? 'ok' : i === k ? 'now' : '';
            return '<li class="' + cls + '"><span class="i">' + (i < k ? '✅' : i === k ? '▶' : '○') + '</span><span>' + st[1] + '</span></li>' +
                (i === k ? '<li class="here">' + (extra || '') + body + '</li>' : '');
        }).join('') + '</ol>';
        app.innerHTML = again + list + diag();
        wire();
    }
    function devForm() {
        return '<div class="card"><h2>For Russ: the Google client ID</h2><p>The installer needs HouseRunner’s Google sign-in “client ID” (public, not a secret). Either put it in <code>install/config.json</code> as <code>{"clientId": "…"}</code>, or paste it here for this browser only.</p>' +
            '<input id="cid" placeholder="1234567890-abc….apps.googleusercontent.com" autocomplete="off"><div class="row"><button class="btn" id="cidSave">Save</button></div></div>';
    }
    function diag() {
        var safe = { email: S.email, sheetId: S.sheetId, scriptId: S.scriptId, version: S.version, deploymentId: S.deploymentId, url: S.url ? '(saved)' : '', answered: S.answered, started: S.started };
        return '<details><summary>Details for Russ</summary><pre>' + esc(JSON.stringify(safe, null, 1) + '\n\n' + log.join('\n')) + '</pre>' +
            '</details>';
    }
    var PKEY = 'hrinstall.prev';
    function prev() { try { return JSON.parse(localStorage.getItem(PKEY) || 'null'); } catch (e) { return null; } }
    /** Done and handed over to setup: nothing more to carry on with, so the next new setup on this computer starts clean */
    function forget() { try { localStorage.setItem('hrinstall.last', JSON.stringify({ email: S.email, sheetId: S.sheetId, at: new Date().toISOString() })); localStorage.removeItem(KEY); } catch (e) { /* fine */ } }
    function wire() {
        var on = function (id, f) { var b = document.getElementById(id); if (b) b.onclick = f; };
        Array.prototype.forEach.call(app.querySelectorAll('[data-showme]'), function (b) { b.onclick = showMe; });
        on('cidSave', function () { var v = document.getElementById('cid').value.trim(); if (!/\.apps\.googleusercontent\.com$/.test(v)) { alert('That doesn’t look like a Google client ID.'); return; } localStorage.setItem(CKEY, v); draw(); });
        on('republish', republish);
        on('handGo', useHandUrl);
        on('toManual', function (e) { if (e) e.preventDefault(); S.manual = true; save(); draw(); });
        on('toAuto', function (e) { if (e) e.preventDefault(); S.manual = false; save(); draw(); });
        on('go', function () { stage('signin'); signIn().then(afterSignIn).catch(fail); });
        on('approve', approve);
        on('again', function (e) {
            if (e) e.preventDefault();
            var P = prev(); if (!P) return;
            S = P; save(); try { localStorage.removeItem(PKEY); } catch (x) { /* fine */ }
            note('carrying on with the earlier try');
            draw('<div class="note ok">↩ Carrying on with the Sheet you started' + (S.email ? ' as <b>' + esc(S.email) + '</b>' : '') + ' – ' + (S.url ? 'it’s already made and published.' : 'sign in with the same account and it picks up where it stopped.') + '</div>');
            if (S.url) check(true).then(function (ok) { if (ok) { draw(); finish(); } });
        });
    }
    function fail(e) {
        note('ERROR ' + (e && e.message));
        var m = e && e.message || String(e);
        if (isSwitchOff(e)) { askSwitch(); return; }
        if (e && e.status === 401) { token = null; }
        draw('<div class="note bad">' + esc(m) + '<div class="row"><button class="btn ghost" id="again">Try again</button></div></div>');
        var b = document.getElementById('again'); if (b) b.onclick = function () { (token ? build() : signIn().then(afterSignIn)).catch(fail); };
    }

    /* ---------------------------------------------------------------- doing it */
    function afterSignIn() {
        return api('GET', 'https://openidconnect.googleapis.com/v1/userinfo').then(function (u) {
            if (S.email && u.email && S.email !== u.email && S.sheetId) {
                if (!confirm('You’re signed in as ' + u.email + ', but this setup was started as ' + S.email + '.\n\nOK = start again with ' + u.email + ' (a new Sheet).\nCancel = sign in again with ' + S.email + '.')) { token = null; draw(); return; }
                S = {};
            }
            S.email = u.email; if (!S.started) S.started = new Date().toISOString(); save();
            if (S.contentDone) return build();          // the script is already made: the switch was on
            return apiOn().then(function (on) { if (on) return build(); askSwitch(); });
        });
    }
    function build(quiet) {
        if (!quiet) draw();
        return Promise.resolve()
            .then(function () { if (S.sheetId) return; return (function () { try { localStorage.removeItem(PKEY); } catch (e) { /* fine */ } })(), api('POST', 'https://www.googleapis.com/drive/v3/files?fields=id', { name: 'HouseRunner MAIN DATA', mimeType: 'application/vnd.google-apps.spreadsheet', appProperties: { houserunner: 'installer' } }).then(function (f) { S.sheetId = f.id; save(); draw(); }); })
            .then(function () { if (S.scriptId) return; return api('POST', 'https://script.googleapis.com/v1/projects', { title: 'HouseRunner App', parentId: S.sheetId }).then(function (p) { S.scriptId = p.scriptId; save(); if (S.needSwitch) switchedOn(document.title); draw(); }); })
            .then(function () {
                if (S.contentDone) return;
                return Promise.all(['Loader.gs', 'Admin.html', 'appsscript-loader.json'].map(function (f) { return fetch(FILES + f + '?t=' + Date.now()).then(function (r) { if (!r.ok) throw new Error('Couldn’t load HouseRunner’s ' + f); return r.text(); }); }))
                    .then(function (t) {
                        return api('PUT', 'https://script.googleapis.com/v1/projects/' + S.scriptId + '/content', { files: [
                            { name: 'Code', type: 'SERVER_JS', source: t[0] },
                            { name: 'Admin', type: 'HTML', source: t[1] },
                            { name: 'appsscript', type: 'JSON', source: t[2] }] });
                    }).then(function () { S.contentDone = true; save(); draw(); });
            })
            .then(function () { if (S.version) return; return api('POST', 'https://script.googleapis.com/v1/projects/' + S.scriptId + '/versions', { description: 'HouseRunner (automatic setup)' }).then(function (v) { S.version = v.versionNumber; save(); }); })
            .then(function () {
                if (S.url) return;
                // A deployment may already exist if the last attempt lost its answer: use it rather than making a second
                return api('GET', 'https://script.googleapis.com/v1/projects/' + S.scriptId + '/deployments').then(function (l) {
                    var have = (l.deployments || []).filter(function (d) { return webUrl(d); })[0];
                    return have || api('POST', 'https://script.googleapis.com/v1/projects/' + S.scriptId + '/deployments', { versionNumber: S.version, manifestFileName: 'appsscript', description: 'HouseRunner' });
                }).then(function (d) { S.deploymentId = d.deploymentId; S.url = webUrl(d); if (!S.url) throw new Error('Google published it but gave no web address – see Details.'); save(); });
            })
            .then(function () { draw(); return check(true).then(function (ok) { if (ok) { draw(); finish(); } }); });
    }
    /* ---------------------------------------------------------------- the Apps Script API switch (once per Google account)
     * Google only lets an app make scripts for someone who has switched on "Google Apps Script API" in their own Apps Script
     * settings – and there's no way to switch it on for them. So: check first (before making anything), and only if it's off,
     * open the settings in a tab of their own, watch from here until it's on, then close that tab (where the browser lets us)
     * and carry on by ourselves. */
    var setWin = null, setT = 0;
    function apiOn() {
        // Asking for a script that can't exist: with the switch off Google says so (403); with it on, just "not found"
        return api('GET', 'https://script.googleapis.com/v1/projects/hr-switch-check-0').then(function () { return true; }, function (e) {
            if (e && e.status === 403 && /Apps Script API/i.test(e.message || '')) return false;
            return true;
        });
    }
    function askSwitch() {
        stage('api'); S.needSwitch = true; save();
        draw('<div class="card big"><h3>⚙️ One switch to turn on first</h3>' +
            '<p>Google only lets HouseRunner make your script once you’ve switched on <b>Google Apps Script API</b> in your own Apps Script settings. It’s a one-off for this Google account.</p>' +
            '<div class="note warn" style="margin:12px 0"><b>The next button opens your Apps Script settings in a new tab.</b> In that tab:<ol style="margin:6px 0 0">' +
            '<li>Click <b>Google Apps Script API</b>.</li><li>Click the switch so it turns <b>On</b> (blue).</li><li><b>Close that tab</b> (click its ✕) and <b>come back to this “HouseRunner setup” tab</b>.</li></ol></div>' +
            '<img src="../../shared/brand/steps/i-apiswitch.png?v=333" alt="" style="max-width:420px;width:100%;border-radius:10px;border:1px solid var(--line);display:block;margin:0 0 12px">' +
            '<div class="row"><button class="btn" id="setGo">Open my Apps Script settings (new tab)</button><span class="mute" id="setMsg"></span></div>' +
            '<p class="mute small">This page watches for the switch and carries on by itself as soon as it’s on.</p><p>' + '<button class="btn ghost sm" data-showme type="button">🎬 Show me</button> <span class="mute small">– a small window with a short clip of each click</span>' + '</p></div>');
        var b = document.getElementById('setGo');
        if (b) b.onclick = function () {
            setWin = window.open('https://script.google.com/home/usersettings', 'hrsettings');
            var m = document.getElementById('setMsg');
            if (m) m.innerHTML = setWin ? '⏳ Opened in a new tab – switch it <b>On</b>, close that tab, and come back here.' : 'Your browser blocked the new tab – allow pop-ups for houserunner.app, then click again.';
        };
        var t0 = document.title;
        clearTimeout(setT);
        (function watch() {
            setT = setTimeout(function () {
                if (!token || !S.needSwitch) return;
                apiOn().then(function (on) {
                    if (!on) { watch(); return; }
                    build(true).then(function () { switchedOn(t0); }, function (e) {
                        if (isSwitchOff(e)) { watch(); return; }      // the quick check said yes too soon: keep watching
                        switchedOn(t0); fail(e);
                    });
                });
            }, 3000);
        })();
    }
    function isSwitchOff(e) { return !!(e && e.status === 403 && /Apps Script API/i.test(e.message || '')); }
    var justOn = false;
    function switchedOn(t0) {
        if (!S.needSwitch) return;
        S.needSwitch = false; save(); justOn = true;
        try { if (setWin && !setWin.closed) setWin.close(); } catch (e) { /* the browser may not allow it */ }
        var still = setWin && !setWin.closed;
        if (still) { document.title = '✅ Done – come back to HouseRunner'; setTimeout(function () { document.title = t0; }, 20000); }
        draw();
    }
    /* ---------------------------------------------------------------- publishing again, once approved
     * Google keeps the address made before approval behind a sign-in (it lists it as archived), so your screens and phones
     * couldn't reach it. Published again now that the script is approved, it's open to them, as when it's done by hand. */
    function finishCard() {
        return '<div class="card big"><h3>One last click: finish publishing</h3>' +
            '<p>Google has approved your Sheet. Now HouseRunner publishes it once more, so your screen and phones can reach it – Google only allows that after approval. A Google window may flash up and close by itself.</p>' +
            '<div class="row"><button class="btn" id="republish">Finish publishing</button><span class="mute" id="repMsg"></span></div>' +
            '<p class="mute small" style="margin-top:12px">Stuck? <a href="#" id="toManual">Publish it by hand instead</a> – 2 minutes in Apps Script.</p>' +
            '<p><button class="btn ghost sm" data-showme type="button">🎬 Show me</button></p></div>';
    }
    function republish() {
        var m = document.getElementById('repMsg'); if (m) m.textContent = '⏳ Publishing…';
        signIn('').then(function () {
            note('publishing again after approval');
            return api('POST', 'https://script.googleapis.com/v1/projects/' + S.scriptId + '/versions', { description: 'HouseRunner (after approval)' });
        }).then(function (v) {
            return api('POST', 'https://script.googleapis.com/v1/projects/' + S.scriptId + '/deployments', { versionNumber: v.versionNumber, manifestFileName: 'appsscript', description: 'HouseRunner' });
        }).then(function (d) {
            var u = webUrl(d); if (!u) throw new Error('Google didn’t give a web address for it');
            S.url = u; save(); note('new address ' + u.slice(0, 60) + '…');
            if (m) m.textContent = '⏳ Checking it answers…';
            var n = 0;
            (function again() {
                check(true).then(function (ok) {
                    if (ok) { draw(); finish(); return; }
                    if (++n < 6) { setTimeout(again, 2500); return; }
                    S.manual = true; save(); draw('<div class="note warn">Google still won’t let your screens reach it that way, so let’s do this last bit by hand – it takes 2 minutes. <span class="mute small">(It said: ' + esc(lastPing) + ')</span></div>');
                });
            })();
        }).catch(function (e) {
            note('publishing again failed: ' + (e && e.message));
            S.manual = true; save(); draw('<div class="note warn">That didn’t work (' + esc(e && e.message || 'no answer') + '), so let’s do this last bit by hand – it takes 2 minutes.</div>');
        });
    }
    function manualCard() {
        var ed = 'https://script.google.com/d/' + encodeURIComponent(S.scriptId || '') + '/edit';
        return '<div class="card big"><h3>Publish it by hand (2 minutes)</h3>' +
            '<ol><li><a href="' + ed + '" target="_blank" rel="noopener"><b>Open your Sheet’s Apps Script</b></a> – a new tab.</li>' +
            '<li>Click the blue <b>Deploy</b> button (top right), then <b>New deployment</b>.</li>' +
            '<li>Click the ⚙ cog next to “Select type” and choose <b>Web app</b>.</li>' +
            '<li>Check <b>Execute as: Me</b> and set <b>Who has access: Anyone</b>. Click <b>Deploy</b>.</li>' +
            '<li>Google shows the <b>Web app URL</b> – click <b>Copy</b>, then <b>Done</b>.</li>' +
            '<li>Close that tab, come back here and paste it below.</li></ol>' +
            '<img src="../../shared/brand/steps/p-deploy.png?v=339" alt="" style="max-width:420px;width:100%;border-radius:10px;border:1px solid var(--line);display:block;margin:4px 0 12px">' +
            '<div class="row"><input id="handUrl" type="url" placeholder="https://script.google.com/macros/s/…/exec" style="flex:1;min-width:260px"><button class="btn" id="handGo">Use this address</button></div>' +
            '<p class="mute small" id="handMsg"></p>' +
            '<p class="mute small"><a href="#" id="toAuto">← Try “Finish publishing” again</a></p></div>';
    }
    function useHandUrl() {
        var v = (document.getElementById('handUrl').value || '').trim().replace(/\?.*$/, ''), m = document.getElementById('handMsg');
        if (!/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[\w-]{20,}\/exec$/.test(v)) { m.textContent = 'That doesn’t look like the Web app URL – it starts https://script.google.com/macros/s/ and ends /exec.'; return; }
        S.url = v; save(); m.textContent = '⏳ Checking it answers…';
        check(false).then(function (ok) {
            if (ok) { draw(); finish(); }
            else m.textContent = 'It didn’t answer yet (' + lastPing + '). Check “Who has access” says Anyone, then try again.';
        });
    }
    /** 🎬 Show me: a small window beside this one with a clip or picture of each click (helper.html); it follows along by itself */
    function showMe() {
        var w = 400, h = Math.max(520, Math.min(760, (screen.availHeight || 900) - 140));
        var win = window.open('helper.html', 'hrhelper', 'popup,width=' + w + ',height=' + h + ',left=' + Math.max(0, (screen.availWidth || 1200) - w - 16) + ',top=60');
        if (!win) toastish('Your browser blocked the small window – allow pop-ups for houserunner.app, then click again.'); else try { win.focus(); } catch (e) { /* fine */ }
    }
    function toastish(t) { var n = document.createElement('div'); n.className = 'note warn'; n.textContent = t; app.insertBefore(n, app.firstChild); setTimeout(function () { n.remove(); }, 8000); }
    function webUrl(d) { var e = (d.entryPoints || []).filter(function (x) { return x.webApp && x.webApp.url; })[0]; return e ? e.webApp.url : ''; }

    /** Approval happens in this same tab (a separate window couldn't be closed for you once Google had shown its pages in it).
     *  The script's "Approved" page then brings this tab straight back to setup (#approved), which checks it and carries on. */
    function approve() { note('approve: going to Google'); stage('google2'); stage.now = 'google2'; save(); location.href = S.url + '?hrbeta=1'; }
    /** Does the published script answer, and has its first visit set the Sheet up? (Before approval, Google answers with a sign-in page, not HouseRunner.) */
    var lastPing = '';
    function check(quiet) {
        if (!S.url) return Promise.resolve(false);
        return fetch(S.url + '?action=ping&t=' + Date.now()).then(function (r) {
            return r.text().then(function (t) { try { return JSON.parse(t); } catch (e) { throw new Error('HTTP ' + r.status + ', not JSON: ' + t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)); } });
        }).then(function (d) {
            if (d && d.ok && d.app === 'family-dashboard' && d.setupDone !== false) { S.answered = true; save(); note('ping ok ' + (d.version || '')); return true; }
            lastPing = 'answered, but not ready: ' + JSON.stringify(d).slice(0, 200); note('ping: ' + lastPing); return false;
        }, function (e) { lastPing = (e && e.message) || 'no answer (blocked or offline)'; note('ping: ' + lastPing); return false; });
    }

    /** Show it in el. opt: approved (just back from Google's approval), perms (the "why each permission" card), onReady(url), onReset(). */
    function mount(el, opt) {
        app = el; OPT = opt || {};
        try { stage.now = localStorage.getItem('hrinstall.stage'); } catch (e) { /* fine */ }
        if (!cfgP) cfgP = loadConfig();
        cfgP.then(function () {
            if (started) { draw(); return; }
            started = true;
            var back = !!OPT.approved;
            // Finished before (and handed over then): nothing to carry on with – a new setup on this computer starts clean
            if (S.answered && !back) { forget(); S = {}; stage('start'); }
            else if (S.sheetId && !back && !OPT.resume) { try { localStorage.setItem(PKEY, JSON.stringify(S)); localStorage.removeItem(KEY); } catch (e) { /* fine */ } S = {}; stage('start'); note('earlier unfinished try put aside'); }
            if (back) { note('back from Google approval'); stage('checking'); if (OPT.approvedCode) S.code = OPT.approvedCode; if (S.url && !S.answered) S.approved = true; save(); }
            draw(back && !S.answered ? '<div class="note">⏳ Checking your Sheet answers…</div>' : '');
            if (S.answered) { finish(); return; }
            // Back from Google's approval (or reopened part-way): check the Sheet answers – a few tries, as Google can take a moment
            if (S.url) (function tryIt(n) {
                check(true).then(function (ok) {
                    if (ok) { draw(); finish(); }
                    else if (n < (S.approved ? 2 : 8)) setTimeout(function () { tryIt(n + 1); }, 2500);
                    else draw();          // approved: the step shows "Finish publishing"
                });
            })(0);
        });
    }
    function finish() { stage('done'); var u = S.url, c = S.code; setTimeout(function () { forget(); if (OPT.onReady) OPT.onReady(u, c); }, 1800); }
    window.HRInstall = {
        mount: mount,
        /** Has an automatic setup been started on this computer (so its card should show rather than the by-hand steps)? */
        started: function () { return !!(S.started || S.sheetId); },
        /** A new family on this computer: forget any unfinished try too */
        reset: function () { try { localStorage.removeItem(KEY); localStorage.removeItem(PKEY); localStorage.removeItem('hrinstall.stage'); } catch (e) { /* fine */ } S = {}; }
    };
})();
