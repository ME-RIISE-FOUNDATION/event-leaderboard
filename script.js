/* =========================================================================
   Event Leaderboard System — shared logic
   -------------------------------------------------------------------------
   Two data modes, chosen automatically:
     • SERVER mode  — talks to api.php (data.json on the host). Data is shared
                      live across every visitor. Used when the site is served
                      over http(s) with PHP available (e.g. Hostinger).
     • LOCAL mode   — falls back to localStorage when there is no backend
                      (e.g. opening the .html files directly from disk).
   ========================================================================= */

(function () {
  'use strict';

  const API_URL = 'api.php';
  const STORAGE_KEY = 'eventLeaderboardData';
  const PWD_KEY = 'eventLeaderboardPwd';
  const POLL_MS = 12000; // public page refresh interval in SERVER mode

  let appMode = 'local';                    // 'server' | 'local'
  let adminPassword = '';                   // used to sign writes in SERVER mode
  let appState = { events: [], participants: [] };

  /* ---------------------------------------------------------------------
     Sample data — seeded on first run so the app works immediately.
     --------------------------------------------------------------------- */
  const SAMPLE_DATA = {
    events: ['Hackathon 2026', 'AI Innovation Challenge', 'Robotics Cup'],
    participants: [
      { id: 'p1',  name: 'Nova Coders',      org: 'MIT',              event: 'Hackathon 2026',          score: 980, image: '' },
      { id: 'p2',  name: 'Byte Force',       org: 'Stanford',         event: 'Hackathon 2026',          score: 945, image: '' },
      { id: 'p3',  name: 'Quantum Squad',    org: 'Carnegie Mellon',  event: 'Hackathon 2026',          score: 920, image: '' },
      { id: 'p4',  name: 'Pixel Pirates',    org: 'UC Berkeley',      event: 'Hackathon 2026',          score: 870, image: '' },
      { id: 'p5',  name: 'Debug Dynasty',    org: 'Georgia Tech',     event: 'Hackathon 2026',          score: 815, image: '' },
      { id: 'p6',  name: 'Syntax Errors',    org: 'Caltech',          event: 'Hackathon 2026',          score: 760, image: '' },
      { id: 'p7',  name: 'Neural Ninjas',    org: 'Oxford',           event: 'AI Innovation Challenge', score: 890, image: '' },
      { id: 'p8',  name: 'Deep Thinkers',    org: 'Cambridge',        event: 'AI Innovation Challenge', score: 890, image: '' },
      { id: 'p9',  name: 'Vector Vipers',    org: 'ETH Zurich',       event: 'AI Innovation Challenge', score: 845, image: '' },
      { id: 'p10', name: 'Tensor Titans',    org: 'NUS',              event: 'AI Innovation Challenge', score: 790, image: '' },
      { id: 'p11', name: 'Steel Wolves',     org: 'TU Munich',        event: 'Robotics Cup',            score: 720, image: '' },
      { id: 'p12', name: 'Gear Grinders',    org: 'KAIST',            event: 'Robotics Cup',            score: 705, image: '' },
      { id: 'p13', name: 'Circuit Breakers', org: 'IIT Bombay',       event: 'Robotics Cup',            score: 680, image: '' }
    ]
  };

  /* ---------------------------------------------------------------------
     Safe localStorage wrapper (used for LOCAL mode + as an offline cache).
     Falls back to an in-memory object if storage is blocked so nothing
     ever throws — private mode, file://, sandboxed webviews, etc.
     --------------------------------------------------------------------- */
  const memoryStore = {};
  const storage = {
    get: function (key) {
      try { return window.localStorage.getItem(key); }
      catch (e) { return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, value); }
      catch (e) { memoryStore[key] = value; }
    },
    session: {
      get: function (key) {
        try { return window.sessionStorage.getItem(key); } catch (e) { return null; }
      },
      set: function (key, value) {
        try { window.sessionStorage.setItem(key, value); } catch (e) {}
      },
      del: function (key) {
        try { window.sessionStorage.removeItem(key); } catch (e) {}
      }
    }
  };

  function structuredCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

  function uid() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function isValidShape(d) {
    return d && Array.isArray(d.events) && Array.isArray(d.participants);
  }

  /* ---------------------------------------------------------------------
     API client
     --------------------------------------------------------------------- */
  async function apiGet() {
    const res = await fetch(API_URL, { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!isValidShape(data)) throw new Error('bad shape');
    return data;
  }

  async function apiVerify(password) {
    // Send the password in BOTH the header and the body — some hosts strip
    // custom headers, so the body is the reliable fallback.
    // Returns { ok, status } so the caller can explain *why* it failed.
    try {
      const res = await fetch(API_URL + '?action=verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        body: JSON.stringify({ password: password })
      });
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, status: 0, error: e && e.message };
    }
  }

  async function apiSave(data, password) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
      body: JSON.stringify({ data: data, password: password })
    });
    if (res.status === 401) { const e = new Error('unauthorized'); e.code = 401; throw e; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* ---------------------------------------------------------------------
     LOCAL-mode persistence
     --------------------------------------------------------------------- */
  function loadLocal() {
    const raw = storage.get(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (isValidShape(parsed)) return parsed;
      } catch (e) { /* fall through to seed */ }
    }
    const seed = structuredCopy(SAMPLE_DATA);
    storage.set(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  /* ---------------------------------------------------------------------
     Unified load / save (mode-aware)
     --------------------------------------------------------------------- */
  async function loadState() {
    try {
      const data = await apiGet();
      appMode = 'server';
      appState = data;
      storage.set(STORAGE_KEY, JSON.stringify(data)); // offline cache
      return appState;
    } catch (e) {
      appMode = 'local';
      appState = loadLocal();
      return appState;
    }
  }

  async function saveState() {
    if (appMode === 'server') {
      const result = await apiSave(appState, adminPassword);
      if (result && result.data) appState = result.data;
      storage.set(STORAGE_KEY, JSON.stringify(appState));
      return appState;
    }
    storage.set(STORAGE_KEY, JSON.stringify(appState));
    return appState;
  }

  /* ---------------------------------------------------------------------
     Ranking engine
     Standard competition ranking (1, 2, 2, 4) so ties are handled fairly.
     --------------------------------------------------------------------- */
  function getRanked(data, eventName) {
    const list = data.participants
      .filter(function (p) { return p.event === eventName; })
      .slice()
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.name.localeCompare(b.name);
      });

    let rank = 0, position = 0, prevScore = null;
    list.forEach(function (p) {
      position += 1;
      if (p.score !== prevScore) { rank = position; prevScore = p.score; }
      p.rank = rank;
    });
    return list;
  }

  /* ---------------------------------------------------------------------
     Avatar helper — image if provided, else a colored initials badge.
     --------------------------------------------------------------------- */
  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
  }
  function colorFromName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return 'hsl(' + (Math.abs(hash) % 360) + ', 65%, 55%)';
  }
  function avatarHTML(p, className) {
    if (p.image && p.image.trim()) {
      return '<img class="' + className + ' team-avatar-img" src="' + escapeAttr(p.image) +
        '" alt="' + escapeAttr(p.name) +
        '" data-name="' + escapeAttr(p.name) +
        '" data-cls="' + escapeAttr(className) + '">';
    }
    return fallbackAvatarHTML(p.name, className);
  }
  function fallbackAvatarHTML(name, className) {
    return '<div class="' + className + ' avatar-initials" style="background:' +
      colorFromName(name) + '">' + escapeHTML(initials(name)) + '</div>';
  }
  // <img> error events don't bubble — capture them and swap to initials.
  document.addEventListener('error', function (e) {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.classList &&
        img.classList.contains('team-avatar-img')) {
      const name = img.getAttribute('data-name') || '';
      const cls = img.getAttribute('data-cls') || '';
      img.outerHTML = fallbackAvatarHTML(name, cls);
    }
  }, true);

  /* ---------------------------------------------------------------------
     Escaping
     --------------------------------------------------------------------- */
  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(str) { return escapeHTML(str); }

  /* =====================================================================
     PUBLIC LEADERBOARD (index.html)
     ===================================================================== */
  async function initPublic() {
    const eventSelect = document.getElementById('event-select');
    const podium = document.getElementById('podium');
    const rankingBody = document.getElementById('ranking-body');
    const emptyState = document.getElementById('empty-state');
    const rankingCard = document.getElementById('ranking-card');
    const eventTitle = document.getElementById('current-event-title');
    const liveStatus = document.getElementById('live-status');

    let lastSnapshot = '';

    function populateEvents() {
      const current = eventSelect.value;
      eventSelect.innerHTML = '';
      appState.events.forEach(function (ev) {
        const opt = document.createElement('option');
        opt.value = ev; opt.textContent = ev;
        eventSelect.appendChild(opt);
      });
      if (current && appState.events.indexOf(current) !== -1) eventSelect.value = current;
    }

    function updateStatus() {
      if (!liveStatus) return;
      if (appMode === 'server') {
        liveStatus.className = 'live-pill online';
        liveStatus.innerHTML = '<span class="dot"></span> Live';
      } else {
        liveStatus.className = 'live-pill offline';
        liveStatus.innerHTML = '<span class="dot"></span> Local preview';
      }
    }

    function render() {
      populateEvents();
      updateStatus();
      const eventName = eventSelect.value || appState.events[0];
      if (eventTitle) eventTitle.textContent = eventName || '—';
      const ranked = getRanked(appState, eventName);

      if (ranked.length === 0) {
        podium.innerHTML = '';
        rankingBody.innerHTML = '';
        emptyState.hidden = false;
        rankingCard.hidden = true;
        return;
      }
      emptyState.hidden = true;
      rankingCard.hidden = false;
      renderPodium(ranked.slice(0, 3), eventName);
      renderRankingTable(ranked);
    }

    function renderPodium(top, eventName) {
      const order = [top[1], top[0], top[2]]; // 2nd | 1st | 3rd
      const meta = {
        1: { cls: 'first',  medal: '🥇', label: 'Champion' },
        2: { cls: 'second', medal: '🥈', label: 'Runner-up' },
        3: { cls: 'third',  medal: '🥉', label: 'Second Runner-up' }
      };
      podium.innerHTML = '';
      order.forEach(function (p, idx) {
        if (!p) return;
        const m = meta[p.rank] || meta[idx + 1] || meta[1];
        const card = document.createElement('article');
        card.className = 'podium-card ' + m.cls;
        card.style.animationDelay = (idx * 0.12) + 's';
        card.innerHTML =
          '<div class="podium-medal">' + m.medal + '</div>' +
          '<div class="podium-rank-badge">Rank ' + p.rank + '</div>' +
          avatarHTML(p, 'podium-avatar') +
          '<h3 class="podium-name">' + escapeHTML(p.name) + '</h3>' +
          (p.org ? '<p class="podium-org">' + escapeHTML(p.org) + '</p>' : '') +
          '<div class="podium-score"><span class="score-value">' + p.score +
          '</span><span class="score-label">points</span></div>' +
          '<div class="podium-position">' + m.label + '</div>' +
          '<div class="podium-event">' + escapeHTML(eventName) + '</div>';
        podium.appendChild(card);
      });
    }

    function renderRankingTable(ranked) {
      rankingBody.innerHTML = '';
      ranked.forEach(function (p) {
        const tr = document.createElement('tr');
        if (p.rank <= 3) tr.className = 'top-row rank-' + p.rank;
        const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : '';
        tr.innerHTML =
          '<td class="col-rank"><span class="rank-pill">' + medal + ' ' + p.rank + '</span></td>' +
          '<td class="col-name"><div class="name-cell">' + avatarHTML(p, 'row-avatar') +
            '<span>' + escapeHTML(p.name) + '</span></div></td>' +
          '<td class="col-org">' + escapeHTML(p.org || '—') + '</td>' +
          '<td class="col-score">' + p.score + '</td>';
        rankingBody.appendChild(tr);
      });
    }

    // Re-render only when the underlying data actually changed, so live
    // polling doesn't replay the podium animation every cycle.
    function renderIfChanged() {
      const snap = JSON.stringify(appState);
      if (snap === lastSnapshot) { updateStatus(); return; }
      lastSnapshot = snap;
      render();
    }

    eventSelect.addEventListener('change', render);

    // Cross-tab live updates in LOCAL mode.
    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY && appMode === 'local') {
        appState = loadLocal();
        renderIfChanged();
      }
    });

    await loadState();
    lastSnapshot = JSON.stringify(appState);
    render();

    // Live polling in SERVER mode — pull fresh scores on an interval.
    if (appMode === 'server') {
      setInterval(async function () {
        try {
          const data = await apiGet();
          appState = data;
          storage.set(STORAGE_KEY, JSON.stringify(data));
          renderIfChanged();
        } catch (e) { /* transient network error — try again next tick */ }
      }, POLL_MS);
    }
  }

  /* =====================================================================
     ADMIN DASHBOARD (admin.html)
     ===================================================================== */
  async function initAdmin() {
    const els = {
      modeBadge:     document.getElementById('mode-badge'),
      loginOverlay:  document.getElementById('login-overlay'),
      loginForm:     document.getElementById('login-form'),
      loginPwd:      document.getElementById('login-password'),
      loginError:    document.getElementById('login-error'),
      logoutBtn:     document.getElementById('logout-btn'),

      eventSelect:   document.getElementById('admin-event-select'),
      newEvent:      document.getElementById('new-event-name'),
      addEventBtn:   document.getElementById('add-event-btn'),
      deleteEventBtn:document.getElementById('delete-event-btn'),

      form:          document.getElementById('participant-form'),
      formTitle:     document.getElementById('form-title'),
      pid:           document.getElementById('participant-id'),
      pName:         document.getElementById('p-name'),
      pOrg:          document.getElementById('p-org'),
      pScore:        document.getElementById('p-score'),
      pImage:        document.getElementById('p-image'),
      submitBtn:     document.getElementById('form-submit-btn'),
      cancelBtn:     document.getElementById('form-cancel-btn'),

      tableBody:     document.getElementById('admin-table-body'),
      emptyRow:      document.getElementById('admin-empty'),
      countBadge:    document.getElementById('participant-count'),
      resetBtn:      document.getElementById('reset-scores-btn'),
      toast:         document.getElementById('toast')
    };

    function currentEvent() { return els.eventSelect.value || appState.events[0]; }

    function toast(msg, isError) {
      if (!els.toast) return;
      els.toast.textContent = msg;
      els.toast.classList.toggle('error', !!isError);
      els.toast.classList.add('show');
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { els.toast.classList.remove('show'); }, 2600);
    }

    // Persist to server/local. Returns true on success. On auth failure it
    // reopens the login overlay and rolls the change back from the server.
    async function persist(successMsg) {
      try {
        await saveState();
        if (successMsg) toast(successMsg);
        return true;
      } catch (err) {
        if (err && err.code === 401) {
          storage.session.del(PWD_KEY);
          adminPassword = '';
          toast('Session expired — please log in again.', true);
          await reloadFromServer();
          renderTable();
          showLogin();
        } else {
          toast('Could not save: ' + (err && err.message ? err.message : 'network error'), true);
        }
        return false;
      }
    }

    async function reloadFromServer() {
      try { appState = await apiGet(); } catch (e) { /* keep current */ }
    }

    function updateModeBadge() {
      if (!els.modeBadge) return;
      if (appMode === 'server') {
        els.modeBadge.className = 'mode-badge online';
        els.modeBadge.innerHTML = '<span class="dot"></span> Live server';
        if (els.logoutBtn) els.logoutBtn.hidden = false;
      } else {
        els.modeBadge.className = 'mode-badge offline';
        els.modeBadge.innerHTML = '<span class="dot"></span> Local preview (not shared)';
        if (els.logoutBtn) els.logoutBtn.hidden = true;
      }
    }

    function populateEvents() {
      const current = els.eventSelect.value;
      els.eventSelect.innerHTML = '';
      appState.events.forEach(function (ev) {
        const opt = document.createElement('option');
        opt.value = ev; opt.textContent = ev;
        els.eventSelect.appendChild(opt);
      });
      if (current && appState.events.indexOf(current) !== -1) els.eventSelect.value = current;
    }

    function renderTable() {
      populateEvents();
      const eventName = currentEvent();
      const ranked = getRanked(appState, eventName);
      els.tableBody.innerHTML = '';
      els.countBadge.textContent = ranked.length + (ranked.length === 1 ? ' participant' : ' participants');

      if (ranked.length === 0) { els.emptyRow.hidden = false; return; }
      els.emptyRow.hidden = true;

      ranked.forEach(function (p) {
        const tr = document.createElement('tr');
        if (p.rank <= 3) tr.className = 'rank-' + p.rank;
        const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : '';
        tr.innerHTML =
          '<td><span class="rank-pill">' + medal + ' ' + p.rank + '</span></td>' +
          '<td><div class="name-cell">' + avatarHTML(p, 'row-avatar') +
            '<span>' + escapeHTML(p.name) + '</span></div></td>' +
          '<td>' + escapeHTML(p.org || '—') + '</td>' +
          '<td class="col-score">' +
            '<div class="score-cell">' +
              '<span class="quick-add">' +
                '<button class="btn-quick minus" data-id="' + p.id + '" data-add="-10" title="Subtract 10 points">-10</button>' +
                '<button class="btn-quick minus" data-id="' + p.id + '" data-add="-5" title="Subtract 5 points">-5</button>' +
              '</span>' +
              '<span class="score-num">' + p.score + '</span>' +
              '<span class="quick-add">' +
                '<button class="btn-quick plus" data-id="' + p.id + '" data-add="5" title="Add 5 points">+5</button>' +
                '<button class="btn-quick plus" data-id="' + p.id + '" data-add="10" title="Add 10 points">+10</button>' +
              '</span>' +
            '</div>' +
          '</td>' +
          '<td class="col-actions">' +
            '<button class="btn-icon edit" data-id="' + p.id + '" title="Edit">✏️</button>' +
            '<button class="btn-icon delete" data-id="' + p.id + '" title="Delete">🗑️</button>' +
          '</td>';
        els.tableBody.appendChild(tr);
      });
    }

    function resetForm() {
      els.form.reset();
      els.pid.value = '';
      els.formTitle.textContent = 'Add Participant';
      els.submitBtn.textContent = 'Add Participant';
      els.cancelBtn.hidden = true;
    }

    function startEdit(id) {
      const p = appState.participants.find(function (x) { return x.id === id; });
      if (!p) return;
      els.pid.value = p.id;
      els.pName.value = p.name;
      els.pOrg.value = p.org || '';
      els.pScore.value = p.score;
      els.pImage.value = p.image || '';
      els.formTitle.textContent = 'Edit Participant';
      els.submitBtn.textContent = 'Update Participant';
      els.cancelBtn.hidden = false;
      els.pName.focus();
      if (els.form.scrollIntoView) els.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /* ------- Login overlay ------- */
    function showLogin() {
      if (!els.loginOverlay) return;
      els.loginOverlay.hidden = false;
      els.loginError.hidden = true;
      els.loginPwd.value = '';
      setTimeout(function () { els.loginPwd.focus(); }, 50);
    }
    function hideLogin() {
      if (els.loginOverlay) els.loginOverlay.hidden = true;
    }

    if (els.loginForm) {
      els.loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const pwd = els.loginPwd.value;
        els.loginError.hidden = true;
        const result = await apiVerify(pwd);
        if (result.ok) {
          adminPassword = pwd;
          storage.session.set(PWD_KEY, pwd);
          hideLogin();
          await reloadFromServer();
          renderTable();
          toast('Logged in.');
        } else {
          els.loginError.hidden = false;
          if (result.status === 401) {
            els.loginError.textContent =
              'Incorrect password. It must exactly match ADMIN_PASSWORD in config.php.';
          } else if (result.status === 0) {
            els.loginError.textContent =
              'Could not reach api.php (network/CORS). Is PHP running and the file uploaded?';
          } else {
            els.loginError.textContent =
              'Server error from api.php (HTTP ' + result.status + '). Check the file on your host.';
          }
        }
      });
    }
    if (els.logoutBtn) {
      els.logoutBtn.addEventListener('click', function () {
        storage.session.del(PWD_KEY);
        adminPassword = '';
        showLogin();
      });
    }

    /* ------- Event + participant handlers ------- */
    els.eventSelect.addEventListener('change', function () { resetForm(); renderTable(); });

    els.addEventBtn.addEventListener('click', async function () {
      const name = els.newEvent.value.trim();
      if (!name) { toast('Enter an event name.', true); return; }
      if (appState.events.indexOf(name) !== -1) { toast('Event already exists.', true); return; }
      appState.events.push(name);
      els.newEvent.value = '';
      populateEvents();
      els.eventSelect.value = name;
      renderTable();
      await persist('Event "' + name + '" added.');
    });

    els.deleteEventBtn.addEventListener('click', async function () {
      const eventName = currentEvent();
      if (!eventName) return;
      if (appState.events.length <= 1) { toast('Keep at least one event.', true); return; }
      if (!window.confirm('Delete event "' + eventName + '" and all its participants?')) return;
      appState.events = appState.events.filter(function (e) { return e !== eventName; });
      appState.participants = appState.participants.filter(function (p) { return p.event !== eventName; });
      populateEvents();
      renderTable();
      await persist('Event deleted.');
    });

    els.form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const name = els.pName.value.trim();
      const scoreRaw = els.pScore.value;
      const score = Number(scoreRaw);
      if (!name) { toast('Name is required.', true); return; }
      if (scoreRaw === '' || Number.isNaN(score) || score < 0) {
        toast('Enter a valid score (0 or more).', true); return;
      }
      const editingId = els.pid.value;
      if (editingId) {
        const p = appState.participants.find(function (x) { return x.id === editingId; });
        if (p) { p.name = name; p.org = els.pOrg.value.trim(); p.score = score; p.image = els.pImage.value.trim(); }
      } else {
        appState.participants.push({
          id: uid(), name: name, org: els.pOrg.value.trim(),
          event: currentEvent(), score: score, image: els.pImage.value.trim()
        });
      }
      resetForm();
      renderTable();
      await persist(editingId ? 'Participant updated.' : 'Participant added.');
    });

    els.cancelBtn.addEventListener('click', resetForm);

    els.tableBody.addEventListener('click', async function (e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (btn.classList.contains('btn-quick')) {
        const add = Number(btn.getAttribute('data-add')) || 0;
        const p = appState.participants.find(function (x) { return x.id === id; });
        if (p) {
          p.score = Math.max(0, Number(p.score) + add); // never drop below 0
          renderTable();
          const sign = add >= 0 ? '+' : '';
          await persist(sign + add + ' → ' + p.name + ' (now ' + p.score + ')');
        }
      } else if (btn.classList.contains('edit')) {
        startEdit(id);
      } else if (btn.classList.contains('delete')) {
        const p = appState.participants.find(function (x) { return x.id === id; });
        if (p && window.confirm('Delete "' + p.name + '"?')) {
          appState.participants = appState.participants.filter(function (x) { return x.id !== id; });
          if (els.pid.value === id) resetForm();
          renderTable();
          await persist('Participant deleted.');
        }
      }
    });

    els.resetBtn.addEventListener('click', async function () {
      const eventName = currentEvent();
      if (!window.confirm('Reset all scores to 0 for "' + eventName + '"?')) return;
      appState.participants.forEach(function (p) { if (p.event === eventName) p.score = 0; });
      renderTable();
      await persist('Scores reset to 0.');
    });

    /* ------- Bootstrap ------- */
    await loadState();
    updateModeBadge();
    renderTable();

    if (appMode === 'server') {
      const saved = storage.session.get(PWD_KEY);
      if (saved && (await apiVerify(saved)).ok) {
        adminPassword = saved;
      } else {
        showLogin();
      }
    }
    // LOCAL mode needs no login — edits just go to this browser's storage.
  }

  /* ---------------------------------------------------------------------
     Theme (light / dark) — shared across both pages.
     The initial theme is applied by a tiny inline <head> script (to avoid a
     flash); here we wire the toggle button and persist the choice.
     --------------------------------------------------------------------- */
  function initTheme() {
    const KEY = 'leaderboardTheme';
    const root = document.documentElement;
    const btn = document.getElementById('theme-toggle');

    function current() {
      return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }
    function apply(theme) {
      root.setAttribute('data-theme', theme);
      if (btn) {
        btn.textContent = theme === 'light' ? '🌙' : '☀️';
        const label = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
        btn.setAttribute('aria-label', label);
        btn.title = label;
      }
    }

    apply(current());

    if (btn) {
      btn.addEventListener('click', function () {
        const next = current() === 'light' ? 'dark' : 'light';
        apply(next);
        storage.set(KEY, next);
      });
    }
    // Keep theme in sync if changed in another tab.
    window.addEventListener('storage', function (e) {
      if (e.key === KEY && e.newValue) apply(e.newValue);
    });
  }

  /* ---------------------------------------------------------------------
     Boot — pick the initializer based on which page is loaded, and surface
     any unexpected error instead of leaving a silently dead page.
     --------------------------------------------------------------------- */
  function showFatalError(err) {
    console.error('Leaderboard failed to start:', err);
    const banner = document.createElement('div');
    banner.style.cssText =
      'position:fixed;left:0;right:0;top:0;z-index:9999;padding:14px 18px;' +
      'background:#ff5c7c;color:#1b0007;font:600 14px/1.4 system-ui,sans-serif;' +
      'text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.35)';
    banner.textContent = 'Something went wrong starting the app: ' +
      (err && err.message ? err.message : err) + '. Open the browser console for details.';
    if (document.body) document.body.appendChild(banner);
  }

  async function boot() {
    try {
      initTheme();
      if (document.getElementById('podium')) {
        await initPublic();
      } else if (document.getElementById('participant-form')) {
        await initAdmin();
      }
    } catch (err) {
      showFatalError(err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
