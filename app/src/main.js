import './style.css';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithCredential } from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, getDoc, addDoc, deleteDoc,
  updateDoc, query, orderBy, limit, getDocs, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { firebaseConfig, isConfigured, WHATSAPP_GROUP } from './firebase-config.js';
import { DISTRICTS, SKILLS, CAT_LABEL, JOB_KINDS, POST_TYPES } from './data.js';
import { t, getLang, setLang } from './i18n.js';
import {
  S, ref, hooks, $app, esc, initial, digits, waLink, telLink, ago, opts, openSheet, toast, icons, camLogo, copyText,
  cleanText, postText, authorName, empty, spinnerHtml,
} from './shared.js';
import { renderApplicationForm, renderPending, renderRejected, renderSuspended, logout } from './apply.js';
import { renderVerifyTab, renderReview, renderOrdersTab, renderReports } from './staff.js';

const main = () => document.getElementById('main');
const distOpts = (sel, any) => (any ? `<option value="">${esc(t('All districts'))}</option>` : '<option value="">Select district</option>') +
  DISTRICTS.map((d) => `<option ${d === sel ? 'selected' : ''}>${d}</option>`).join('');
const MOBILE = /^[6-9]\d{9}$/;

/* ---------- boot ---------- */
let unsubApp = null;
let unsubMember = null;

hooks.render = () => route();
hooks.route = () => route();

if (!isConfigured) {
  $app.innerHTML = `<div class="setup"><div class="logo">${camLogo}</div><h1>Setup needed</h1>
    <p>This build has no Firebase project connected yet. Open <code>app/src/firebase-config.js</code>, paste the web app
    config of your community Firebase project, then rebuild the APK.</p></div>`;
} else {
  const fb = initializeApp(firebaseConfig);
  ref.auth = getAuth(fb);
  ref.db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  $app.innerHTML = spinnerHtml;

  onAuthStateChanged(ref.auth, async (u) => {
    unsubApp?.(); unsubMember?.(); unsubApp = unsubMember = null;
    S.user = u; S.staff = S.app = S.member = null; S.ready = false;
    S.posts = S.jobs = S.people = S.offers = S.orders = null;
    if (!u) { S.ready = true; return route(); }
    $app.innerHTML = spinnerHtml;
    try {
      const sd = await getDoc(doc(ref.db, 'staff', u.uid));
      if (sd.exists()) { S.staff = sd.data(); S.tab = S.staff.role === 'admin' ? 'feed' : 'verify'; S.ready = true; return route(); }
    } catch (e) { /* not staff */ }
    // live view of this person's application so approval opens the community without a restart
    unsubApp = onSnapshot(doc(ref.db, 'applications', u.uid), async (snap) => {
      S.app = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      if (S.app?.status === 'verified' && !S.member && !unsubMember) watchMember(u.uid);
      S.ready = true;
      if (!(S.app?.status === 'verified' && !S.member)) route();
    }, () => { S.ready = true; toast('Could not load your application. Check your connection.'); route(); });
  });
}

function watchMember(uid) {
  unsubMember = onSnapshot(doc(ref.db, 'members', uid), (snap) => {
    const prev = S.member;
    S.member = snap.exists() ? snap.data() : null;
    if (!prev || prev.suspended !== S.member?.suspended || !S.member) route();
  }, () => { /* ignore */ });
}

CapApp.addListener('backButton', () => {
  const sheet = document.querySelector('.sheet-bg');
  if (sheet) return sheet.remove();
  if (S.review) { S.review = null; return route(); }
  if (S.thread) { S.thread = null; return route(); }
  if (S.user && tabs().length && S.tab !== tabs()[0]) { S.tab = tabs()[0]; return route(); }
  return CapApp.exitApp();
});

/* ---------- routing ---------- */
function route() {
  if (!ref.auth) return;
  if (!S.ready) { $app.innerHTML = spinnerHtml; return; }
  if (!S.user) return renderLogin();
  if (S.staff) return renderShell();
  if (S.member) return S.member.suspended ? renderSuspended() : renderShell();
  if (!S.app) return renderApplicationForm(false);
  switch (S.app.status) {
    case 'pending': return renderPending();
    case 'needs_info': return renderApplicationForm(true);
    case 'rejected': return renderRejected();
    default: $app.innerHTML = spinnerHtml; // verified, waiting for the member profile
  }
  return undefined;
}

