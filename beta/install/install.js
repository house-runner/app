/* HouseRunner – BETA automatic setup.
 * Instead of copying the template Sheet and publishing it by hand in Apps Script, this page does it with Google's own APIs,
 * in the family's account, from their browser:
 *   1. Sign in with Google (permission to make one Sheet, and to make and publish its script).
 *   2. Make a new Sheet; make its script (the standard HouseRunner loader); save a version; publish it as a web app.
 *   3. One Google approval of the script's own permissions (in the same tab). Its "Published!" page sets the Sheet up.
 *   4. Hand over to the normal setup page (Privacy, family, calendar…), already connected – it collects the access code once.
 * Nothing is kept on a server. The Google sign-in lasts only while this page is open; progress (the new Sheet's and script's
 * IDs) is remembered in this browser, so a reload or a failure carries on with the same Sheet instead of making another.
 * BETA: not linked from the site; the normal setup is unchanged. */
(function () {
    var SCOPES = 'openid email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/script.projects https://www.googleapis.com/auth/script.deployments';
    var KEY = 'hrbeta.install.v1', CKEY = 'hrbeta.clientId';
    var FILES = '../../setup/files/';
    var S = load(), token = null, tokenAt = 0, client = null, log = [];
    var app = document.getElementById('app');

    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* fine */ } }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function note(msg) { log.push(new Date().toISOString().slice(11, 19) + ' ' + msg); if (log.length > 80) log.shift(); }

    /* ---------------------------------------------------------------- the public Google client ID (not a secret) */
    function clientId() { return (window.HR_BETA_CLIENT || '').trim() || localStorage.getItem(CKEY) || ''; }
    function loadConfig() {
        return fetch('config.json?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : {}; }).then(function (c) { window.HR_BETA_CLIENT = c.clientId || ''; }, function () {});
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
        ['approve', 'Approve HouseRunner’s permissions (one Google page)'],
        ['ready', 'Check it answers, then carry on with setup']
    ];
    function stepIndex() {
        if (!token) return 0;
        if (!S.sheetId) return 1;
        if (!S.scriptId || !S.contentDone) return 2;
        if (!S.url) return 3;
        if (!S.answered) return 4;
        return 5;
    }
    function draw(extra) {
        var k = stepIndex();
        var list = '<ol class="steps">' + STEPS.map(function (s, i) {
            var cls = i < k ? 'ok' : i === k ? 'now' : '';
            return '<li class="' + cls + '"><span class="i">' + (i < k ? '✅' : i === k ? '▶' : '○') + '</span><span>' + s[1] + '</span></li>';
        }).join('') + '</ol>';
        var body = '';
        if (!clientId()) body = devForm();
        else if (k === 0) body = '<div class="card"><h2>Sign in with the Google account for your family dashboard</h2><p>Google asks you to allow HouseRunner to <b>make one new Sheet</b> in your Drive and to <b>make and publish its script</b>. It can’t see your other files.' +
            (S.email ? ' <span class="mute">Last time you used ' + esc(S.email) + ' – use the same account to carry on with the same Sheet.</span>' : '') + '</p>' +
            '<div class="row"><button class="btn" id="go">' + (S.sheetId ? 'Sign in and carry on' : 'Go – sign in with Google') + '</button></div></div>';
        else if (k === 4) body = '<div class="card"><h2>One Google approval</h2><p>Click the button: this tab goes to Google, which asks you to approve what HouseRunner does in your account (your calendar, sending your setup emails, and so on).</p>' +
            '<ol><li>Choose your account if asked.</li><li>Google says it hasn’t verified the app: click <b>Advanced</b>, then <b>Go to HouseRunner (unsafe)</b> – it’s your own private copy.</li><li>Tick <b>Select all</b>, then <b>Continue</b>.</li><li>Wait for <b>✅ Published!</b> – up to a minute – then click <b>▶ Carry on setting up</b>. Everything stays in this one tab.</li></ol>' +
            '<div class="row"><button class="btn" id="approve">Approve HouseRunner’s permissions</button><span class="mute" id="watch"></span></div></div>';
        else if (k === 5) body = '<div class="card"><h2>✅ Your Sheet is ready</h2><p>Now the normal setup carries on: privacy notice, your family, your calendar and your screen – already connected.</p><div class="row"><a class="btn good" id="next" href="' + esc(handover()) + '">Carry on with setup →</a></div></div>';
        else body = '<div class="card"><h2>' + STEPS[k][1] + '…</h2><p class="mute">Working – this takes a few seconds.</p></div>';
        app.innerHTML = list + (extra || '') + body + diag();
        wire();
    }
    function devForm() {
        return '<div class="card"><h2>For Russ: the Google client ID</h2><p>This BETA needs HouseRunner’s Google sign-in “client ID” (public, not a secret). Either put it in <code>beta/install/config.json</code> as <code>{"clientId": "…"}</code>, or paste it here for this browser only.</p>' +
            '<input id="cid" placeholder="1234567890-abc….apps.googleusercontent.com" autocomplete="off"><div class="row"><button class="btn" id="cidSave">Save</button></div></div>';
    }
    function diag() {
        var safe = { email: S.email, sheetId: S.sheetId, scriptId: S.scriptId, version: S.version, deploymentId: S.deploymentId, url: S.url ? '(saved)' : '', answered: S.answered, started: S.started };
        return '<details><summary>Details for Russ</summary><pre>' + esc(JSON.stringify(safe, null, 1) + '\n\n' + log.join('\n')) + '</pre>' +
            '<div class="row"><button class="btn ghost" id="forget">Forget this attempt (keeps the Sheet in Drive)</button></div></details>';
    }
    function handover() { return '../../setup/#api=' + encodeURIComponent(S.url) + '&from=sheet'; }
    function wire() {
        var on = function (id, f) { var b = document.getElementById(id); if (b) b.onclick = f; };
        on('cidSave', function () { var v = document.getElementById('cid').value.trim(); if (!/\.apps\.googleusercontent\.com$/.test(v)) { alert('That doesn’t look like a Google client ID.'); return; } localStorage.setItem(CKEY, v); draw(); });
        on('go', function () { signIn().then(afterSignIn).catch(fail); });
        on('approve', approve);
        on('forget', function () { if (confirm('Forget this attempt? The Sheet it made stays in your Google Drive (delete it there if you like); the next Go makes a new one.')) { S = {}; save(); token = null; draw(); } });
    }
    function fail(e) {
        note('ERROR ' + (e && e.message));
        var m = e && e.message || String(e);
        if (e && e.status === 403 && /Apps Script API/i.test(m)) {
            draw('<div class="note warn"><b>One switch to turn on in Google first.</b> Google only lets HouseRunner make a script for you once you allow it:<ol><li><a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener">Open your Apps Script settings</a> (a new tab).</li><li>Click <b>Google Apps Script API</b> and switch it <b>On</b>.</li><li>Close that tab and click <b>Try again</b> here.</li></ol><div class="row"><button class="btn" id="again">Try again</button></div></div>');
            var a = document.getElementById('again'); if (a) a.onclick = function () { build().catch(fail); };
            return;
        }
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
            return build();
        });
    }
    function build() {
        draw();
        return Promise.resolve()
            .then(function () { if (S.sheetId) return; return api('POST', 'https://www.googleapis.com/drive/v3/files?fields=id', { name: 'HouseRunner MAIN DATA', mimeType: 'application/vnd.google-apps.spreadsheet', appProperties: { houserunner: 'beta-installer' } }).then(function (f) { S.sheetId = f.id; save(); draw(); }); })
            .then(function () { if (S.scriptId) return; return api('POST', 'https://script.googleapis.com/v1/projects', { title: 'HouseRunner', parentId: S.sheetId }).then(function (p) { S.scriptId = p.scriptId; save(); draw(); }); })
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
            .then(function () { draw(); return check(true); });
    }
    function webUrl(d) { var e = (d.entryPoints || []).filter(function (x) { return x.webApp && x.webApp.url; })[0]; return e ? e.webApp.url : ''; }

    /** Approval happens in this same tab (a separate window couldn't be closed for you once Google had shown its pages in it).
     *  The script's "Published!" page then links straight on to the normal setup. */
    function approve() { note('approve: going to Google'); save(); location.href = S.url + '?hrbeta=1'; }
    /** Does the published script answer, and has its first visit set the Sheet up? (Before approval, Google answers with a sign-in page, not HouseRunner.) */
    function check(quiet) {
        if (!S.url) return Promise.resolve(false);
        return fetch(S.url + '?action=ping&t=' + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
            if (d && d.ok && d.app === 'family-dashboard' && d.setupDone !== false) { S.answered = true; save(); note('ping ok ' + (d.version || '')); return true; }
            note('ping: not ready ' + JSON.stringify(d).slice(0, 120)); return false;
        }, function () { if (!quiet) note('ping: no answer yet'); return false; });
    }

    loadConfig().then(function () {
        draw();
        if (S.url && !S.answered) check(true).then(function (ok) { if (ok) draw(); });
    });
})();
