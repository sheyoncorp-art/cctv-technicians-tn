import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';
import { DISTRICTS, KINDS, TEAM_SIZES } from './data.js';
import { S, ref, $app, esc, digits, telLink, toast, copyText, camLogo, SUPPORT_PHONE, hooks } from './shared.js';

/* The category is decided here from facts, never chosen by the applicant. A telecaller confirms it after the call. */
export function classify(a) {
  if (a.office === 'yes' && a.gst === 'yes' && a.staff === 'yes') return ['A', 'Office, GST and staff'];
  if (a.office === 'no' && a.gst === 'no') return ['C', 'No office and no GST'];
  if (a.office === 'yes' && a.gst === 'no') return ['B', 'Office but no GST'];
  if (a.office === 'yes') return ['B', 'Office and GST but no staff'];
  return ['B', 'GST but no office, check on the call'];
}

export async function logout() {
  S.posts = S.jobs = S.people = S.offers = S.orders = null;
  S.tab = 'feed'; S.thread = null; S.review = null;
  try { if (Capacitor.isNativePlatform()) await FirebaseAuthentication.signOut(); } catch (e) { /* ignore */ }
  await signOut(ref.auth);
}

const idLine = () => `<p class="sub" style="font-size:11px;margin-top:18px;text-align:center">Signed in as ${esc(S.user.email)}
  <br><button class="link" id="cid" style="font-size:11px">Your ID: ${esc(S.user.uid)} (tap to copy)</button></p>`;
const bindId = () => { const b = document.getElementById('cid'); if (b) b.onclick = () => copyText(S.user.uid); };

const MOBILE = /^[6-9]\d{9}$/;
const GSTRE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function yn(key, q, a) {
  return `<div class="field"><label>${q}</label><div class="seg">
    <button type="button" data-y="${key}" data-v="yes" class="${a[key] === 'yes' ? 'on' : ''}">Yes</button>
    <button type="button" data-y="${key}" data-v="no" class="${a[key] === 'no' ? 'on' : ''}">No</button></div></div>`;
}
const inp = (id, label, d, ph, extra = '') =>
  `<div class="field"><label>${label}</label><input id="f_${id}" ${extra} placeholder="${esc(ph)}" value="${esc(d[id] ?? '')}"></div>`;

