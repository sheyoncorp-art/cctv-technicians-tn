import {
  collection, doc, query, where, orderBy, limit, getDocs, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { KINDS, CAT_LABEL } from './data.js';
import {
  S, ref, $app, esc, ago, telLink, waLink, toast, openSheet, empty, spinnerHtml, hooks, cleanText,
} from './shared.js';
import { classify } from './apply.js';

const main = () => document.getElementById('main');

const CHECKS = {
  A: ['Called and confirmed identity', 'GST is valid on the portal', 'Office confirmed (photo or visit)', 'Staff confirmed'],
  B: ['Called and confirmed identity', 'Shop or office confirmed', 'Business name matches'],
  C: ['Called and confirmed identity', 'Reference called and confirmed', 'Works in the claimed district'],
};
const CAT_HINT = { A: 'A: office, GST and staff', B: 'B: office without GST, or side business', C: 'C: technician, no office or GST' };
const STATUS_LABEL = { pending: 'Pending', needs_info: 'Needs info', verified: 'Verified', rejected: 'Rejected' };

/* ---------- verification queue (telecaller + admin) ---------- */
export async function renderVerifyTab() {
  const chips = ['pending', 'needs_info', 'verified', 'rejected'];
  main().innerHTML = `<div class="chips">${chips.map((c) =>
    `<button class="chip ${S.vFilter === c ? 'on' : ''}" data-f="${c}">${STATUS_LABEL[c]}</button>`).join('')}</div><div id="vlist">${spinnerHtml}</div>`;
  main().querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { S.vFilter = b.dataset.f; renderVerifyTab(); }; });
  const box = document.getElementById('vlist');
  try {
    const snap = await getDocs(query(collection(ref.db, 'applications'), where('status', '==', S.vFilter), limit(100)));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
    S._queue = list;
    box.innerHTML = list.length ? list.map((x) => `<div class="card" data-open="${x.id}" style="cursor:pointer">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <b>${esc(x.name)}</b><span class="badge">${esc(CAT_LABEL[x.category || x.autoCategory])} (${esc(x.category || x.autoCategory)})</span></div>
      <div class="meta"><span>${esc(x.district)}</span><span>• ${esc(x.phone)}</span><span>• ${ago(x.createdAt)}</span></div></div>`).join('')
      : empty(S.vFilter === 'pending' ? 'No pending applications.' : 'Nothing here.');
    box.querySelectorAll('[data-open]').forEach((c) => { c.onclick = () => { S.review = list.find((x) => x.id === c.dataset.open); hooks.render(); }; });
  } catch (e) { box.innerHTML = empty('Could not load applications.'); }
}

function detailRows(x) {
  const rows = [
    ['Name', x.name], ['Mobile', x.phone], ['District', x.district],
    ['Own office or shop', x.office], ['GST', x.gst === 'yes' ? x.gstNo : 'no'],
    ['Staff', x.staff === 'yes' ? `yes, ${x.teamSize}` : 'no'], ['Describes self', KINDS[x.kind]],
    ['Experience', `${x.experience} years`], ['Google email', x.email],
  ];
  if (x.office === 'yes') rows.push(['Business', x.bName], ['Address', x.address]);
  else rows.push(['Reference', `${x.refName}, ${x.refPhone}`]);
  return rows;
}

