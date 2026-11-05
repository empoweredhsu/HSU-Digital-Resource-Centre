// Shared helpers for the public site and the admin panel.

const HSU = window.HSU_CONFIG || {};
const IS_CONFIGURED = Boolean(
  HSU.SUPABASE_URL && HSU.SUPABASE_ANON_KEY && !HSU.SUPABASE_URL.includes('YOUR-PROJECT')
);
const sb = IS_CONFIGURED ? window.supabase.createClient(HSU.SUPABASE_URL, HSU.SUPABASE_ANON_KEY) : null;

const BUCKET = 'resources';
const MAX_UPLOAD_MB = 50; // Supabase free plan limit per file
const MEDIUMS = ['Tamil', 'English', 'Sinhala'];

const KINDS = {
  pdf:     { label: 'PDF',          action: 'Open',     upload: true,  form: 'PDF upload' },
  file:    { label: 'File',         action: 'Download', upload: true,  form: 'Other file' },
  drive:   { label: 'Google Drive', action: 'Open',     upload: false, form: 'Google Drive link' },
  youtube: { label: 'Video',        action: 'Watch',    upload: false, form: 'YouTube video' },
  link:    { label: 'Website',      action: 'Visit',    upload: false, form: 'Website link' },
};

const ICONS = {
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.5 12.6 21a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/></svg>',
  drive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 3h7l6 10.5-3.5 6H6l-3.5-6z"/><path d="M8.5 3 15 13.5h6.5M6 19.5l6.5-11M2.5 13.5H15"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="m10 9 5 3-5 3z" fill="currentColor"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/></svg>',
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeUrl(u) {
  try {
    const x = new URL(String(u).trim());
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
  } catch { return null; }
}

function youtubeId(u) {
  try {
    const x = new URL(u);
    const host = x.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return /^[\w-]{11}$/.test(x.pathname.slice(1, 12)) ? x.pathname.slice(1, 12) : null;
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const v = x.searchParams.get('v');
      if (v && /^[\w-]{11}/.test(v)) return v.slice(0, 11);
      const m = x.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      return m ? m[1] : null;
    }
  } catch { /* not a URL */ }
  return null;
}

function publicFileUrl(path, download = false) {
  return sb.storage.from(BUCKET).getPublicUrl(path, download ? { download: true } : undefined).data.publicUrl;
}

function resourceHref(r) {
  return r.file_path ? publicFileUrl(r.file_path) : safeUrl(r.url);
}

function stripExt(name) {
  return String(name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

// Turn the flat category rows into a tree.
function buildTree(rows) {
  const byId = new Map(rows.map(r => [r.id, { ...r, children: [] }]));
  const roots = [];
  for (const n of byId.values()) {
    const parent = n.parent_id ? byId.get(n.parent_id) : null;
    (parent ? parent.children : roots).push(n);
  }
  const sortList = list => {
    list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    list.forEach(n => sortList(n.children));
  };
  sortList(roots);
  return { byId, roots };
}

function pathTo(byId, id) {
  const out = [];
  const seen = new Set();
  let n = byId.get(id);
  while (n && !seen.has(n.id)) {
    seen.add(n.id);
    out.unshift(n);
    n = n.parent_id ? byId.get(n.parent_id) : null;
  }
  return out;
}

function descendantIds(node) {
  return [node.id, ...node.children.flatMap(descendantIds)];
}

function totalCount(node, counts) {
  return (counts.get(node.id) || 0) + node.children.reduce((s, c) => s + totalCount(c, counts), 0);
}

function plural(n, word, many = word + 's') {
  return `${n} ${n === 1 ? word : many}`;
}

function toast(message, type = 'info') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3200);
}

function setupNotice() {
  return `<div class="wrap block notice">
    <h2>Connect the site to Supabase</h2>
    <p>Open <code>js/config.js</code> and paste your Supabase project URL and anon key. The README explains where to find them.</p>
  </div>`;
}

/* ---------- editable site settings ---------- */

