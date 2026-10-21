
    /* ══ BRUTALIST PRE-LOADER SCRIPT ══ */
    window.addEventListener('load', () => {
      let count = 0;
      const counterEl = document.getElementById('loader-count');
      const interval = setInterval(() => {
        count += Math.floor(Math.random() * 18) + 4;
        if (count >= 100) {
          count = 100;
          counterEl.textContent = count;
          clearInterval(interval);
          setTimeout(() => {
            document.getElementById('loading-screen').style.transform = 'translateY(-100%)';
            showScreen('portal-chooser');
          }, 300);
          setTimeout(() => {
            document.getElementById('loading-screen').classList.add('hidden');
          }, 1200);
        } else {
          counterEl.textContent = count;
        }
      }, 30);
    });

    /* ══ FIREBASE CONFIG ══ */
    const FIREBASE_CONFIG = {
      apiKey: "AIzaSyAuj58paFoYaTY4bF9FL_MBZ4cuuCSI0mM",
      authDomain: "northstar-a4517.firebaseapp.com",
      projectId: "northstar-a4517",
      storageBucket: "northstar-a4517.firebasestorage.app",
      messagingSenderId: "20000257503",
      appId: "1:20000257503:web:9ba8ed83fb6fcb4b58006a"
    };

    /* ══ STATE ══ */
    const state = {
      mode: null, user: null, companyProfile: null, applicantProfile: null,
      blueprints: [], screenings: []
    };

    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let db = null, unsubs = [];
    const dbSet = (col, id, data) => db ? db.collection(col).doc(id).set(data) : Promise.resolve();
    const dbUpdate = (col, id, data) => db ? db.collection(col).doc(id).update(data) : Promise.resolve();
    const dbGet = async (col, id) => db ? ((await db.collection(col).doc(id).get()).data() || null) : null;
    const dbFail = e => toast('Database error: ' + e.message, 'error');
    /* Live sync: role blueprints (all) + this user's screenings from Firestore */
    function startSync() {
      unsubs.forEach(u => u()); unsubs = [];
      if (!db) return;
      const uid = state.user.uid, co = state.mode === 'company';
      unsubs.push(db.collection('blueprints').onSnapshot(s => {
        state.blueprints = s.docs.map(d => d.data()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        co ? renderCompanyBlueprints() : renderApplicantJobs();
      }, dbFail));
      unsubs.push(db.collection('screenings').where(co ? 'companyUid' : 'applicantUid', '==', uid).onSnapshot(s => {
        state.screenings = s.docs.map(d => d.data()).sort((a, b) => new Date(b.date) - new Date(a.date));
        co ? renderCompanyScreenings() : updateApplicantStats();
      }, dbFail));
    }
    function toast(msg, type = 'success') {
      const t = document.createElement('div');
      t.className = `toast ${type}`;
      t.innerHTML = `<span style="font-size:16px; font-family:var(--font-mono)">[${type.toUpperCase()}]</span> ${msg}`;
      document.getElementById('toast-container').appendChild(t);
      setTimeout(() => t.remove(), 4000);
    }

    let firebaseReady = false, auth = null;
    try { firebase.initializeApp(FIREBASE_CONFIG); auth = firebase.auth(); db = firebase.firestore(); firebaseReady = true; }
    catch (e) { console.warn('Firebase error:', e.message); }

    const ALL_SCREENS = ['portal-chooser', 'company-auth', 'company-onboard', 'applicant-auth', 'applicant-onboard', 'company-app', 'applicant-app'];
    function showScreen(id) { ALL_SCREENS.forEach(s => document.getElementById(s).classList.toggle('hidden', s !== id)); }

    /* ══ AUTH UI SETTERS ══ */
    function setCompanyAuthMode(mode) {
      const el = document.getElementById('company-auth-right');
      if (mode === 'login') {
        el.innerHTML = `
      <div class="form-section-title">Admin Login</div>
      <button class="btn-social" id="btn-co-google">Continue with Google</button>
      <div class="auth-divider">or use email</div>
      <input class="form-input form-field" id="co-login-email" type="email" placeholder="Work Email">
      <input class="form-input form-field" id="co-login-password" type="password" placeholder="Password">
      <button class="btn-primary accent form-field" id="btn-co-email-login">Sign In</button>
      <div class="auth-switch">New organization? <a onclick="setCompanyAuthMode('register')">Register here</a></div>`;
      } else {
        el.innerHTML = `
      <div class="form-section-title">Create Admin</div>
      <button class="btn-social" id="btn-co-google-reg">Register with Google</button>
      <div class="auth-divider">or use email</div>
      <input class="form-input form-field" id="co-reg-email" type="email" placeholder="Work Email">
      <input class="form-input form-field" id="co-reg-password" type="password" placeholder="Secure Password">
      <button class="btn-primary accent form-field" id="btn-co-email-reg">Create Account</button>
      <div class="auth-switch">Already registered? <a onclick="setCompanyAuthMode('login')">Sign in</a></div>`;
      }
      document.getElementById('btn-co-google')?.addEventListener('click', () => socialLogin('company'));
      document.getElementById('btn-co-google-reg')?.addEventListener('click', () => socialLogin('company'));
      document.getElementById('btn-co-email-login')?.addEventListener('click', companyEmailLogin);
      document.getElementById('btn-co-email-reg')?.addEventListener('click', companyEmailRegister);
    }

    function setApplicantAuthMode(mode) {
      const el = document.getElementById('applicant-auth-right');
      if (mode === 'login') {
        el.innerHTML = `
      <div class="form-section-title">Candidate Login</div>
      <button class="btn-social" id="btn-ap-google">Continue with Google</button>
      <div class="auth-divider">or use email</div>
      <input class="form-input form-field" id="ap-login-email" type="email" placeholder="Email Address">
      <input class="form-input form-field" id="ap-login-password" type="password" placeholder="Password">
      <button class="btn-primary blue form-field" id="btn-ap-email-login">Access Portal</button>
      <div class="auth-switch">First time applying? <a onclick="setApplicantAuthMode('register')">Register here</a></div>`;
      } else {
        el.innerHTML = `
      <div class="form-section-title">Create Profile</div>
      <button class="btn-social" id="btn-ap-google-reg">Register with Google</button>
      <div class="auth-divider">or use email</div>
      <input class="form-input form-field" id="ap-reg-email" type="email" placeholder="Email Address">
      <input class="form-input form-field" id="ap-reg-password" type="password" placeholder="Password">
      <button class="btn-primary blue form-field" id="btn-ap-email-reg">Create Profile</button>
      <div class="auth-switch">Already registered? <a onclick="setApplicantAuthMode('login')">Sign in</a></div>`;
      }
      document.getElementById('btn-ap-google')?.addEventListener('click', () => socialLogin('applicant'));
      document.getElementById('btn-ap-google-reg')?.addEventListener('click', () => socialLogin('applicant'));
      document.getElementById('btn-ap-email-login')?.addEventListener('click', applicantEmailLogin);
      document.getElementById('btn-ap-email-reg')?.addEventListener('click', applicantEmailRegister);
    }

    /* ══ AUTH LOGIC ══ */
    async function socialLogin(mode) {
      if (!firebaseReady) { simulateAuth(mode); return; }
      try {
        const p = new firebase.auth.GoogleAuthProvider();
        const cred = await auth.signInWithPopup(p);
        state.mode = mode; state.user = cred.user; routeUserAfterAuth();
      } catch (e) { toast(e.message, 'error'); }
    }
    async function companyEmailLogin() {
      if (!firebaseReady) return simulateAuth('company');
      try {
        const cred = await auth.signInWithEmailAndPassword(document.getElementById('co-login-email').value, document.getElementById('co-login-password').value);
        state.mode = 'company'; state.user = cred.user; routeUserAfterAuth();
      } catch (e) { toast(e.message, 'error'); }
    }
    async function companyEmailRegister() {
      if (!firebaseReady) return simulateAuth('company');
      try {
        const cred = await auth.createUserWithEmailAndPassword(document.getElementById('co-reg-email').value, document.getElementById('co-reg-password').value);
        state.mode = 'company'; state.user = cred.user; routeUserAfterAuth();
      } catch (e) { toast(e.message, 'error'); }
    }
    async function applicantEmailLogin() {
      if (!firebaseReady) return simulateAuth('applicant');
      try {
        const cred = await auth.signInWithEmailAndPassword(document.getElementById('ap-login-email').value, document.getElementById('ap-login-password').value);
        state.mode = 'applicant'; state.user = cred.user; routeUserAfterAuth();
      } catch (e) { toast(e.message, 'error'); }
    }
    async function applicantEmailRegister() {
      if (!firebaseReady) return simulateAuth('applicant');
      try {
        const cred = await auth.createUserWithEmailAndPassword(document.getElementById('ap-reg-email').value, document.getElementById('ap-reg-password').value);
        state.mode = 'applicant'; state.user = cred.user; routeUserAfterAuth();
      } catch (e) { toast(e.message, 'error'); }
    }

    function simulateAuth(mode) {
      state.mode = mode;
      state.user = { uid: mode + '_sim_' + Date.now(), displayName: mode === 'company' ? 'HR Team' : 'Applicant', email: 'test@proto.co' };
      routeUserAfterAuth();
    }

    async function routeUserAfterAuth() {
      if (state.mode === 'company') {
        let saved = null; try { saved = await dbGet('companies', state.user.uid); } catch (e) { return dbFail(e); }
        if (saved) { state.companyProfile = saved; initCompanyApp(); }
        else {
          if (state.user.email) document.getElementById('co-email').value = state.user.email;
          if (state.user.displayName) document.getElementById('co-contact-name').value = state.user.displayName;
          showScreen('company-onboard');
        }
      } else {
        let saved = null; try { saved = await dbGet('applicants', state.user.uid); } catch (e) { return dbFail(e); }
        if (saved) { state.applicantProfile = saved; initApplicantApp(); }
        else {
          if (state.user.email) document.getElementById('ap-email').value = state.user.email;
          if (state.user.displayName) {
            document.getElementById('ap-fname').value = state.user.displayName.split(' ')[0];
            document.getElementById('ap-lname').value = state.user.displayName.split(' ').slice(1).join(' ');
          }
          showScreen('applicant-onboard');
        }
      }
    }

    /* ══ ONBOARDING ══ */
    document.getElementById('btn-co-onboard-submit').addEventListener('click', () => {
      const name = document.getElementById('co-company-name').value;
      if (!name) return toast('Company name required', 'error');
      state.companyProfile = { companyName: name, email: document.getElementById('co-email').value };
      dbSet('companies', state.user.uid, state.companyProfile).catch(dbFail);
      initCompanyApp();
    });

    document.getElementById('btn-ap-onboard-submit').addEventListener('click', () => {
      const fname = document.getElementById('ap-fname').value;
      if (!fname) return toast('First name required', 'error');
      state.applicantProfile = { firstName: fname, lastName: document.getElementById('ap-lname').value, email: document.getElementById('ap-email').value, resume: '', education: '', experience: '', achievements: '', skills: '' };
      dbSet('applicants', state.user.uid, state.applicantProfile).catch(dbFail);
      initApplicantApp();
    });

    /* ══ COMPANY APP INIT & LOGIC ══ */
    function showPage(pageId) {
      document.querySelectorAll('.sidebar .nav-item').forEach(x => x.classList.remove('active'));
      const activeNav = document.querySelector(`.sidebar .nav-item[data-page="${pageId}"]`);
      if (activeNav) activeNav.classList.add('active');
      document.querySelectorAll('.main-content .page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-' + pageId).classList.add('active');
      const titleMap = { 'dashboard': 'Dashboard Overview', 'blueprints': 'Role Blueprints', 'create-bp': 'Create New Role', 'results': 'Applicant Rankings' };
      document.getElementById('co-page-title').textContent = titleMap[pageId];
      document.getElementById('co-back-btn').style.display = (pageId === 'dashboard') ? 'none' : 'inline-flex';
    }

    function initCompanyApp() {
      toast('Admin authenticated successfully.', 'success');
      showScreen('company-app'); startSync();
      document.getElementById('sidebar-co-name').textContent = state.companyProfile.companyName;
      document.querySelectorAll('.sidebar .nav-item[data-page]').forEach(n => { n.addEventListener('click', () => showPage(n.dataset.page)); });
      renderCompanyBlueprints(); renderCompanyScreenings(); showPage('dashboard');
    }

    document.getElementById('btn-save-bp').addEventListener('click', () => {
      const title = document.getElementById('cbp-title').value;
      const score = document.getElementById('cbp-score').value;
      if (!title || !score) return toast('Title and Threshold Score are required', 'error');

      const bp = { id: 'bp_' + Date.now(), ownerUid: state.user.uid, company: state.companyProfile.companyName, role: title, department: document.getElementById('cbp-dept').value, experience: document.getElementById('cbp-exp').value, skills: document.getElementById('cbp-skills').value, passingScore: parseInt(score), createdAt: Date.now() };

      state.blueprints.unshift(bp); dbSet('blueprints', bp.id, bp).catch(dbFail); toast('Role Blueprint saved to database.', 'success');
      document.getElementById('cbp-title').value = ''; document.getElementById('cbp-skills').value = ''; showPage('blueprints'); renderCompanyBlueprints();
    });

    function renderCompanyBlueprints() {
      const myBPs = state.blueprints.filter(bp => bp.ownerUid === state.user.uid);
      const grid = document.getElementById('blueprint-grid'); const empty = document.getElementById('bp-empty-state');
      document.getElementById('stat-bps').textContent = myBPs.length;

      if (myBPs.length === 0) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
      empty.classList.add('hidden');

      grid.innerHTML = myBPs.map(bp => `
    <div class="card" style="padding:24px; margin:0; display:flex; flex-direction:column; justify-content:space-between; border:1px solid var(--ink);">
      <div>
        <div style="font-family:var(--font-mono); font-weight:700; font-size:10px; color:var(--ink); margin-bottom:6px; text-transform:uppercase;">${esc(bp.department || 'General')}</div>
        <div style="font-family:var(--font-sans); font-weight:800; font-size:24px; text-transform:uppercase; margin-bottom:8px; line-height:1.1;">${esc(bp.role)}</div>
        <div style="font-size:13px; font-weight:500; color:var(--ink2); margin-bottom:16px;">Exp: ${esc(bp.experience || 'Not specified')}</div>
      </div>
      <div style="border-top:1px solid var(--border-dark); padding-top:16px;">
        <div style="font-family:var(--font-mono); font-weight:700; font-size:10px; color:var(--ink); margin-bottom:4px; text-transform:uppercase;">Target Threshold</div>
        <div style="font-size:24px; font-weight:800; font-family:var(--font-sans);">${bp.passingScore}/100</div>
      </div>
    </div>`).join('');
    }

    const BACKEND_URL = window.NORTHSTAR_API_URL || "https://northstar-backend-j6ye.onrender.com/api/evaluate";

    async function callGemini(promptText, retries = 3) {
      const thinkingText = document.getElementById('thinking-text');
      try {
        if (thinkingText) {
          thinkingText.innerText = retries === 3 ? "Connecting to Secure AI... (Cold starts take ~30s)" : `Waking up server... (Attempts remaining: ${retries})`;
        }
        const res = await fetch(BACKEND_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: promptText })
        });

        if (!res.ok) throw new Error("Server not ready yet.");
        const data = await res.json();
        return data.aiResponse;
      } catch (error) {
        if (retries > 0) {
          if (thinkingText) thinkingText.innerText = "Server is booting. Waiting 10 seconds...";
          await new Promise(r => setTimeout(r, 10000));
          return callGemini(promptText, retries - 1);
        } else {
          throw new Error("Server took too long to wake up. Please refresh and try again.");
        }
      }
    }

    /* ══ COMPANY ACTIONS ══ */
    window.toggleDetails = function (id) {
      document.getElementById('details-' + id).classList.toggle('open');
    };

    window.setDecision = function (id, decision, event) {
      event.stopPropagation(); // prevent row click
      const sc = state.screenings.find(s => s.id === id);
      if (sc) {
        sc.finalDecision = decision;
        dbUpdate('screenings', id, { finalDecision: decision }).catch(dbFail);
        renderCompanyScreenings();
      }
    };

    window.publishResult = function (id, event) {
      event.stopPropagation();
      const sc = state.screenings.find(s => s.id === id);
      if (sc) {
        if (sc.finalDecision === 'PENDING') return toast('You must select Hire or Reject first.', 'warn');
        sc.published = true;
        dbUpdate('screenings', id, { published: true }).catch(dbFail);
        renderCompanyScreenings();
        toast('Result officially published to candidate!', 'success');
      }
    };

    function renderCompanyScreenings() {
      let myScreenings = state.screenings.filter(s => s.companyUid === state.user.uid);

      // Sort by Score (Rankings)
      myScreenings.sort((a, b) => b.score - a.score);

      // THE FIX: Capture which rows are currently expanded before redrawing
      const openRows = Array.from(document.querySelectorAll('.expandable-row.open')).map(row => row.id);

      const tbody = document.getElementById('results-tbody'); const recent = document.getElementById('recent-screenings-list');
      let passedAI = 0; let publishedCount = 0;

      myScreenings.forEach(s => {
        if (s.status === 'PASS') passedAI++;
        if (s.published) publishedCount++;
      });

      document.getElementById('stat-total').textContent = myScreenings.length;
      document.getElementById('stat-passed').textContent = passedAI;
      document.getElementById('stat-published').textContent = publishedCount;

      if (myScreenings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:16px; text-align:center; color:var(--ink3);">No applications received yet.</td></tr>';
        recent.innerHTML = 'Waiting for candidates to apply.';
        recent.classList.add('empty-state');
        return;
      }

      const rows = myScreenings.map((s, index) => {
        let decisionText = "PENDING";
        let badgeClass = "";
        if (s.finalDecision === 'HIRED') { decisionText = "OFFERED"; badgeClass = "pass"; }
        if (s.finalDecision === 'REJECTED') { decisionText = "REJECTED"; badgeClass = "fail"; }
        if (s.published) decisionText += " (PUBLISHED)";

        // THE FIX: Check if this row was open before the redraw
        const isOpen = openRows.includes(`details-${s.id}`) ? 'open' : '';

        return `
      <tr class="candidate-row" style="border-bottom:1px solid var(--border-dark); cursor:pointer;" onclick="toggleDetails('${s.id}')">
        <td style="padding:16px;"><span style="font-weight:800; color:var(--ink3); margin-right:8px;">#${index + 1}</span> <span style="font-weight:700;">${esc(s.applicantName)}</span></td>
        <td style="padding:16px; font-weight:500;">${esc(s.role)}</td>
        <td style="padding:16px; font-family:var(--font-sans); font-size:16px; font-weight:800; color:${s.status === 'PASS' ? 'var(--pass)' : 'var(--ink)'};">${s.score}/100 <span style="font-size:11px; font-weight:500; color:var(--ink3); margin-left:4px;">(${s.status})</span></td>
        <td style="padding:16px;"><span class="status-badge ${badgeClass}" style="${badgeClass === '' ? 'background:transparent; color:#9A9A95; border:1px solid #5A5A56;' : ''}">${decisionText} ▼</span></td>
      </tr>
      <tr id="details-${s.id}" class="expandable-row ${isOpen}">
        <td colspan="4" style="padding:24px; border-bottom:1px solid var(--ink);">
            <div style="display:flex; gap:32px;">
                <div style="flex:1;">
                    <div style="font-family:var(--font-mono); font-size:11px; font-weight:700; text-transform:uppercase; margin-bottom:8px; color:var(--ink3);">AI Evaluation Reasoning</div>
                    <div style="font-size:14px; line-height:1.6; color:var(--ink);">${esc(s.aiReason)}</div>
                </div>
                <div style="width:300px; padding-left:32px; border-left:1px solid var(--border-dark);">
                    <div style="font-family:var(--font-mono); font-size:11px; font-weight:700; text-transform:uppercase; margin-bottom:12px; color:var(--ink3);">HR Action</div>
                    <div style="display:flex; gap:8px; margin-bottom:16px;">
                        <button class="btn-primary" style="flex:1; padding:8px; ${s.finalDecision === 'HIRED' ? 'background:var(--pass); border:none;' : 'background:transparent; color:var(--ink); border:1px solid var(--border-dark);'}" onclick="setDecision('${s.id}', 'HIRED', event)">Hire</button>
                        <button class="btn-primary" style="flex:1; padding:8px; ${s.finalDecision === 'REJECTED' ? 'background:var(--fail); border:none;' : 'background:transparent; color:var(--ink); border:1px solid var(--border-dark);'}" onclick="setDecision('${s.id}', 'REJECTED', event)">Reject</button>
                    </div>
                    <button class="btn-primary" style="${s.published ? 'background:transparent; color:var(--ink3); cursor:not-allowed;' : 'background:var(--ink);'}" onclick="publishResult('${s.id}', event)" ${s.published ? 'disabled' : ''}>
                        ${s.published ? 'Result Published ✓' : 'Publish Result to Candidate'}
                    </button>
                </div>
            </div>
        </td>
      </tr>`
      }).join('');

      tbody.innerHTML = rows;

      // Update Dashboard Recent Activity
      recent.innerHTML = `<table style="width:100%; border-collapse:collapse; text-align:left;"><thead><tr style="border-bottom:1px solid var(--ink);"><th style="padding:10px 0; font-family:var(--font-mono); font-size:10px; font-weight:700; text-transform:uppercase; color:var(--ink);">Rank</th><th style="padding:10px 0; font-family:var(--font-mono); font-size:10px; font-weight:700; text-transform:uppercase; color:var(--ink);">Candidate</th><th style="padding:10px 0; font-family:var(--font-mono); font-size:10px; font-weight:700; text-transform:uppercase; color:var(--ink);">Score</th></tr></thead><tbody>${myScreenings.slice(0, 5).map((s, idx) => `<tr><td style="padding:12px 0; font-weight:800; color:var(--ink3);">#${idx + 1}</td><td style="padding:12px 0; font-weight:600;">${esc(s.applicantName)}</td><td style="padding:12px 0;"><span class="status-badge ${s.status === 'PASS' ? 'pass' : 'fail'}">${s.score}</span></td></tr>`).join('')}</tbody></table>`;
      recent.classList.remove('empty-state');
    }

    /* ══ APPLICANT APP ══ */
    function switchApTab(tab) {
      document.getElementById('ap-tab-profile').classList.add('hidden');
      document.getElementById('ap-tab-jobs').classList.add('hidden');

      document.getElementById('ap-tab-' + tab).classList.remove('hidden');
      document.getElementById('quick-predict-result').style.display = 'none';

      document.querySelectorAll('.ap-nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick') && link.getAttribute('onclick').includes(tab)) {
          link.classList.add('active');
        }
      });
    }

    function initApplicantApp() {
      toast('Session authenticated.', 'success');
      showScreen('applicant-app'); startSync();
      const prof = state.applicantProfile;

      // Pre-fill Profile Form
      document.getElementById('ap-prof-edu').value = prof.education || '';
      document.getElementById('ap-prof-exp').value = prof.experience || '';
      document.getElementById('ap-prof-ach').value = prof.achievements || '';
      document.getElementById('ap-prof-skills').value = prof.skills || '';
      if (prof.resume) {
        document.getElementById('ap-master-resume').value = prof.resume;
        document.getElementById('master-drop-text-label').textContent = 'Resume Locked ✓';
      }

      updateApplicantStats();
      renderApplicantJobs();
    }

    /* Save Left Panel Profile Data */
    document.getElementById('btn-save-master-profile').addEventListener('click', () => {
      const edu = document.getElementById('ap-prof-edu').value.trim();
      const exp = document.getElementById('ap-prof-exp').value.trim();
      const skills = document.getElementById('ap-prof-skills').value.trim();

      if (!edu || !exp || !skills) return toast('Education, Experience, and Skills are required fields.', 'warn');

      state.applicantProfile.education = edu;
      state.applicantProfile.experience = exp;
      state.applicantProfile.achievements = document.getElementById('ap-prof-ach').value.trim();
      state.applicantProfile.skills = skills;
      state.applicantProfile.resume = document.getElementById('ap-master-resume').value.trim();

      dbSet('applicants', state.user.uid, state.applicantProfile).catch(dbFail);
      toast('Profile data locked successfully.', 'success');
    });

    /* Clear Profile Data */
    document.getElementById('btn-reset-master-profile').addEventListener('click', () => {
      document.getElementById('ap-prof-edu').value = '';
      document.getElementById('ap-prof-exp').value = '';
      document.getElementById('ap-prof-ach').value = '';
      document.getElementById('ap-prof-skills').value = '';
      document.getElementById('ap-master-resume').value = '';
      document.getElementById('ap-master-resume-file').value = '';
      document.getElementById('master-drop-text-label').textContent = 'Drag & Drop Resume';

      state.applicantProfile.education = '';
      state.applicantProfile.experience = '';
      state.applicantProfile.achievements = '';
      state.applicantProfile.skills = '';
      state.applicantProfile.resume = '';

      dbSet('applicants', state.user.uid, state.applicantProfile).catch(dbFail);
      toast('Profile data cleared.', 'warn');
    });

    /* Handle File Upload on Profile */
    const masterDropZone = document.getElementById('master-resume-drop-zone');
    const masterFileInput = document.getElementById('ap-master-resume-file');

    masterDropZone.addEventListener('click', () => masterFileInput.click());
    masterDropZone.addEventListener('dragover', (e) => { e.preventDefault(); masterDropZone.style.borderColor = 'var(--accent-blue)'; });
    masterDropZone.addEventListener('dragleave', (e) => { e.preventDefault(); masterDropZone.style.borderColor = 'var(--ink)'; });
    masterDropZone.addEventListener('drop', (e) => {
      e.preventDefault(); masterDropZone.style.borderColor = 'var(--ink)';
      if (e.dataTransfer.files.length) { masterFileInput.files = e.dataTransfer.files; handleMasterFileUpload(masterFileInput.files[0]); }
    });
    masterFileInput.addEventListener('change', (e) => { if (e.target.files.length) handleMasterFileUpload(e.target.files[0]); });

    function handleMasterFileUpload(file) {
      if (file.name.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = function (e) {
          document.getElementById('ap-master-resume').value = e.target.result;
          document.getElementById('master-drop-text-label').textContent = `Loaded: ${file.name} ✓`;
        };
        reader.readAsText(file);
      } else { toast('Format must be .txt', 'warn'); }
    }

    function updateApplicantStats() {
      const myApps = state.screenings.filter(a => a.applicantUid === state.user.uid);

      let selected = 0; let pending = 0;
      myApps.forEach(a => {
        if (a.published && a.finalDecision === 'HIRED') selected++;
        else if (!a.published || a.finalDecision === 'PENDING') pending++;
      });

      document.getElementById('ap-stat-applied').textContent = myApps.length;
      document.getElementById('ap-stat-selected').textContent = selected;
      document.getElementById('ap-stat-rejected').textContent = pending;

      if (myApps.length > 0) {
        document.getElementById('ap-history-list').innerHTML = myApps.map(a => {
          // Evaluate Visibility Status
          let statusBadge = `<span class="status-badge" style="background:transparent; color:#9A9A95; border:1px solid #5A5A56;">Pending Review</span>`;
          let feedbackHtml = ``;

          if (a.published) {
            if (a.finalDecision === 'HIRED') {
              statusBadge = `<span class="status-badge pass">Offer Received 🎉</span>`;
              feedbackHtml = `<div style="margin-top:16px; padding:16px; background:#171717; border-left:4px solid var(--pass); border-radius:0 6px 6px 0;">
                                  <strong style="display:block; margin-bottom:8px; color:var(--pass);">Company Feedback:</strong> 
                                  <span style="color:#F2F2EC; line-height:1.5;">${esc(a.aiReason)}</span>
                                </div>`;
            } else if (a.finalDecision === 'REJECTED') {
              statusBadge = `<span class="status-badge fail">Not Selected</span>`;
              feedbackHtml = `<div style="margin-top:16px; padding:16px; background:#171717; border-left:4px solid var(--fail); border-radius:0 6px 6px 0;">
                                  <strong style="display:block; margin-bottom:8px; color:var(--fail);">Company Feedback:</strong> 
                                  <span style="color:#EF4960; line-height:1.5;">${esc(a.aiReason)}</span>
                                </div>`;
            }
          }

          return `
        <div style="padding:24px 0; border-bottom:1px solid var(--border-dark);">
           <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
             <span style="font-weight:800; font-size:18px; text-transform:uppercase;">${esc(a.role)}</span>
             ${statusBadge}
           </div>
           <div style="font-family:var(--font-mono); font-size:12px; font-weight:600; color:var(--ink3);">Applied to ${esc(a.company)}</div>
           ${feedbackHtml}
        </div>`
        }).join('');

        document.getElementById('ap-history-list').classList.remove('empty-state');
        document.getElementById('ap-history-list').style.padding = '0';
      } else {
        document.getElementById('ap-history-list').innerHTML = 'You haven\'t applied to any roles yet.<br>Click "Jobs" above to find open positions.';
        document.getElementById('ap-history-list').classList.add('empty-state');
        document.getElementById('ap-history-list').style.padding = '40px 20px';
      }
    }

    /* Render Job List */
    function renderApplicantJobs() {
      const list = document.getElementById('ap-role-list');
      if (state.blueprints.length === 0) {
        list.innerHTML = ''; document.getElementById('ap-role-empty').classList.remove('hidden'); return;
      }
      document.getElementById('ap-role-empty').classList.add('hidden');

      list.innerHTML = state.blueprints.map(bp => `
    <div class="job-list-card" style="border:1px solid var(--ink); border-radius:0;">
      <div class="job-info-area">
        <div style="font-family:var(--font-mono); font-weight:700; font-size:11px; color:var(--ink); text-transform:uppercase; margin-bottom:4px;">${esc(bp.company)}</div>
        <div style="font-family:var(--font-sans); font-weight:800; font-size:24px; text-transform:uppercase; margin-bottom:4px;">${esc(bp.role)}</div>
        <div style="font-size:13px; font-weight:500; color:var(--ink2);">${esc(bp.experience || 'Entry level')} • ${esc(bp.department || 'General')}</div>
      </div>
      <div class="job-action-area" style="display:flex; gap:12px;">
        <button class="btn-nav-outline" style="border-radius:0; width:140px; justify-content:center;" onclick="quickPredict('${bp.id}', this)">Predict Score</button>
        <button class="btn-primary" style="width:140px; border-radius:0;" onclick="applyToRole('${bp.id}', this)">Apply Now</button>
      </div>
    </div>`).join('');
    }

    /* Prediction Logic */
    async function quickPredict(bpId, btnElement) {
      const prof = state.applicantProfile;
      if (!prof.education || !prof.experience || !prof.skills) return toast('Complete your Master Profile to run predictions.', 'warn');

      const bp = state.blueprints.find(b => b.id === bpId);
      const originalText = btnElement.textContent;
      btnElement.innerHTML = '<span class="spinner" style="width:12px; height:12px; border:1px solid var(--ink); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; display:inline-block;"></span>';
      btnElement.disabled = true;

      const candidateData = `Education: ${prof.education}. Experience: ${prof.experience}. Skills: ${prof.skills}. Achievements: ${prof.achievements}. Detailed Resume: ${prof.resume}`;
      const prompt = `Act as an AI resume pre-screener. Compare Candidate Profile against Company Blueprint. Blueprint: Role ${esc(bp.role)}, Required Skills: ${bp.skills}. Candidate Data: ${candidateData}. Return strictly JSON: {"predictedScore": <number 0-100>, "feedback": "<one short sentence why>"}`;

      try {
        const raw = await callGemini(prompt);
        const parsed = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());

        document.getElementById('quick-predict-result').style.display = 'block';
        document.getElementById('qp-score').textContent = parsed.predictedScore;
        document.getElementById('qp-role').textContent = "Prediction: " + bp.role;
        document.getElementById('qp-feedback').textContent = parsed.feedback;

        document.getElementById('quick-predict-result').scrollIntoView({ behavior: 'smooth', block: 'end' });
      } catch (e) { toast("Engine error: " + e.message, 'error'); }
      finally { btnElement.textContent = originalText; btnElement.disabled = false; }
    }

    /* Apply Flow */
    async function applyToRole(bpId, btnElement) {
      const prof = state.applicantProfile;
      if (!prof.education || !prof.experience || !prof.skills) return toast('Complete your Master Profile first.', 'warn');

      const bp = state.blueprints.find(b => b.id === bpId);

      // Check if already applied
      const alreadyApplied = state.screenings.find(s => s.applicantUid === state.user.uid && s.role === bp.role && s.companyUid === bp.ownerUid);
      if (alreadyApplied) return toast('You have already applied to this role.', 'warn');

      toast(`Submitting profile to ${esc(bp.company)}...`);
      const originalText = btnElement.textContent;
      btnElement.innerHTML = '<span class="spinner" style="width:12px; height:12px; border:2px solid var(--bg); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; display:inline-block;"></span>';
      btnElement.disabled = true;

      const candidateData = `Education: ${prof.education}. Experience: ${prof.experience}. Skills: ${prof.skills}. Achievements: ${prof.achievements}. Detailed Resume: ${prof.resume}`;

      // NEW PROMPT: ASKS FOR DETAILED REASONING FOR THE COMPANY TO SEE
      const prompt = `Act as an expert HR evaluator. Evaluate Candidate vs Blueprint. Role: ${esc(bp.role)}, Required Skills: ${bp.skills}, Pass Threshold: ${bp.passingScore}. Candidate Data: ${candidateData}. Return STRICTLY JSON: {"score": <number 0-100>, "status": "<PASS or FAIL>", "aiReason": "<2 to 3 sentences explaining the candidate's exact strengths and weaknesses and why they got this score>"}`;

      try {
        const raw = await callGemini(prompt);
        const parsed = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());

        const app = {
          id: 'ap_' + Date.now(),
          applicantUid: state.user.uid,
          applicantName: prof.firstName + (prof.lastName ? ' ' + prof.lastName : ''),
          companyUid: bp.ownerUid,
          role: bp.role,
          company: bp.company,
          score: Number(parsed.score) || 0,
          status: parsed.status === 'PASS' ? 'PASS' : 'FAIL',
          aiReason: parsed.aiReason || "Profile evaluated by AI.",
          finalDecision: 'PENDING',
          published: false,
          date: new Date().toISOString()
        };

        state.screenings.unshift(app);
        await dbSet('screenings', app.id, app).catch(dbFail);

        toast('Application sent securely to HR.');
        updateApplicantStats();
        switchApTab('profile');

      } catch (e) {
        toast("Server warming up. Try again in 10s.", 'error');
      } finally {
        btnElement.textContent = originalText;
        btnElement.disabled = false;
      }
    }

    /* Global Navigation */
    document.getElementById('btn-company-logout').onclick = () => { unsubs.forEach(u => u()); (auth ? auth.signOut() : Promise.resolve()).finally(() => location.reload()); };
    document.getElementById('btn-applicant-logout').onclick = () => { unsubs.forEach(u => u()); (auth ? auth.signOut() : Promise.resolve()).finally(() => location.reload()); };

  