/* ---------- review one application ---------- */
export function renderReview() {
  const x = S.review;
  const own = x.id === S.user.uid;
  const suggested = classify(x)[0];
  let cat = x.category || suggested;
  const checked = {};
  const draw = () => {
    const list = CHECKS[cat];
    $app.innerHTML = `<div class="hdr"><button class="link" id="back">← Back</button><span class="badge">${STATUS_LABEL[x.status]}</span></div>
      <div class="main" id="main">
        <div class="card"><h3 style="margin-top:0">${esc(x.name)}</h3>
          ${detailRows(x).map((r) => `<p style="margin:3px 0"><span style="color:var(--muted)">${esc(r[0])}:</span> ${esc(r[1])}</p>`).join('')}
          <div class="row"><a class="btn sm" href="${telLink(x.phone)}">Call</a><a class="btn wa sm" href="${waLink(x.phone)}" target="_blank" rel="noopener">WhatsApp</a></div></div>
        ${own ? '<div class="card">You cannot decide your own application.</div>' : `
        <div class="card"><span class="badge">System suggests ${esc(CAT_LABEL[suggested])} (${suggested})</span>
          <div class="meta" style="margin-top:6px">${esc(classify(x)[1])}</div>
          <div class="field" style="margin-top:12px"><label>Final category after the call</label>
            <select id="cat">${['A', 'B', 'C'].map((k) => `<option value="${k}" ${k === cat ? 'selected' : ''}>${CAT_HINT[k]}</option>`).join('')}</select></div></div>
        <div class="card"><b>Checks</b>${list.map((c, i) => `<label class="ck"><input type="checkbox" data-k="${i}" ${checked[i] ? 'checked' : ''}> ${esc(c)}</label>`).join('')}</div>
        <div class="field"><label>Call notes</label><textarea id="nt" maxlength="300">${esc(x.callNotes || '')}</textarea>
          <div class="hint">For Need info, this note is shown to the applicant. Keep it short and polite.</div></div>
        <div class="err" id="err"></div>
        <div class="row"><button class="btn" id="ok">Verify</button><button class="btn sec" id="mi">Need info</button><button class="btn danger" id="no">Reject</button></div>`}
      </div>`;
    document.getElementById('back').onclick = () => { S.review = null; hooks.render(); };
    if (own) return;
    const err = (m) => { document.getElementById('err').textContent = m; };
    document.getElementById('cat').onchange = (e) => { cat = e.target.value; Object.keys(checked).forEach((k) => delete checked[k]); keepNote(); draw(); };
    const keepNote = () => { x.callNotes = document.getElementById('nt').value; };
    $app.querySelectorAll('[data-k]').forEach((c) => { c.onchange = () => { checked[c.dataset.k] = c.checked; err(''); }; });
    const decide = async (status, minNote, needAll) => {
      const notes = document.getElementById('nt').value.trim();
      if (needAll && !list.every((_, i) => checked[i])) return err('Tick every check before verifying.');
      if (notes.length < minNote) return err(status === 'needs_info' ? 'Write what the applicant should fix or add.' : 'Add a short call note.');
      const btns = $app.querySelectorAll('.row .btn'); btns.forEach((b) => { b.disabled = true; });
      try {
        const b = writeBatch(ref.db);
        const checks = {}; list.forEach((c, i) => { checks[c] = Boolean(checked[i]); });
        b.update(doc(ref.db, 'applications', x.id), {
          status, category: cat, callNotes: notes, checks, verifiedBy: S.user.uid, verifiedAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        if (status === 'verified') {
          b.set(doc(ref.db, 'members', x.id), {
            name: x.name, phone: x.phone, district: x.district, category: cat,
            businessName: x.bName || '', experience: Number(x.experience) || 0, verifiedAt: serverTimestamp(),
          }, { merge: true });
        }
        await b.commit();
        toast(status === 'verified' ? 'Member verified' : status === 'needs_info' ? 'Sent back for more details' : 'Application rejected');
        S.review = null; hooks.render();
      } catch (e) { err('Could not save. Check your connection and permissions.'); btns.forEach((bb) => { bb.disabled = false; }); }
    };
    document.getElementById('ok').onclick = () => decide('verified', 3, true);
    document.getElementById('mi').onclick = () => decide('needs_info', 5, false);
    document.getElementById('no').onclick = () => decide('rejected', 3, false);
  };
  draw();
}

/* ---------- orders: official offers from SHEYON CORP ---------- */
const ORDER_STATUS = { requested: 'Requested', confirmed: 'Confirmed', dispatched: 'Dispatched', cancelled: 'Cancelled' };

export async function renderOrdersTab() {
  const admin = S.staff?.role === 'admin';
  main().innerHTML = spinnerHtml;
  try {
    const offSnap = await getDocs(query(collection(ref.db, 'offers'), orderBy('createdAt', 'desc'), limit(50)));
    S.offers = offSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const ordSnap = admin
      ? await getDocs(query(collection(ref.db, 'orders'), orderBy('createdAt', 'desc'), limit(100)))
      : await getDocs(query(collection(ref.db, 'orders'), where('uid', '==', S.user.uid), limit(50)));
    S.orders = ordSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  } catch (e) { main().innerHTML = empty('Could not load. Check your connection.'); return; }
  draw();

  function draw() {
    const offers = admin ? S.offers : S.offers.filter((o) => o.status === 'active');
    main().innerHTML = `<p class="sub" style="color:var(--muted);margin:0 0 10px">Official offers from SHEYON CORP only. Members cannot post offers.</p>
      ${admin ? '<button class="btn sm" id="newoffer" style="margin-bottom:10px">+ New offer</button>' : ''}
      ${offers.length ? offers.map((o) => `<div class="card" style="${o.status === 'closed' ? 'opacity:.6' : ''}">
        <h3 style="margin-top:0">${esc(o.title)}</h3>${o.details ? `<p>${esc(o.details)}</p>` : ''}
        <div class="meta"><span>${ago(o.createdAt)}</span>${o.status === 'closed' ? '<span class="badge">Closed</span>' : ''}</div>
        <div class="row">
          ${!admin && o.status === 'active' ? `<button class="btn sm" data-req="${o.id}">Request order</button>` : ''}
          ${admin ? `<button class="btn sec sm" data-tog="${o.id}">${o.status === 'active' ? 'Close' : 'Reopen'}</button><button class="btn danger sm" data-doff="${o.id}">Delete</button>` : ''}
        </div></div>`).join('') : empty('No offers right now.')}
      <h3 style="margin:18px 2px 8px;font-size:14px;color:var(--muted)">${admin ? 'All order requests' : 'My requests'}</h3>
      ${S.orders.length ? S.orders.map((r) => `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(r.offerTitle)}</b><span class="badge">${esc(ORDER_STATUS[r.status] || r.status)}</span></div>
        <div class="meta"><span>Qty: ${esc(r.qty || '-')}</span>${admin ? `<span>• ${esc(r.name)}</span><span>• ${esc(r.phone)}</span>` : ''}<span>• ${ago(r.createdAt)}</span></div>
        ${r.note ? `<p>${esc(r.note)}</p>` : ''}
        ${admin ? `<div class="row"><a class="btn sm" href="${telLink(r.phone)}">Call</a>
          ${['confirmed', 'dispatched', 'cancelled'].filter((s) => s !== r.status).map((s) => `<button class="btn sec sm" data-st="${r.id}|${s}">${ORDER_STATUS[s]}</button>`).join('')}</div>` : ''}</div>`).join('') : empty('No requests yet.')}`;

    document.getElementById('newoffer')?.addEventListener('click', newOffer);
    main().querySelectorAll('[data-req]').forEach((b) => { b.onclick = () => requestOrder(S.offers.find((o) => o.id === b.dataset.req)); });
    main().querySelectorAll('[data-tog]').forEach((b) => { b.onclick = async () => {
      const o = S.offers.find((x) => x.id === b.dataset.tog); const next = o.status === 'active' ? 'closed' : 'active';
      try { await updateDoc(doc(ref.db, 'offers', o.id), { status: next }); o.status = next; draw(); } catch (e) { toast('Could not update'); }
    }; });
    main().querySelectorAll('[data-doff]').forEach((b) => { b.onclick = async () => {
      if (!confirm('Delete this offer?')) return;
      try { await deleteDoc(doc(ref.db, 'offers', b.dataset.doff)); S.offers = S.offers.filter((x) => x.id !== b.dataset.doff); draw(); } catch (e) { toast('Could not delete'); }
    }; });
    main().querySelectorAll('[data-st]').forEach((b) => { b.onclick = async () => {
      const [id, st] = b.dataset.st.split('|');
      try { await updateDoc(doc(ref.db, 'orders', id), { status: st, updatedAt: serverTimestamp() }); S.orders.find((x) => x.id === id).status = st; draw(); } catch (e) { toast('Could not update'); }
    }; });
  }

  function newOffer() {
    const root = openSheet(`<h2>New offer</h2>
      <div class="field"><label>Title</label><input id="ot" maxlength="120" placeholder="Camlite 2MP bullet, carton of 10"></div>
      <div class="field"><label>Details</label><textarea id="od" maxlength="500" placeholder="Rate, stock, dispatch time"></textarea></div>
      <div class="err" id="oe"></div><div class="row"><button class="btn" id="os">Publish</button><button class="btn sec" id="oc">Cancel</button></div>`);
    root.querySelector('#oc').onclick = () => root.remove();
    root.querySelector('#os').onclick = async (ev) => {
      const title = root.querySelector('#ot').value.trim(); const details = root.querySelector('#od').value.trim();
      if (title.length < 4) { root.querySelector('#oe').textContent = 'Write a clear title.'; return; }
      ev.target.disabled = true;
      try { await addDoc(collection(ref.db, 'offers'), { title, details, status: 'active', createdAt: serverTimestamp() }); root.remove(); toast('Offer published'); renderOrdersTab(); }
      catch (e) { root.querySelector('#oe').textContent = 'Could not publish.'; ev.target.disabled = false; }
    };
  }

  function requestOrder(o) {
    const root = openSheet(`<h2>Request order</h2><p class="sub" style="color:var(--muted)">${esc(o.title)}</p>
      <div class="field"><label>Quantity</label><input id="rq" maxlength="20" placeholder="e.g. 10 pieces"></div>
      <div class="field"><label>Note (optional)</label><textarea id="rn" maxlength="300" style="min-height:70px" placeholder="Delivery area, preferred time"></textarea></div>
      <div class="err" id="re"></div><div class="row"><button class="btn" id="rs">Send request</button><button class="btn sec" id="rc">Cancel</button></div>`);
    root.querySelector('#rc').onclick = () => root.remove();
    root.querySelector('#rs').onclick = async (ev) => {
      const qty = root.querySelector('#rq').value.trim(); const note = root.querySelector('#rn').value.trim();
      const err = (m) => { root.querySelector('#re').textContent = m; };
      if (!qty) return err('Enter the quantity.');
      const bad = cleanText(note); if (bad) return err(bad);
      ev.target.disabled = true;
      try {
        await addDoc(collection(ref.db, 'orders'), {
          uid: S.user.uid, name: S.member?.name || '', phone: S.member?.phone || '', offerId: o.id, offerTitle: o.title,
          qty, note, status: 'requested', createdAt: serverTimestamp(),
        });
        root.remove(); toast('Order requested. SHEYON CORP will call you.'); renderOrdersTab();
      } catch (e) { err('Could not send. Check your connection.'); ev.target.disabled = false; }
    };
  }
}

/* ---------- admin: reports ---------- */
export async function renderReports(el) {
  try {
    const snap = await getDocs(query(collection(ref.db, 'reports'), orderBy('createdAt', 'desc'), limit(50)));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    el.innerHTML = list.length ? list.map((r) => `<div class="comment"><div class="meta"><span class="badge">${esc(r.kind)}</span><span>${esc(r.reason)}</span><span>• ${ago(r.createdAt)}</span></div>
      <p>${esc(r.preview)}</p><div class="row" style="margin-top:4px">
      <button class="btn danger sm" data-rdel="${r.id}">Delete content</button>
      ${r.authorId ? `<button class="btn danger sm" data-rsus="${r.id}">Suspend member</button>` : ''}
      <button class="btn sec sm" data-rok="${r.id}">Dismiss</button></div></div>`).join('') : '<div class="empty" style="padding:14px">No reports.</div>';
    el.querySelectorAll('[data-rdel]').forEach((b) => { b.onclick = async () => {
      const r = list.find((x) => x.id === b.dataset.rdel);
      try { await deleteDoc(doc(ref.db, r.path)); await deleteDoc(doc(ref.db, 'reports', r.id)); S.posts = S.jobs = null; renderReports(el); } catch (e) { toast('Could not delete'); }
    }; });
    el.querySelectorAll('[data-rsus]').forEach((b) => { b.onclick = async () => {
      const r = list.find((x) => x.id === b.dataset.rsus);
      if (!confirm('Suspend this member? They lose access until you restore them.')) return;
      try { await updateDoc(doc(ref.db, 'members', r.authorId), { suspended: true }); toast('Member suspended'); } catch (e) { toast('Could not suspend'); }
    }; });
    el.querySelectorAll('[data-rok]').forEach((b) => { b.onclick = async () => {
      try { await deleteDoc(doc(ref.db, 'reports', b.dataset.rok)); renderReports(el); } catch (e) { toast('Could not dismiss'); }
    }; });
  } catch (e) { el.innerHTML = '<div class="empty" style="padding:14px">Could not load reports.</div>'; }
}
