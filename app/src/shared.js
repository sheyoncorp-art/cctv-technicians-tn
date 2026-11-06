import { t } from './i18n.js';

/* ---------- shared state ---------- */
export const S = {
  user: null,
  staff: null,       // { role: 'admin' | 'telecaller', name? } when this user is SHEYON CORP staff
  app: null,         // this user's verification application
  member: null,      // this user's verified member profile
  tab: 'feed',
  thread: null,      // open post
  review: null,      // open application (staff)
  postFilter: 'all', jobFilter: 'all', jobDistrict: '', pDistrict: '', pSearch: '', pType: '',
  vFilter: 'pending',
  posts: null, jobs: null, people: null, offers: null, orders: null,
};
export const ref = { auth: null, db: null };
export const hooks = { render: () => {}, route: () => {} };

export const SUPPORT_PHONE = '9894559498';

/* ---------- small helpers ---------- */
export const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const initial = (n) => esc((n || '?').trim().charAt(0).toUpperCase());
export const digits = (p) => String(p || '').replace(/\D/g, '');
export const waLink = (p) => {
  let n = digits(p);
  if (n.length === 10) n = '91' + n;
  return `https://wa.me/${n}`;
};
export const telLink = (p) => `tel:${digits(p)}`;

let toastTimer;
export function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2600);
}

export function ago(ts) {
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return 'just now';
  const s = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return d.toLocaleDateString();
}

export const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(t(v))}</option>`).join('');

export function openSheet(inner) {
  document.querySelector('.sheet-bg')?.remove();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet">${inner}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  return bg;
}

export const icons = {
  feed: '<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></svg>',
  jobs: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/></svg>',
  orders: '<svg viewBox="0 0 24 24"><path d="M6 7h12l-1 12H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14.5c2.4 0 4 1.6 4 4"/></svg>',
  verify: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.500-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  me: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
};
export const camLogo = '<svg viewBox="0 0 24 24"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h10A2.5 2.5 0 0 1 18 6.5V8l3-1.6v9.2L18 14v1.5a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 3 15.500z"/></svg>';

/* ---------- content rules: technical only, no promotion ---------- */
const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|net|org|co|io|me|app|link)\b)/i;
const PHONE_RE = /\d{10}|\d{5}[ -]\d{5}/;
const PROMO_RE = /(offer|discount|best price|lowest price|wholesale|dealer price|buy from|for sale|whatsapp me|call me|dm me|contact me)/i;

// links and phone numbers (used for posts, replies and listing text)
export function cleanText(s) {
  if (URL_RE.test(s)) return 'Links are not allowed in the community.';
  if (PHONE_RE.test(s)) return 'Phone numbers are not allowed in text. Members can contact you from your profile.';
  return '';
}
// posts and replies are also checked for sales language
export function postText(s) {
  return cleanText(s) || (PROMO_RE.test(s) ? 'This reads like promotion. Keep posts technical.' : '');
}

export const authorName = () => S.member?.name || S.staff?.name || S.user?.displayName || 'SHEYON CORP';

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); } catch (e) { toast(text); }
}

export const spinnerHtml = '<div class="spin"></div>';
export const empty = (m) => `<div class="empty">${esc(m || t('Nothing here yet'))}</div>`;