/* ---------- login ---------- */
function renderLogin() {
  $app.innerHTML = `<div class="auth" style="padding-top:calc(70px + env(safe-area-inset-top));text-align:center">
    <div class="logo" style="margin:0 auto 14px">${camLogo}</div>
    <h1>CCTV Technicians TN</h1>
    <p class="sub">A verified community for CCTV dealers and technicians in Tamil Nadu. Technical help, manpower and orders. No promotion.</p>
    <button class="btn block" id="g" style="height:46px">Continue with Google</button>
    <div class="err" id="err" style="margin-top:12px"></div>
    <p class="sub" style="font-size:12px;margin-top:10px">New here? After signing in you will fill a short verification form. A SHEYON CORP telecaller will call to confirm.</p></div>`;
  document.getElementById('g').onclick = async (ev) => {
    ev.target.disabled = true; document.getElementById('err').textContent = '';
    try { await googleSignIn(); } catch (e) {
      const m = String(e?.message || e?.code || '');
      if (!/cancel|closed|popup/i.test(m)) document.getElementById('err').textContent = 'Google sign-in failed. Check your connection and try again.';
      ev.target.disabled = false;
    }
  };
}
async function googleSignIn() {
  if (Capacitor.isNativePlatform()) {
    const r = await FirebaseAuthentication.signInWithGoogle();
    const idToken = r.credential?.idToken;
    if (!idToken) throw new Error('No Google token');
    await signInWithCredential(ref.auth, GoogleAuthProvider.credential(idToken));
  } else {
    await signInWithPopup(ref.auth, new GoogleAuthProvider());
  }
}

/* ---------- shell ---------- */
const TITLES = {
  feed: ['Feed', 'Technical tips and doubts'], jobs: ['Jobs', 'Manpower and contract work'],
  orders: ['Orders', 'Offers from SHEYON CORP'], people: ['Members', 'Find and connect across Tamil Nadu'],
  verify: ['Verify', 'Review member applications'], me: ['Me', ''],
};
function tabs() {
  if (S.staff?.role === 'telecaller') return ['verify', 'me'];
  if (S.staff?.role === 'admin') return ['feed', 'jobs', 'orders', 'people', 'verify', 'me'];
  return ['feed', 'jobs', 'orders', 'people', 'me'];
}

function renderShell() {
  if (S.review) return renderReview();
  if (S.thread) return renderThread();
  const tb = tabs();
  if (!tb.includes(S.tab)) S.tab = tb[0];
  const [title, sub] = TITLES[S.tab];
  $app.innerHTML = `<div class="hdr"><h1>${esc(t(title))}${sub ? `<small>${esc(sub)}</small>` : ''}</h1></div>
    <div class="main" id="main"></div>
    ${['feed', 'jobs'].includes(S.tab) ? '<button class="fab" id="fab" aria-label="New">+</button>' : ''}
    <nav class="nav">${tb.map((k) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${icons[k === 'me' ? 'me' : k]}<span>${esc(t(TITLES[k][0]))}</span></button>`).join('')}</nav>`;
  $app.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { S.tab = b.dataset.tab; renderShell(); }; });
  const fab = document.getElementById('fab');
  if (fab) fab.onclick = () => (S.tab === 'feed' ? composePost() : composeJob());
  ({ feed: renderFeed, jobs: renderJobs, orders: renderOrdersTab, people: renderPeople, verify: renderVerifyTab, me: renderMe })[S.tab]();
}

const spinner = () => { main().innerHTML = spinnerHtml; };
async function fetchList(name, max) {
  const snap = await getDocs(query(collection(ref.db, name), orderBy('createdAt', 'desc'), limit(max)));
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
    <div class="field"><label>Details</label><textarea id="cb" maxlength="2000" placeholder="Write the problem or the tip. Mention camera or NVR model if relevant."></textarea>
      <div class="hint">Technical topics only. No links, phone numbers or promotion.</div></div>
    <div class="field"><label>District (optional)</label><select id="cd">${distOpts(S.member?.district, true).replace(esc(t('All districts')), 'Any')}</select></div>
    <div class="err" id="cerr"></div>
    <div class="row"><button class="btn" id="cs">${t('Post')}</button><button class="btn sec" id="cc">${t('Cancel')}</button></div>`);
  root.querySelector('#cc').onclick = () => root.remove();
  root.querySelector('#cs').onclick = async (ev) => {
    const g = (id) => root.querySelector(id).value.trim();
    const data = { type: g('#ct'), title: g('#cti'), body: g('#cb'), district: g('#cd') };
    const err = (m) => { root.querySelector('#cerr').textContent = m; };
    if (data.title.length < 5) return err('Write a clear title (min 5 characters).');
    if (data.body.length < 10) return err('Add some details (min 10 characters).');
    const bad = postText(`${data.title} ${data.body}`); if (bad) return err(bad);
    ev.target.disabled = true;
    try {
      await addDoc(collection(ref.db, 'posts'), { ...data, authorId: S.user.uid, authorName: authorName(), createdAt: serverTimestamp() });
      root.remove(); toast('Posted'); S.posts = null; renderShell();
    } catch (e) { err('Could not post. Check your connection.'); ev.target.disabled = false; }
  };
}

