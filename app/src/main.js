import './style.css';
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, getDoc,
  setDoc, addDoc, deleteDoc, updateDoc, query, orderBy, limit, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { App as CapApp } from '@capacitor/app';
import { firebaseConfig, isConfigured, WHATSAPP_GROUP } from './firebase-config.js';
import { DISTRICTS, SKILLS, ROLES, JOB_KINDS, POST_TYPES } from './data.js';
import { t, getLang, setLang } from './i18n.js';

/* ---------- helpers ---------- */
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initial = (n) => esc((n || '?').trim().charAt(0).toUpperCase());
const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|net|org|co|io|me|app|link)\b)/i;
let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2600);
}
function ago(ts) {
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return 'just now';
  const s = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return d.toLocaleDateString();
}
const digits = (p) => String(p || '').replace(/\D/g, '');
const waLink = (p) => {
  let n = digits(p);
  if (n.length === 10) n = '91' + n;
  return `https://wa.me/${n}`;
};
const telLink = (p) => `tel:${digits(p)}`;
const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(t(v))}</option>`).join('');
const distOpts = (sel, any) => (any ? `<option value="">${esc(t('All districts'))}</option>` : '<option value="">Select district</option>') +
  DISTRICTS.map((d) => `<option ${d === sel ? 'selected' : ''}>${d}</option>`).join('');
const icons = {
  feed: '<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></svg>',
  jobs: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14.5c2.4 0 4 1.6 4 4"/></svg>',
  me: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
};
const camLogo = '<svg viewBox="0 0 24 24"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h10A2.5 2.5 0 0 1 18 6.5V8l3-1.6v9.2L18 14v1.5a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 3 15.5z"/></svg>';

/* ---------- state ---------- */
const S = {
  user: null, profile: null, isAdmin: false, tab: 'feed',
  postFilter: 'all', jobFilter: 'all', jobDistrict: '', pDistrict: '', pSearch: '', pRole: '',
  posts: null, jobs: null, people: null, thread: null,
};
let auth, db;

/* ---------- boot ---------- */
if (!isConfigured) {
  $app.innerHTML = `<div class="setup"><div class="logo">${camLogo}</div><h1>Setup needed</h1>
    <p>This build has no Firebase project connected yet. Open <code>app/src/firebase-config.js</code>, paste the web app
    config of your community Firebase project, then rebuild the APK.</p></div>`;
} else {
  const fb = initializeApp(firebaseConfig);
  auth = getAuth(fb);
  db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  $app.innerHTML = '<div class="spin"></div>';
  onAuthStateChanged(auth, async (u) => {
    S.user = u;
    if (!u) { S.profile = null; S.isAdmin = false; return renderAuth('login'); }
    try {
      const [p, a] = await Promise.all([getDoc(doc(db, 'users', u.uid)), getDoc(doc(db, 'admins', u.uid))]);
      S.profile = p.exists() ? p.data() : null;
      S.isAdmin = a.exists();
    } catch (e) { toast('Could not load profile. Check your connection.'); }
    if (!S.profile) return renderProfileForm(true);
    renderShell();
  });
}

CapApp.addListener('backButton', () => {
  const sheet = document.querySelector('.sheet-bg');
  if (sheet) return sheet.remove();
  if (S.thread) { S.thread = null; return renderShell(); }
  if (S.user && S.profile && S.tab !== 'feed') { S.tab = 'feed'; return renderShell(); }
  CapApp.exitApp();
});

/* ---------- auth screens ---------- */
function renderAuth(mode) {
  const signup = mode === 'signup';
  $app.innerHTML = `<div class="auth">
    <div class="logo">${camLogo}</div>
    <h1>CCTV Technicians TN</h1>
    <p class="sub">Technician community for Tamil Nadu. Technical help, manpower and contract work. No promotions.</p>
    <div class="field"><label>Email</label><input id="em" type="email" autocomplete="email" inputmode="email"></div>
    <div class="field"><label>Password</label><input id="pw" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}">
      ${signup ? '<div class="hint">At least 6 characters</div>' : ''}</div>
    <div class="err" id="err"></div>
    <button class="btn block" id="go">${t(signup ? 'Sign up' : 'Log in')}</button>
    <div class="row" style="justify-content:space-between">
      <button class="link" id="sw">${signup ? 'I already have an account' : 'Create new account'}</button>
      ${signup ? '' : '<button class="link" id="fp">Forgot password?</button>'}
    </div></div>`;
  const err = (m) => { document.getElementById('err').textContent = m; };
  document.getElementById('sw').onclick = () => renderAuth(signup ? 'login' : 'signup');
  const fp = document.getElementById('fp');
  if (fp) fp.onclick = async () => {
    const em = document.getElementById('em').value.trim();
    if (!em) return err('Enter your email first.');
    try { await sendPasswordResetEmail(auth, em); err(''); toast('Password reset link sent to your email'); } catch (e) { err(authMsg(e)); }
  };
  document.getElementById('go').onclick = async (ev) => {
    const em = document.getElementById('em').value.trim();
    const pw = document.getElementById('pw').value;
    if (!em || !pw) return err('Enter email and password.');
    ev.target.disabled = true; err('');
    try {
      if (signup) await createUserWithEmailAndPassword(auth, em, pw);
      else await signInWithEmailAndPassword(auth, em, pw);
    } catch (e) { err(authMsg(e)); ev.target.disabled = false; }
  };
}
function authMsg(e) {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Wrong email or password.';
  if (c.includes('email-already')) return 'This email is already registered. Log in instead.';
  if (c.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (c.includes('invalid-email')) return 'Enter a valid email address.';
  if (c.includes('network')) return 'No internet connection.';
  if (c.includes('too-many')) return 'Too many attempts. Try again later.';
  return 'Something went wrong. Try again.';
}

/* ---------- profile form (onboarding + edit) ---------- */
function skillPicker(selected) {
  return `<div class="skills" id="skpick" style="gap:8px">${SKILLS.map((s) =>
    `<button type="button" class="chip ${selected.includes(s) ? 'on' : ''}" data-skill="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
}
function bindSkillPicker(root) {
  root.querySelectorAll('[data-skill]').forEach((b) => { b.onclick = () => b.classList.toggle('on'); });
}
const pickedSkills = (root) => [...root.querySelectorAll('[data-skill].on')].map((b) => b.dataset.skill);

function renderProfileForm(isNew) {
  const p = S.profile || {};
  const html = `<div class="${isNew ? 'auth' : ''}">
    <h2 style="margin-top:0">${isNew ? 'Complete your profile' : t('Edit profile')}</h2>
    ${isNew ? '<p class="sub" style="color:var(--muted)">Other technicians will see this. Your phone number is visible to community members only.</p>' : ''}
    <div class="field"><label>Full name</label><input id="pn" value="${esc(p.name || '')}" maxlength="60"></div>
    <div class="field"><label>Mobile / WhatsApp number</label><input id="pp" inputmode="tel" value="${esc(p.phone || '')}" maxlength="15"></div>
    <div class="field"><label>District</label><select id="pd">${distOpts(p.district)}</select></div>
    <div class="field"><label>I am a</label><select id="pr">${opts(ROLES, p.role || 'technician')}</select></div>
    <div class="field"><label>Experience (years)</label><input id="pe" type="number" min="0" max="60" value="${esc(p.experience ?? '')}"></div>
    <div class="field"><label>Skills</label>${skillPicker(p.skills || [])}</div>
    <div class="field"><label>About (optional)</label><textarea id="pb" maxlength="400" style="min-height:80px">${esc(p.bio || '')}</textarea></div>
    ${isNew ? `<div class="field"><label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--text)">
      <input type="checkbox" id="ag" style="width:auto;margin-top:3px"> I agree to the community rules: technical topics only, no product promotion, no customers.</label></div>` : ''}
    <div class="err" id="perr"></div>
    <button class="btn block" id="psave">${t('Save')}</button>
    ${isNew ? '<button class="link" id="plogout" style="margin-top:6px">Log out</button>' : ''}
  </div>`;
  let root;
  if (isNew) { $app.innerHTML = html; root = $app; } else { root = openSheet(html); }
  bindSkillPicker(root);
  if (isNew) root.querySelector('#plogout').onclick = () => signOut(auth);
  root.querySelector('#psave').onclick = async (ev) => {
    const g = (id) => root.querySelector(id).value.trim();
    const data = {
      name: g('#pn'), phone: g('#pp'), district: g('#pd'), role: g('#pr'),
      experience: Math.max(0, Math.min(60, parseInt(g('#pe'), 10) || 0)),
      skills: pickedSkills(root), bio: g('#pb'),
    };
    const err = (m) => { root.querySelector('#perr').textContent = m; };
    if (data.name.length < 2) return err('Enter your name.');
    if (digits(data.phone).length < 10) return err('Enter a valid 10-digit mobile number.');
    if (!data.district) return err('Select your district.');
    if (isNew && !root.querySelector('#ag').checked) return err('Please accept the community rules.');
    if (URL_RE.test(data.bio)) return err('Links are not allowed in your profile.');
    ev.target.disabled = true;
    try {
      const ref = doc(db, 'users', S.user.uid);
      if (isNew) await setDoc(ref, { ...data, createdAt: serverTimestamp() });
      else await updateDoc(ref, data);
      S.profile = { ...(S.profile || {}), ...data };
      S.people = null;
      document.querySelector('.sheet-bg')?.remove();
      toast('Profile saved');
      renderShell();
    } catch (e) { err('Could not save. Check your connection.'); ev.target.disabled = false; }
  };
}

/* ---------- shell + tabs ---------- */
function openSheet(inner) {
  document.querySelector('.sheet-bg')?.remove();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet">${inner}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  return bg;
}
const TITLES = { feed: ['Feed', 'Technical tips & doubts'], jobs: ['Jobs', 'Manpower & contract work'], people: ['Technicians', 'Find & connect across Tamil Nadu'], me: ['Me', ''] };

function renderShell() {
  if (S.thread) return renderThread();
  const [title, sub] = TITLES[S.tab];
  $app.innerHTML = `<div class="hdr"><h1>${esc(t(title))}${sub ? `<small>${esc(sub)}</small>` : ''}</h1></div>
    <div class="main" id="main"></div>
    ${['feed', 'jobs'].includes(S.tab) ? '<button class="fab" id="fab" aria-label="New">+</button>' : ''}
    <nav class="nav">${Object.keys(TITLES).map((k) =>
    `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${icons[k]}<span>${esc(t(TITLES[k][0]))}</span></button>`).join('')}</nav>`;
  $app.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { S.tab = b.dataset.tab; renderShell(); }; });
  const fab = document.getElementById('fab');
  if (fab) fab.onclick = () => (S.tab === 'feed' ? composePost() : composeJob());
  ({ feed: renderFeed, jobs: renderJobs, people: renderPeople, me: renderMe })[S.tab]();
}

const main = () => document.getElementById('main');
const spinner = () => { main().innerHTML = '<div class="spin"></div>'; };
const empty = (m) => `<div class="empty">${esc(m || t('Nothing here yet'))}</div>`;
async function fetchList(name, max) {
  const snap = await getDocs(query(collection(db, name), orderBy('createdAt', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ---------- feed ---------- */
async function renderFeed() {
  const chips = ['all', ...Object.keys(POST_TYPES)];
  const draw = () => {
    const list = (S.posts || []).filter((p) => S.postFilter === 'all' || p.type === S.postFilter);
    main().innerHTML = `<div class="chips">${chips.map((c) =>
      `<button class="chip ${S.postFilter === c ? 'on' : ''}" data-f="${c}">${esc(t(c === 'all' ? 'All' : POST_TYPES[c]))}</button>`).join('')}</div>` +
      (list.length ? list.map((p) => `<div class="card" data-post="${p.id}" style="cursor:pointer">
        <span class="badge b-${esc(p.type)}">${esc(t(POST_TYPES[p.type] || p.type))}</span>
        <h3>${esc(p.title)}</h3><p>${esc((p.body || '').slice(0, 160))}${(p.body || '').length > 160 ? '…' : ''}</p>
        <div class="meta"><span>${esc(p.authorName)}</span>${p.district ? `<span>• ${esc(p.district)}</span>` : ''}<span>• ${ago(p.createdAt)}</span></div></div>`).join('') : empty());
    main().querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { S.postFilter = b.dataset.f; draw(); }; });
    main().querySelectorAll('[data-post]').forEach((c) => { c.onclick = () => { S.thread = S.posts.find((p) => p.id === c.dataset.post); renderShell(); }; });
  };
  if (S.posts) draw(); else spinner();
  try { S.posts = await fetchList('posts', 100); if (S.tab === 'feed' && !S.thread) draw(); } catch (e) { if (!S.posts) main().innerHTML = empty('Could not load. Check your connection.'); }
}

function composePost() {
  const root = openSheet(`<h2>New post</h2>
    <div class="field"><label>Type</label><select id="ct">${opts(POST_TYPES, 'doubt')}</select></div>
    <div class="field"><label>Title</label><input id="cti" maxlength="120" placeholder="e.g. NVR not detecting hard disk"></div>
    <div class="field"><label>Details</label><textarea id="cb" maxlength="2000" placeholder="Write the problem or the tip. Mention camera/NVR model if relevant."></textarea>
      <div class="hint">Technical topics only. Links and promotions are not allowed.</div></div>
    <div class="field"><label>District (optional)</label><select id="cd">${distOpts(S.profile.district, true).replace(esc(t('All districts')), 'Any')}</select></div>
    <div class="err" id="cerr"></div>
    <div class="row"><button class="btn" id="cs">${t('Post')}</button><button class="btn sec" id="cc">${t('Cancel')}</button></div>`);
  root.querySelector('#cc').onclick = () => root.remove();
  root.querySelector('#cs').onclick = async (ev) => {
    const g = (id) => root.querySelector(id).value.trim();
    const data = { type: g('#ct'), title: g('#cti'), body: g('#cb'), district: g('#cd') };
    const err = (m) => { root.querySelector('#cerr').textContent = m; };
    if (data.title.length < 5) return err('Write a clear title (min 5 characters).');
    if (data.body.length < 10) return err('Add some details (min 10 characters).');
    if (URL_RE.test(data.title + ' ' + data.body)) return err('Links are not allowed. This community is for technical discussion only.');
    ev.target.disabled = true;
    try {
      await addDoc(collection(db, 'posts'), { ...data, authorId: S.user.uid, authorName: S.profile.name, createdAt: serverTimestamp() });
      root.remove(); toast('Posted'); S.posts = null; renderShell();
    } catch (e) { err('Could not post. Check your connection.'); ev.target.disabled = false; }
  };
}

/* ---------- thread ---------- */
async function renderThread() {
  const p = S.thread;
  const mine = p.authorId === S.user.uid;
  $app.innerHTML = `<div class="hdr"><button class="link" id="back">← Back</button></div>
    <div class="main" id="main"><div class="card">
      <span class="badge b-${esc(p.type)}">${esc(t(POST_TYPES[p.type] || p.type))}</span>
      <h3>${esc(p.title)}</h3><p>${esc(p.body)}</p>
      <div class="meta"><span>${esc(p.authorName)}</span>${p.district ? `<span>• ${esc(p.district)}</span>` : ''}<span>• ${ago(p.createdAt)}</span></div>
      <div class="row">
        ${mine || S.isAdmin ? `<button class="btn danger sm" id="dp">${t('Delete')}</button>` : ''}
        ${mine ? '' : `<button class="btn sec sm" id="rp">${t('Report')}</button>`}
      </div></div>
      <h3 style="margin:16px 2px 6px;font-size:14px;color:var(--muted)">${esc(t('Answers & replies'))}</h3>
      <div class="card" id="cm"><div class="spin" style="margin:14px auto"></div></div>
      <div class="field"><textarea id="cin" maxlength="1000" style="min-height:70px" placeholder="${esc(t('Write a reply'))}"></textarea></div>
      <div class="err" id="cerr"></div>
      <button class="btn block" id="send">${t('Reply')}</button></div>`;
  const back = () => { S.thread = null; renderShell(); };
  document.getElementById('back').onclick = back;
  document.getElementById('dp')?.addEventListener('click', async () => {
    if (!confirm('Delete this post?')) return;
    try { await deleteDoc(doc(db, 'posts', p.id)); S.posts = null; toast('Deleted'); back(); } catch (e) { toast('Could not delete'); }
  });
  document.getElementById('rp')?.addEventListener('click', () => reportItem(`posts/${p.id}`, 'post', p.title));
  const cmEl = document.getElementById('cm');
  const drawComments = (list) => {
    cmEl.innerHTML = list.length ? list.map((c) => `<div class="comment"><div class="meta"><b style="color:var(--text)">${esc(c.authorName)}</b><span>• ${ago(c.createdAt)}</span></div>
      <p>${esc(c.body)}</p>
      <div class="row" style="margin-top:4px">${c.authorId === S.user.uid || S.isAdmin ? `<button class="link" data-del="${c.id}">${t('Delete')}</button>` : `<button class="link" data-rep="${c.id}" style="color:var(--muted)">${t('Report')}</button>`}</div></div>`).join('')
      : `<div class="empty" style="padding:14px">No replies yet. Be the first to help.</div>`;
    cmEl.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => {
      try { await deleteDoc(doc(db, 'posts', p.id, 'comments', b.dataset.del)); load(); } catch (e) { toast('Could not delete'); }
    }; });
    cmEl.querySelectorAll('[data-rep]').forEach((b) => { b.onclick = () => {
      const c = list.find((x) => x.id === b.dataset.rep);
      reportItem(`posts/${p.id}/comments/${c.id}`, 'reply', c.body.slice(0, 80));
    }; });
  };
  let list = [];
  async function load() {
    try {
      const snap = await getDocs(query(collection(db, 'posts', p.id, 'comments'), orderBy('createdAt', 'asc'), limit(200)));
      list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      drawComments(list);
    } catch (e) { cmEl.innerHTML = '<div class="empty" style="padding:14px">Could not load replies.</div>'; }
  }
  load();
  document.getElementById('send').onclick = async (ev) => {
    const body = document.getElementById('cin').value.trim();
    const err = (m) => { document.getElementById('cerr').textContent = m; };
    if (body.length < 2) return err('Write a reply.');
    if (URL_RE.test(body)) return err('Links are not allowed.');
    ev.target.disabled = true; err('');
    try {
      await addDoc(collection(db, 'posts', p.id, 'comments'), { body, authorId: S.user.uid, authorName: S.profile.name, createdAt: serverTimestamp() });
      document.getElementById('cin').value = '';
      await load();
    } catch (e) { err('Could not send. Check your connection.'); }
    ev.target.disabled = false;
  };
}

function reportItem(path, kind, preview) {
  const root = openSheet(`<h2>Report ${esc(kind)}</h2>
    <div class="field"><label>Reason</label><select id="rr">
      <option>Promotion / advertising</option><option>Spam or fake</option><option>Abusive language</option><option>Not related to CCTV / security</option><option>Other</option></select></div>
    <div class="row"><button class="btn" id="rs">Send report</button><button class="btn sec" id="rc">${t('Cancel')}</button></div>`);
  root.querySelector('#rc').onclick = () => root.remove();
  root.querySelector('#rs').onclick = async () => {
    try {
      await addDoc(collection(db, 'reports'), { path, kind, preview: String(preview || '').slice(0, 120), reason: root.querySelector('#rr').value, reporterId: S.user.uid, createdAt: serverTimestamp() });
      root.remove(); toast('Thanks. Admin will review.');
    } catch (e) { toast('Could not send report'); }
  };
}

/* ---------- jobs ---------- */
async function renderJobs() {
  const chips = ['all', ...Object.keys(JOB_KINDS)];
  const draw = () => {
    const list = (S.jobs || []).filter((j) => (S.jobFilter === 'all' || j.kind === S.jobFilter) && (!S.jobDistrict || j.district === S.jobDistrict));
    main().innerHTML = `<div class="chips">${chips.map((c) =>
      `<button class="chip ${S.jobFilter === c ? 'on' : ''}" data-f="${c}">${esc(t(c === 'all' ? 'All' : JOB_KINDS[c]))}</button>`).join('')}</div>
      <select class="search" id="jd">${distOpts(S.jobDistrict, true)}</select>` +
      (list.length ? list.map(jobCard).join('') : empty());
    main().querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { S.jobFilter = b.dataset.f; draw(); }; });
    main().querySelector('#jd').onchange = (e) => { S.jobDistrict = e.target.value; draw(); };
    main().querySelectorAll('[data-close]').forEach((b) => { b.onclick = async () => {
      const j = S.jobs.find((x) => x.id === b.dataset.close);
      try { await updateDoc(doc(db, 'jobs', j.id), { status: j.status === 'open' ? 'closed' : 'open' }); j.status = j.status === 'open' ? 'closed' : 'open'; draw(); } catch (e) { toast('Could not update'); }
    }; });
    main().querySelectorAll('[data-djob]').forEach((b) => { b.onclick = async () => {
      if (!confirm('Delete this listing?')) return;
      try { await deleteDoc(doc(db, 'jobs', b.dataset.djob)); S.jobs = S.jobs.filter((x) => x.id !== b.dataset.djob); draw(); } catch (e) { toast('Could not delete'); }
    }; });
    main().querySelectorAll('[data-rjob]').forEach((b) => { b.onclick = () => {
      const j = S.jobs.find((x) => x.id === b.dataset.rjob);
      reportItem(`jobs/${j.id}`, 'listing', j.title);
    }; });
  };
  if (S.jobs) draw(); else spinner();
  try { S.jobs = await fetchList('jobs', 150); if (S.tab === 'jobs') draw(); } catch (e) { if (!S.jobs) main().innerHTML = empty('Could not load. Check your connection.'); }
}
function jobCard(j) {
  const mine = j.authorId === S.user.uid;
  const closed = j.status === 'closed';
  return `<div class="card" style="${closed ? 'opacity:.6' : ''}">
    <span class="badge b-${esc(j.kind)}">${esc(t(JOB_KINDS[j.kind] || j.kind))}</span>${closed ? ' <span class="badge b-closed">Closed</span>' : ''}
    <h3>${esc(j.title)}</h3>
    <div class="meta"><span>📍 ${esc(j.district || 'Tamil Nadu')}</span>${j.pay ? `<span>• ₹ ${esc(j.pay)}</span>` : ''}<span>• ${ago(j.createdAt)}</span></div>
    ${j.details ? `<p>${esc(j.details)}</p>` : ''}
    ${(j.skills || []).length ? `<div class="skills">${j.skills.map((s) => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
    <div class="meta" style="margin-top:8px">Posted by ${esc(j.authorName)}</div>
    <div class="row">
      ${!closed && j.phone ? `<a class="btn sm" href="${telLink(j.phone)}">${t('Call')}</a><a class="btn wa sm" href="${waLink(j.phone)}" target="_blank" rel="noopener">${t('WhatsApp')}</a>` : ''}
      ${mine ? `<button class="btn sec sm" data-close="${j.id}">${closed ? t('Reopen') : t('Close job')}</button>` : ''}
      ${mine || S.isAdmin ? `<button class="btn danger sm" data-djob="${j.id}">${t('Delete')}</button>` : `<button class="btn sec sm" data-rjob="${j.id}">${t('Report')}</button>`}
    </div></div>`;
}
function composeJob() {
  const root = openSheet(`<h2>New listing</h2>
    <div class="field"><label>What do you need?</label><select id="jk">${opts(JOB_KINDS, 'hiring')}</select></div>
    <div class="field"><label>Title</label><input id="jt" maxlength="100" placeholder="e.g. 2 CCTV installation technicians needed"></div>
    <div class="field"><label>District</label><select id="jd2">${distOpts(S.profile.district)}</select></div>
    <div class="field"><label>Pay / rate (optional)</label><input id="jp" maxlength="40" placeholder="e.g. 18,000 per month or 500 per camera"></div>
    <div class="field"><label>Details</label><textarea id="jdt" maxlength="800" placeholder="Work type, duration, experience needed, joining date"></textarea></div>
    <div class="field"><label>Skills</label>${skillPicker([])}</div>
    <div class="field"><label>Contact number</label><input id="jph" inputmode="tel" value="${esc(S.profile.phone || '')}" maxlength="15"></div>
    <div class="err" id="jerr"></div>
    <div class="row"><button class="btn" id="js">${t('Post')}</button><button class="btn sec" id="jc">${t('Cancel')}</button></div>`);
  bindSkillPicker(root);
  root.querySelector('#jc').onclick = () => root.remove();
  root.querySelector('#js').onclick = async (ev) => {
    const g = (id) => root.querySelector(id).value.trim();
    const data = { kind: g('#jk'), title: g('#jt'), district: g('#jd2'), pay: g('#jp'), details: g('#jdt'), phone: g('#jph'), skills: pickedSkills(root), status: 'open' };
    const err = (m) => { root.querySelector('#jerr').textContent = m; };
    if (data.title.length < 5) return err('Write a clear title.');
    if (!data.district) return err('Select a district.');
    if (digits(data.phone).length < 10) return err('Enter a valid contact number.');
    if (URL_RE.test(`${data.title} ${data.details} ${data.pay}`)) return err('Links are not allowed.');
    ev.target.disabled = true;
    try {
      await addDoc(collection(db, 'jobs'), { ...data, authorId: S.user.uid, authorName: S.profile.name, createdAt: serverTimestamp() });
      root.remove(); toast('Listing posted'); S.jobs = null; renderShell();
    } catch (e) { err('Could not post. Check your connection.'); ev.target.disabled = false; }
  };
}

/* ---------- technician directory ---------- */
async function renderPeople() {
  const draw = () => {
    const q = S.pSearch.toLowerCase();
    const list = (S.people || []).filter((u) => (!S.pDistrict || u.district === S.pDistrict) && (!S.pRole || u.role === S.pRole) &&
      (!q || `${u.name} ${(u.skills || []).join(' ')}`.toLowerCase().includes(q)));
    const keep = document.getElementById('ps');
    main().innerHTML = `<input class="search" id="ps" placeholder="${esc(t('Search name or skill'))}" value="${esc(S.pSearch)}">
      <div class="row" style="margin:0 0 10px"><select class="search" id="pdi" style="flex:1;margin:0">${distOpts(S.pDistrict, true)}</select>
      <select class="search" id="pro" style="flex:1;margin:0"><option value="">All roles</option>${opts(ROLES, S.pRole)}</select></div>
      <div id="plist">${list.length ? list.map(personCard).join('') : empty()}</div>`;
    const ps = document.getElementById('ps');
    ps.oninput = (e) => { S.pSearch = e.target.value; const pos = e.target.selectionStart; draw(); const n = document.getElementById('ps'); n.focus(); n.setSelectionRange(pos, pos); };
    document.getElementById('pdi').onchange = (e) => { S.pDistrict = e.target.value; draw(); };
    document.getElementById('pro').onchange = (e) => { S.pRole = e.target.value; draw(); };
    return keep;
  };
  if (S.people) draw(); else spinner();
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(600)));
    S.people = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (S.tab === 'people') draw();
  } catch (e) { if (!S.people) main().innerHTML = empty('Could not load. Check your connection.'); }
}
function personCard(u) {
  const me = u.id === S.user.uid;
  return `<div class="card"><div class="person"><div class="avatar">${initial(u.name)}</div><div class="info">
    <b>${esc(u.name)}</b>${me ? ' <span class="badge">You</span>' : ''}
    <div class="meta"><span>${esc(t(ROLES[u.role] || ''))}</span><span>• 📍 ${esc(u.district || '')}</span>${u.experience ? `<span>• ${esc(u.experience)} yrs</span>` : ''}</div>
    ${(u.skills || []).length ? `<div class="skills">${u.skills.map((s) => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
    ${u.bio ? `<p>${esc(u.bio)}</p>` : ''}
    ${!me && u.phone ? `<div class="row"><a class="btn sm" href="${telLink(u.phone)}">${t('Call')}</a><a class="btn wa sm" href="${waLink(u.phone)}" target="_blank" rel="noopener">${t('WhatsApp')}</a></div>` : ''}
    </div></div></div>`;
}

/* ---------- me ---------- */
function renderMe() {
  const p = S.profile;
  main().innerHTML = `<div class="card"><div class="person"><div class="avatar">${initial(p.name)}</div><div class="info">
      <b style="font-size:17px">${esc(p.name)}</b>
      <div class="meta"><span>${esc(t(ROLES[p.role] || ''))}</span><span>• 📍 ${esc(p.district)}</span></div>
      <div class="meta" style="margin-top:4px">${esc(p.phone)} • ${esc(S.user.email)}</div></div></div>
      <div class="row"><button class="btn sm" id="ep">${t('Edit profile')}</button>
      <button class="btn sec sm" id="lg">${getLang() === 'en' ? 'தமிழ்' : 'English'}</button></div></div>
    <a class="btn wa block" href="${WHATSAPP_GROUP}" target="_blank" rel="noopener" style="margin-bottom:10px">Join the WhatsApp group</a>
    <div class="card"><h3 style="margin-top:0">${t('Community rules')}</h3><ul class="rules">
      <li>Only CCTV, security and related technical topics.</li>
      <li>No product, service or company promotion. No links.</li>
      <li>Respect every member. No abusive language.</li>
      <li>Post genuine manpower and contract requirements only.</li>
      <li>Admin decision is final. Reported content is reviewed.</li>
    </ul></div>
    ${S.isAdmin ? '<div class="card"><h3 style="margin-top:0">Admin: reports</h3><div id="rep"><div class="spin" style="margin:14px auto"></div></div></div>' : ''}
    <button class="btn danger block" id="lo">${t('Log out')}</button>`;
  document.getElementById('ep').onclick = () => renderProfileForm(false);
  document.getElementById('lg').onclick = () => { setLang(getLang() === 'en' ? 'ta' : 'en'); renderShell(); };
  document.getElementById('lo').onclick = () => { S.posts = S.jobs = S.people = null; S.tab = 'feed'; signOut(auth); };
  if (S.isAdmin) loadReports();
}
async function loadReports() {
  const el = document.getElementById('rep');
  try {
    const list = await fetchList('reports', 50);
    el.innerHTML = list.length ? list.map((r) => `<div class="comment"><div class="meta"><span class="badge">${esc(r.kind)}</span><span>${esc(r.reason)}</span><span>• ${ago(r.createdAt)}</span></div>
      <p>${esc(r.preview)}</p><div class="row" style="margin-top:4px">
      <button class="btn danger sm" data-rdel="${r.id}">Delete content</button><button class="btn sec sm" data-rok="${r.id}">Dismiss</button></div></div>`).join('') : '<div class="empty" style="padding:14px">No reports.</div>';
    el.querySelectorAll('[data-rdel]').forEach((b) => { b.onclick = async () => {
      const r = list.find((x) => x.id === b.dataset.rdel);
      try { await deleteDoc(doc(db, r.path)); await deleteDoc(doc(db, 'reports', r.id)); S.posts = S.jobs = null; loadReports(); } catch (e) { toast('Could not delete'); }
    }; });
    el.querySelectorAll('[data-rok]').forEach((b) => { b.onclick = async () => {
      try { await deleteDoc(doc(db, 'reports', b.dataset.rok)); loadReports(); } catch (e) { toast('Could not dismiss'); }
    }; });
  } catch (e) { el.innerHTML = '<div class="empty" style="padding:14px">Could not load reports.</div>'; }
}