/* ---------- application form ---------- */
export function renderApplicationForm(resubmit) {
  const old = S.app || {};
  const draft = S._draft || { a: { office: old.office || '', gst: old.gst || '', staff: old.staff || '', kind: old.kind || 'main' }, d: { ...old } };
  S._draft = draft;
  const { a, d } = draft;
  const note = resubmit && old.callNotes
    ? `<div class="card" style="border-color:var(--accent)"><b>The SHEYON CORP team needs more details</b><p>${esc(old.callNotes)}</p></div>` : '';
  $app.innerHTML = `<div class="auth">
    <h1 style="font-size:22px">Verification form</h1>
    <p class="sub">A few quick questions. A SHEYON CORP telecaller will call you to confirm. Community and orders open after you are verified.</p>
    ${note}
    ${inp('name', 'Full name', d, 'Ravi Kumar', 'maxlength="60"')}
    ${inp('phone', 'Mobile number (we will call this number)', d, '9876543210', 'inputmode="numeric" maxlength="10"')}
    <div class="field"><label>District</label><select id="f_district"><option value="">Select district</option>${DISTRICTS.map((x) => `<option ${x === d.district ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    ${yn('office', 'Do you have your own office or shop?', a)}
    ${yn('gst', 'Do you have a GST registration?', a)}
    ${a.gst === 'yes' ? inp('gstNo', 'GST number', d, '33ABCDE1234F1Z5', 'maxlength="15" autocapitalize="characters"') : ''}
    ${yn('staff', 'Do you have staff working under you?', a)}
    ${a.staff === 'yes' ? `<div class="field"><label>How many staff?</label><select id="f_teamSize">${TEAM_SIZES.map((x) => `<option ${x === d.teamSize ? 'selected' : ''}>${x}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label>Which describes you best?</label><select id="f_kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${k === a.kind ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    ${a.office === 'yes' ? inp('bName', 'Business or shop name', d, 'Ravi Electricals', 'maxlength="80"') + inp('address', 'Office or shop address', d, 'Street, area, city', 'maxlength="200"') : ''}
    ${a.office === 'no' ? inp('refName', 'Reference: dealer or employer name', d, 'Name', 'maxlength="60"') + inp('refPhone', 'Reference phone number', d, '10-digit number', 'inputmode="numeric" maxlength="10"') : ''}
    ${inp('experience', 'Years of experience in CCTV', d, '4', 'inputmode="numeric" maxlength="2"')}
    <div class="err" id="err"></div>
    <button class="btn block" id="submit">${resubmit ? 'Resubmit for verification' : 'Submit for verification'}</button>
    <button class="link" id="out" style="margin-top:8px">Log out</button>
    ${idLine()}</div>`;
  bindId();
  const grab = () => {
    ['name', 'phone', 'gstNo', 'bName', 'address', 'refName', 'refPhone', 'experience', 'teamSize', 'district'].forEach((k) => {
      const e = document.getElementById(`f_${k}`);
      if (e) d[k] = e.value;
    });
    a.kind = document.getElementById('f_kind').value;
  };
  $app.querySelectorAll('[data-y]').forEach((b) => { b.onclick = () => { grab(); a[b.dataset.y] = b.dataset.v; renderApplicationForm(resubmit); }; });
  $app.querySelectorAll('input,select').forEach((i) => { i.addEventListener('input', () => { document.getElementById('err').textContent = ''; }); });
  document.getElementById('out').onclick = () => { S._draft = null; logout(); };
  document.getElementById('submit').onclick = (ev) => submit(ev, resubmit, grab);
}

async function submit(ev, resubmit, grab) {
  grab();
  const { a, d } = S._draft;
  const g = (k) => String(d[k] ?? '').trim();
  const err = (m) => { document.getElementById('err').textContent = m; };
  if (g('name').length < 2) return err('Enter your full name.');
  if (!MOBILE.test(g('phone'))) return err('Enter a valid 10-digit mobile number.');
  if (!g('district')) return err('Select your district.');
  if (!a.office || !a.gst || !a.staff) return err('Answer all the yes or no questions.');
  if (a.gst === 'yes' && !GSTRE.test(g('gstNo').toUpperCase())) return err('Enter a valid 15-character GST number.');
  if (a.office === 'yes' && g('bName').length < 2) return err('Enter your business or shop name.');
  if (a.office === 'yes' && g('address').length < 5) return err('Enter your address.');
  if (a.office === 'no' && g('refName').length < 2) return err('Enter a reference name.');
  if (a.office === 'no' && !MOBILE.test(g('refPhone'))) return err('Enter a valid reference phone number.');
  if (!/^\d{1,2}$/.test(g('experience'))) return err('Enter your experience in years.');

  const answers = {
    name: g('name'), phone: g('phone'), district: g('district'),
    office: a.office, gst: a.gst, gstNo: a.gst === 'yes' ? g('gstNo').toUpperCase() : '',
    staff: a.staff, teamSize: a.staff === 'yes' ? (g('teamSize') || TEAM_SIZES[0]) : '',
    kind: a.kind,
    bName: a.office === 'yes' ? g('bName') : '', address: a.office === 'yes' ? g('address') : '',
    refName: a.office === 'no' ? g('refName') : '', refPhone: a.office === 'no' ? g('refPhone') : '',
    experience: g('experience'),
    autoCategory: classify(a)[0],
  };
  ev.target.disabled = true;
  try {
    const r = doc(ref.db, 'applications', S.user.uid);
    if (S.app) await updateDoc(r, { ...answers, status: 'pending', updatedAt: serverTimestamp() });
    else await setDoc(r, { ...answers, email: S.user.email, status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    S._draft = null;
    toast(resubmit ? 'Resubmitted' : 'Submitted');
  } catch (e) { err('Could not submit. Check your connection and try again.'); ev.target.disabled = false; }
}

/* ---------- waiting, rejected, suspended ---------- */
export function renderPending() {
  const x = S.app;
  $app.innerHTML = `<div class="auth" style="text-align:center;padding-top:calc(60px + env(safe-area-inset-top))">
    <div class="logo" style="margin:0 auto 14px">${camLogo}</div>
    <h1 style="font-size:22px">Verification in progress</h1>
    <p class="sub">A SHEYON CORP telecaller will call <b>${esc(x.phone)}</b> within 24 hours. This screen opens the community automatically once you are verified.</p>
    <div class="card" style="text-align:left"><b>${esc(x.name)}</b><div class="meta"><span>${esc(x.district)}</span><span>• Submitted ${esc(x.createdAt?.toDate ? x.createdAt.toDate().toLocaleDateString() : 'just now')}</span></div></div>
    <div class="row" style="justify-content:center">
      <button class="btn sec" id="edit">Edit my details</button>
      <a class="btn sec" href="${telLink(SUPPORT_PHONE)}">Call support</a></div>
    <button class="link" id="out" style="margin-top:10px">Log out</button>
    ${idLine()}</div>`;
  bindId();
  document.getElementById('edit').onclick = () => { S._draft = null; renderApplicationForm(true); };
  document.getElementById('out').onclick = logout;
}

export function renderBlocked(title, text) {
  $app.innerHTML = `<div class="auth" style="text-align:center;padding-top:calc(60px + env(safe-area-inset-top))">
    <div class="logo" style="margin:0 auto 14px">${camLogo}</div>
    <h1 style="font-size:22px">${esc(title)}</h1><p class="sub">${esc(text)}</p>
    <div class="row" style="justify-content:center"><a class="btn" href="${telLink(SUPPORT_PHONE)}">Call SHEYON CORP</a>
    <button class="btn sec" id="out">Log out</button></div>${idLine()}</div>`;
  bindId();
  document.getElementById('out').onclick = logout;
}

export const renderRejected = () => renderBlocked('We could not verify you', 'Your details could not be confirmed. If you think this is a mistake, call SHEYON CORP.');
export const renderSuspended = () => renderBlocked('Access paused', 'Your access to the community is paused. Call SHEYON CORP to resolve this.');

void digits; void hooks;