/* ---------- thread ---------- */
async function renderThread() {
  const p = S.thread;
  const mine = p.authorId === S.user.uid;
  const admin = S.staff?.role === 'admin';
  $app.innerHTML = `<div class="hdr"><button class="link" id="back">← Back</button></div>
    <div class="main" id="main"><div class="card">
      <span class="badge b-${esc(p.type)}">${esc(t(POST_TYPES[p.type] || p.type))}</span>
      <h3>${esc(p.title)}</h3><p>${esc(p.body)}</p>
      <div class="meta"><span>${esc(p.authorName)}</span>${p.district ? `<span>• ${esc(p.district)}</span>` : ''}<span>• ${ago(p.createdAt)}</span></div>
      <div class="row">
        ${mine || admin ? `<button class="btn danger sm" id="dp">${t('Delete')}</button>` : ''}
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
    try { await deleteDoc(doc(ref.db, 'posts', p.id)); S.posts = null; toast('Deleted'); back(); } catch (e) { toast('Could not delete'); }
  });
  document.getElementById('rp')?.addEventListener('click', () => reportItem(`posts/${p.id}`, 'post', p.title, p.authorId));
  const cmEl = document.getElementById('cm');
  let list = [];
  const drawComments = () => {
    cmEl.innerHTML = list.length ? list.map((c) => `<div class="comment"><div class="meta"><b style="color:var(--text)">${esc(c.authorName)}</b><span>• ${ago(c.createdAt)}</span></div>
      <p>${esc(c.body)}</p>
      <div class="row" style="margin-top:4px">${c.authorId === S.user.uid || admin ? `<button class="link" data-del="${c.id}">${t('Delete')}</button>` : `<button class="link" data-rep="${c.id}" style="color:var(--muted)">${t('Report')}</button>`}</div></div>`).join('')
      : '<div class="empty" style="padding:14px">No replies yet. Be the first to help.</div>';
    cmEl.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => {
      try { await deleteDoc(doc(ref.db, 'posts', p.id, 'comments', b.dataset.del)); load(); } catch (e) { toast('Could not delete'); }
    }; });
    cmEl.querySelectorAll('[data-rep]').forEach((b) => { b.onclick = () => {
      const c = list.find((x) => x.id === b.dataset.rep);
      reportItem(`posts/${p.id}/comments/${c.id}`, 'reply', c.body.slice(0, 80), c.authorId);
    }; });
  };
  async function load() {
    try {
      const snap = await getDocs(query(collection(ref.db, 'posts', p.id, 'comments'), orderBy('createdAt', 'asc'), limit(200)));
      list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      drawComments();
    } catch (e) { cmEl.innerHTML = '<div class="empty" style="padding:14px">Could not load replies.</div>'; }
  }
  load();
  document.getElementById('send').onclick = async (ev) => {
    const body = document.getElementById('cin').value.trim();
    const err = (m) => { document.getElementById('cerr').textContent = m; };
    if (body.length < 2) return err('Write a reply.');
    const bad = postText(body); if (bad) return err(bad);
    ev.target.disabled = true; err('');
    try {
      await addDoc(collection(ref.db, 'posts', p.id, 'comments'), { body, authorId: S.user.uid, authorName: authorName(), createdAt: serverTimestamp() });
      document.getElementById('cin').value = '';
      await load();
    } catch (e) { err('Could not send. Check your connection.'); }
    ev.target.disabled = false;
  };
}

function reportItem(path, kind, preview, authorId) {
  const root = openSheet(`<h2>Report ${esc(kind)}</h2>
    <div class="field"><label>Reason</label><select id="rr">
      <option>Promotion or advertising</option><option>Spam or fake</option><option>Abusive language</option><option>Not related to CCTV or security</option><option>Other</option></select></div>
    <div class="row"><button class="btn" id="rs">Send report</button><button class="btn sec" id="rc">${t('Cancel')}</button></div>`);
  root.querySelector('#rc').onclick = () => root.remove();
  root.querySelector('#rs').onclick = async () => {
    try {
      await addDoc(collection(ref.db, 'reports'), {
        path, kind, authorId: authorId || '', preview: String(preview || '').slice(0, 120),
        reason: root.querySelector('#rr').value, reporterId: S.user.uid, createdAt: serverTimestamp(),
      });
      root.remove(); toast('Thanks. SHEYON CORP will review.');
    } catch (e) { toast('Could not send report'); }
  };
}

/* ---------- jobs ---------- */
async function renderJobs() {
  const chips = ['all', ...Object.keys(JOB_KINDS)];
  const admin = S.staff?.role === 'admin';
  const draw = () => {
    const list = (S.jobs || []).filter((j) => (S.jobFilter === 'all' || j.kind === S.jobFilter) && (!S.jobDistrict || j.district === S.jobDistrict));
    main().innerHTML = `<div class="chips">${chips.map((c) =>
      `<button class="chip ${S.jobFilter === c ? 'on' : ''}" data-f="${c}">${esc(t(c === 'all' ? 'All' : JOB_KINDS[c]))}</button>`).join('')}</div>
      <select class="search" id="jd">${distOpts(S.jobDistrict, true)}</select>` +
      (list.length ? list.map((j) => jobCard(j, admin)).join('') : empty());
    main().querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { S.jobFilter = b.dataset.f; draw(); }; });
    main().querySelector('#jd').onchange = (e) => { S.jobDistrict = e.target.value; draw(); };
    main().querySelectorAll('[data-close]').forEach((b) => { b.onclick = async () => {
      const j = S.jobs.find((x) => x.id === b.dataset.close);
      const next = j.status === 'open' ? 'closed' : 'open';
      try { await updateDoc(doc(ref.db, 'jobs', j.id), { status: next }); j.status = next; draw(); } catch (e) { toast('Could not update'); }
    }; });
    main().querySelectorAll('[data-djob]').forEach((b) => { b.onclick = async () => {
      if (!confirm('Delete this listing?')) return;
      try { await deleteDoc(doc(ref.db, 'jobs', b.dataset.djob)); S.jobs = S.jobs.filter((x) => x.id !== b.dataset.djob); draw(); } catch (e) { toast('Could not delete'); }
    }; });
    main().querySelectorAll('[data-rjob]').forEach((b) => { b.onclick = () => {
      const j = S.jobs.find((x) => x.id === b.dataset.rjob);
      reportItem(`jobs/${j.id}`, 'listing', j.title, j.authorId);
    }; });
  };
  if (S.jobs) draw(); else spinner();
  try { S.jobs = await fetchList('jobs', 150); if (S.tab === 'jobs') draw(); } catch (e) { if (!S.jobs) main().innerHTML = empty('Could not load. Check your connection.'); }
}
function jobCard(j, admin) {
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
      ${mine || admin ? `<button class="btn danger sm" data-djob="${j.id}">${t('Delete')}</button>` : `<button class="btn sec sm" data-rjob="${j.id}">${t('Report')}</button>`}
    </div></div>`;
}
function skillPicker(selected) {
  return `<div class="skills" style="gap:8px">${SKILLS.map((s) =>
    `<button type="button" class="chip ${selected.includes(s) ? 'on' : ''}" data-skill="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
}
const bindSkills = (root) => root.querySelectorAll('[data-skill]').forEach((b) => { b.onclick = () => b.classList.toggle('on'); });
const pickedSkills = (root) => [...root.querySelectorAll('[data-skill].on')].map((b) => b.dataset.skill);