const DEFAULT_SETTINGS = {
  brand_name: 'Hindu Student Union',
  brand_sub: 'University of Peradeniya',
  hero_title: 'Every A/L resource we have, free and in one place.',
  hero_text: 'Past papers, notes, seminar recordings and useful links, collected by the Hindu Student Union, University of Peradeniya. Open to every student, no sign-up needed.',
  hero_image_path: null,
  about_title: 'About this resource centre',
  about_body: 'The Hindu Student Union of the University of Peradeniya runs seminars and support programmes for Advanced Level students. This site keeps everything from those programmes in one place, so any student can find it again, any time.\n\n## How to use it\n\nChoose your subject, then open a section to see its papers, notes and videos. PDFs open in your browser and can be downloaded. Videos play right here. You don\'t need an account.',
  contact_email: '',
  footer_note: 'Free for every A/L student. Share it with your friends.',
};

const REQUIRED_SETTINGS = ['brand_name', 'hero_title', 'about_title'];

async function loadSettings() {
  if (!sb) return { ...DEFAULT_SETTINGS };
  const { data, error } = await sb.from('site_settings').select('data').eq('id', 1).maybeSingle();
  if (error || !data) return { ...DEFAULT_SETTINGS };
  const out = { ...DEFAULT_SETTINGS, ...(data.data || {}) };
  for (const key of REQUIRED_SETTINGS) if (!String(out[key] || '').trim()) out[key] = DEFAULT_SETTINGS[key];
  return out;
}

// Plain text → safe HTML. Blank line = new paragraph, "## " = heading, links and emails become clickable.
function linkify(html) {
  return html
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(>])([\w.+-]+@[\w-]+\.[\w.-]*\w)/g, '$1<a href="mailto:$2">$2</a>');
}

function richText(text) {
  return String(text || '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b =>
    b.startsWith('## ')
      ? `<h2>${esc(b.slice(3))}</h2>`
      : `<p>${linkify(esc(b)).replace(/\n/g, '<br>')}</p>`
  ).join('');
}

function kolamSVG() {
  // A pulli kolam: dots, loops around each dot and a woven lattice, drawn once on load.
  const s = 36, n = 4, x0 = 120 - ((n - 1) * s) / 2;
  const pts = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push([x0 + i * s, x0 + j * s]);
  let i = 0;
  const dots = pts.map(([x, y]) => `<circle class="dot" style="--i:${i++}" cx="${x}" cy="${y}" r="3.4"/>`).join('');
  const loops = pts.map(([x, y], k) => `<circle class="ln" style="--i:${k}" pathLength="1" cx="${x}" cy="${y}" r="${s * 0.5}"/>`).join('');
  let lattice = '';
  for (let j = 0; j < n - 1; j++) for (let q = 0; q < n - 1; q++) {
    const cx = x0 + q * s + s / 2, cy = x0 + j * s + s / 2, h = s / 2;
    lattice += `<path class="ln" style="--i:${8 + j * 3 + q}" pathLength="1" d="M${cx} ${cy - h}L${cx + h} ${cy}L${cx} ${cy + h}L${cx - h} ${cy}Z"/>`;
  }
  const pad = s * 0.95, a = x0 - pad, w = (n - 1) * s + pad * 2;
  const frame = `<rect class="ln" style="--i:18" pathLength="1" x="${a}" y="${a}" width="${w}" height="${w}" rx="${s * 0.9}"/>`;
  const petals = [[a, a], [a + w, a], [a, a + w], [a + w, a + w]].map(([x, y], k) =>
    `<circle class="ln" style="--i:${20 + k}" pathLength="1" cx="${x + (x < 120 ? 6 : -6)}" cy="${y + (y < 120 ? 6 : -6)}" r="11"/>`).join('');
  return `<svg class="kolam" viewBox="-28 -28 296 296" aria-hidden="true"><g transform="rotate(45 120 120)">${frame}${petals}${lattice}${loops}${dots}</g></svg>`;
}