function composeJob() {
  const root = openSheet(`<h2>New listing</h2>
    <div class="field"><label>What do you need?</label><select id="jk">${opts(JOB_KINDS, 'hiring')}</select></div>
    <div class="field"><label>Title</label><input id="jt" maxlength="100" placeholder="e.g. 2 CCTV installation technicians needed"></div>
    <div class="field"><label>District</label><select id="jd2">${distOpts(S.member?.district)}</select></div>
    <div class="field"><label>Pay or rate (optional)</label><input id="jp" maxlength="40" placeholder="e.g. 18,000 per month or 500 per camera"></div>
    <div class="field"><label>Details</label><textarea id="jdt" maxlength="800" placeholder="Work type, duration, experience needed, joining date"></textarea>
      <div class="hint">No links or phone numbers in the text. Your contact number is added below.</div></div>
    <div class="field"><label>Skills</label>${skillPicker([])}</div>
    <div class="field"><label>Contact number</label><input id="jph" inputmode="numeric" value="${esc(S.member?.phone || '')}" maxlength="10"></div>
    <div class="err" id="jerr"></div>
    <div class="row"><button class="btn" id="js">${t('Post')}</button><button class="btn sec" id="jc">${t('Cancel')}</button></div>`);
  bindSkills(root);
  root.querySelector('#jc').onclick = () => root.remove();
  root.querySelector('#js').onclick = async (ev) => {
    const g = (id) => root.querySelector(id).value.trim();
    const data = { kind: g('#jk'), title: g('#jt'), district: g('#jd2'), pay: g('#jp'), details: g('#jdt'), phone: digits(g('#jph')), skills: pickedSkills(root), status: 'open' };
    const err = (m) => { root.querySelector('#jerr').textContent = m; };
    if (data.title.length < 5) return err('Write a clear title.');
    if (!data.district) return err('Select a district.');
    if (!MOBILE.test(data.phone)) return err('Enter a valid 10-digit contact number.');
    const bad = cleanText(`${data.title} ${data.details}`); if (bad) return err(bad);
    ev.target.disabled = true;
    try {
      await addDoc(collection(ref.db, 'jobs'), { ...data, authorId: S.user.uid, authorName: authorName(), createdAt: serverTimestamp() });
      root.remove(); toast('Listing posted'); S.jobs = null; renderShell();
    } catch (e) { err('Could not post. Check your connection.'); ev.target.disabled = false; }
  };
}

/* ---------- member directory ---------- */
async function renderPeople() {
  const draw = () => {
    const q = S.pSearch.toLowerCase();
    const list = (S.people || []).filter((u) => !u.suspended && (!S.pDistrict || u.district === S.pDistrict) && (!S.pType || u.category === S.pType) &&
      (!q || `${u.name} ${u.businessName || ''} ${(u.skills || []).join(' ')}`.toLowerCase().includes(q)));
    main().innerHTML = `<input class="search" id="ps" placeholder="${esc(t('Search name or skill'))}" value="${esc(S.pSearch)}">
      <div class="row" style="margin:0 0 10px"><select class="search" id="pdi" style="flex:1;margin:0">${distOpts(S.pDistrict, true)}</select>
      <select class="search" id="pty" style="flex:1;margin:0"><option value="">All types</option>${Object.entries(CAT_LABEL).map(([k, v]) => `<option value="${k}" ${k === S.pType ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div>${list.length ? list.map(personCard).join('') : empty()}</div>`;
    document.getElementById('ps').oninput = (e) => {
      S.pSearch = e.target.value; const pos = e.target.selectionStart; draw();
      const n = document.getElementById('ps'); n.focus(); n.setSelectionRange(pos, pos);
    };
    document.getElementById('pdi').onchange = (e) => { S.pDistrict = e.target.value; draw(); };
    document.getElementById('pty').onchange = (e) => { S.pType = e.target.value; draw(); };
  };
  if (S.people) draw(); else spinner();
  try {
    const snap = await getDocs(query(collection(ref.db, 'members'), limit(600)));
    S.people = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (S.tab === 'people') draw();
  } catch (e) { if (!S.people) main().innerHTML = empty('Could not load. Check your connection.'); }
}
function personCard(u) {
  const me = u.id === S.user.uid;
  return `<div class="card"><div class="person"><div class="avatar">${initial(u.name)}</div><div class="info">
    <b>${esc(u.name)}</b>${me ? ' <span class="badge">You</span>' : ''}
    <div class="meta"><span>${esc(CAT_LABEL[u.category] || '')}</span><span>• 📍 ${esc(u.district || '')}</span>${u.experience ? `<span>• ${esc(u.experience)} yrs</span>` : ''}</div>
    ${u.businessName ? `<div class="meta" style="margin-top:2px">${esc(u.businessName)}</div>` : ''}
    ${(u.skills || []).length ? `<div class="skills">${u.skills.map((s) => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
    ${u.bio ? `<p>${esc(u.bio)}</p>` : ''}
    ${!me && u.phone ? `<div class="row"><a class="btn sm" href="${telLink(u.phone)}">${t('Call')}</a><a class="btn wa sm" href="${waLink(u.phone)}" target="_blank" rel="noopener">${t('WhatsApp')}</a></div>` : ''}
    </div></div></div>`;
}

/* ---------- me ---------- */
function renderMe() {
  const m = S.member;
  const staffOnly = S.staff && !m;
  main().innerHTML = `<div class="card"><div class="person"><div class="avatar">${initial(m?.name || S.staff?.name || S.user.displayName)}</div><div class="info">
      <b style="font-size:17px">${esc(m?.name || S.staff?.name || S.user.displayName || 'SHEYON CORP')}</b>
      <div class="meta">${S.staff ? `<span class="badge">${S.staff.role === 'admin' ? 'Admin' : 'Telecaller'}</span>` : `<span class="badge b-available">Verified</span><span>${esc(CAT_LABEL[m.category] || '')}</span>`}${m ? `<span>• 📍 ${esc(m.district)}</span>` : ''}</div>
      <div class="meta" style="margin-top:4px">${m ? `${esc(m.phone)} • ` : ''}${esc(S.user.email)}</div></div></div>
      ${m?.bio ? `<p>${esc(m.bio)}</p>` : ''}
      ${(m?.skills || []).length ? `<div class="skills">${m.skills.map((s) => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
      <div class="row">${m ? `<button class="btn sm" id="ep">${t('Edit profile')}</button>` : ''}
      <button class="btn sec sm" id="lg">${getLang() === 'en' ? 'தமிழ்' : 'English'}</button></div></div>
    ${staffOnly ? '' : `<a class="btn wa block" href="${WHATSAPP_GROUP}" target="_blank" rel="noopener" style="margin-bottom:10px">Join the WhatsApp group</a>`}
    <div class="card"><h3 style="margin-top:0">${t('Community rules')}</h3><ul class="rules">
      <li>Only CCTV, security and related technical topics.</li>
      <li>No product, service or company promotion. No links or phone numbers in posts.</li>
      <li>Respect every member. No abusive language.</li>
      <li>Post genuine manpower and contract requirements only.</li>
      <li>Offers and orders come from SHEYON CORP only.</li>
      <li>Reported content is reviewed. Repeat offenders lose access.</li>
    </ul></div>
    ${S.staff?.role === 'admin' ? '<div class="card"><h3 style="margin-top:0">Admin: reports</h3><div id="rep"><div class="spin" style="margin:14px auto"></div></div></div>' : ''}
    <button class="btn danger block" id="lo">${t('Log out')}</button>
    <p class="sub" style="font-size:11px;text-align:center;margin-top:14px;color:var(--muted)"><button class="link" id="cid" style="font-size:11px">Your ID: ${esc(S.user.uid)} (tap to copy)</button></p>`;
  document.getElementById('ep')?.addEventListener('click', editProfile);
  document.getElementById('lg').onclick = () => { setLang(getLang() === 'en' ? 'ta' : 'en'); renderShell(); };
  document.getElementById('lo').onclick = logout;
  document.getElementById('cid').onclick = () => copyText(S.user.uid);
  if (S.staff?.role === 'admin') renderReports(document.getElementById('rep'));
}

function editProfile() {
  const m = S.member;
  const root = openSheet(`<h2>${t('Edit profile')}</h2>
    <div class="field"><label>Skills</label>${skillPicker(m.skills || [])}</div>
    <div class="field"><label>About (optional)</label><textarea id="pb" maxlength="400" style="min-height:80px">${esc(m.bio || '')}</textarea>
      <div class="hint">No links, phone numbers or promotion.</div></div>
    <div class="err" id="perr"></div>
    <div class="row"><button class="btn" id="psave">${t('Save')}</button><button class="btn sec" id="pc">${t('Cancel')}</button></div>`);
  bindSkills(root);
  root.querySelector('#pc').onclick = () => root.remove();
  root.querySelector('#psave').onclick = async (ev) => {
    const bio = root.querySelector('#pb').value.trim();
    const skills = pickedSkills(root);
    const err = (x) => { root.querySelector('#perr').textContent = x; };
    const bad = postText(bio); if (bad) return err(bad);
    ev.target.disabled = true;
    try {
      await updateDoc(doc(ref.db, 'members', S.user.uid), { bio, skills });
      S.people = null; root.remove(); toast('Profile saved'); renderShell();
    } catch (e) { err('Could not save. Check your connection.'); ev.target.disabled = false; }
  };
}
