// Public site: students browse without logging in.

const view = document.getElementById('view');
const S = { tree: { byId: new Map(), roots: [] }, counts: new Map(), settings: { ...DEFAULT_SETTINGS } };

async function load() {
  if (!sb) { view.innerHTML = setupNotice(); return; }
  view.innerHTML = '<p class="wrap block muted">Loading…</p>';
  const [cats, counts, settings] = await Promise.all([
    sb.from('categories').select('*'),
    sb.from('category_counts').select('*'),
    loadSettings(),
  ]);
  S.settings = settings;
  applyShellSettings();
  if (cats.error) { view.innerHTML = errorBlock(cats.error.message); return; }
  S.tree = buildTree(cats.data);
  S.counts = new Map((counts.data || []).map(r => [r.category_id, r.total]));
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const [page, ...rest] = parts;
  if (page === 'c' && rest[0]) renderCategory(rest[0]);
  else if (page === 's') renderSearch(decodeURIComponent(rest.join('/') || ''));
  else if (page === 'about') renderAbout();
  else renderHome();
  window.scrollTo(0, 0);
}

/* ---------- pieces ---------- */

function applyShellSettings() {
  document.querySelectorAll('[data-set]').forEach(el => {
    const v = S.settings[el.dataset.set];
    if (v) el.textContent = v;
  });
}

function siteName() { return S.settings.brand_name || 'HSU Peradeniya'; }

function heroVisual() {
  const p = S.settings.hero_image_path;
  return p ? `<img class="hero-img" src="${esc(publicFileUrl(p))}" alt="">` : kolamSVG();
}


function errorBlock(msg) {
  return `<div class="wrap block"><p class="error-text">Couldn't load resources: ${esc(msg)}. Refresh the page to try again.</p></div>`;
}

function searchForm(q = '') {
  return `<form class="search" role="search" data-search>
    <label class="sr-only" for="q">Search resources</label>
    <input id="q" type="search" name="q" value="${esc(q)}" placeholder="Search past papers, notes, videos" autocomplete="off">
    <button class="btn primary" type="submit">Search</button>
  </form>`;
}

function bindSearch() {
  view.querySelectorAll('[data-search]').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const q = f.elements.q.value.trim();
    location.hash = '#/s/' + encodeURIComponent(q);
  }));
}

function subjectList(nodes) {
  return `<ul class="subjects">${nodes.map(n => {
    const total = totalCount(n, S.counts);
    const first = n.children.slice(0, 4).map(c => esc(c.name)).join(', ');
    const more = n.children.length > 4 ? ` and ${n.children.length - 4} more` : '';
    return `<li><a href="#/c/${n.id}">
      <span class="sub-icon" aria-hidden="true">${esc(n.icon || n.name.charAt(0))}</span>
      <span class="sub-text">
        <span class="sub-name">${esc(n.name)}</span>
        ${first ? `<span class="sub-kids">${first}${more}</span>` : ''}
      </span>
      <span class="sub-count">${plural(total, 'resource')}</span>
    </a></li>`;
  }).join('')}</ul>`;
}

function resRow(r, showCategory = false) {
  const k = KINDS[r.kind] || KINDS.link;
  const yt = r.kind === 'youtube' ? youtubeId(r.url) : null;
  const href = resourceHref(r);
  const icon = yt
    ? `<div class="res-icon thumb"><img src="https://i.ytimg.com/vi/${yt}/mqdefault.jpg" alt="" loading="lazy"></div>`
    : `<div class="res-icon k-${esc(r.kind)}">${ICONS[r.kind] || ICONS.link}</div>`;

  let actions = '';
  if (yt) actions = `<button class="btn primary small" type="button" data-play="${yt}" data-title="${esc(r.title)}">Watch</button>`;
  else if (r.kind === 'file' && r.file_path) actions = `<a class="btn primary small" href="${esc(publicFileUrl(r.file_path, true))}">Download</a>`;
  else if (href) actions = `<a class="btn primary small" href="${esc(href)}" target="_blank" rel="noopener">${k.action}</a>`;
  if (r.kind === 'pdf' && r.file_path) actions += `<a class="btn small" href="${esc(publicFileUrl(r.file_path, true))}">Download</a>`;

  const cat = showCategory && r.categories
    ? `<a class="res-cat" href="#/c/${r.categories.id}">${esc(r.categories.name)}</a>` : '';

  return `<article class="res">
    ${icon}
    <div class="res-body">
      <h3>${esc(r.title)}</h3>
      ${r.description ? `<p>${esc(r.description)}</p>` : ''}
      <div class="res-meta">
        <span class="tag">${k.label}</span>
        ${r.year ? `<span class="tag">${esc(r.year)}</span>` : ''}
        ${r.medium ? `<span class="tag">${esc(r.medium)} medium</span>` : ''}
        ${cat}
      </div>
    </div>
    <div class="res-actions">${actions}</div>
  </article>`;
}

/* ---------- pages ---------- */

async function renderHome() {
  document.title = `A/L Resource Centre | ${siteName()}`;
  const roots = S.tree.roots;
  view.innerHTML = `
    <section class="hero">
      <div class="wrap hero-grid">
        <div>
          <h1>${esc(S.settings.hero_title)}</h1>
          ${S.settings.hero_text ? `<p class="lede">${esc(S.settings.hero_text)}</p>` : ''}
          ${searchForm()}
        </div>
        ${heroVisual()}
      </div>
    </section>
    <section class="wrap block">
      <h2>Subjects</h2>
      ${roots.length ? subjectList(roots) : '<p class="empty">Subjects will appear here once the union adds them.</p>'}
    </section>
    <section class="wrap block">
      <h2>Recently added</h2>
      <div class="res-list" id="recent"><p class="muted pad">Loading…</p></div>
    </section>`;
  bindSearch();

  const { data, error } = await sb.from('resources')
    .select('*, categories(id, name)')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(8);
  const box = document.getElementById('recent');
  if (!box) return;
  box.innerHTML = error ? `<p class="error-text pad">${esc(error.message)}</p>`
    : data.length ? data.map(r => resRow(r, true)).join('')
    : '<p class="empty">Nothing added yet. Check back soon.</p>';
}

async function renderCategory(id) {
  const node = S.tree.byId.get(id);
  if (!node) {
    view.innerHTML = `<div class="wrap block"><h1>This section doesn't exist</h1><p>It may have been moved or removed. <a href="#/">Go back to all subjects</a>.</p></div>`;
    return;
  }
  const trail = pathTo(S.tree.byId, id);
  document.title = `${node.name} | ${siteName()}`;
  view.innerHTML = `
    <section class="cat-head"><div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="#/">Subjects</a>
        ${trail.map((t, i) => i === trail.length - 1
          ? `<span aria-current="page">${esc(t.name)}</span>`
          : `<a href="#/c/${t.id}">${esc(t.name)}</a>`).join('')}
      </nav>
      <h1>${node.icon ? `<span class="h-icon" aria-hidden="true">${esc(node.icon)}</span>` : ''}${esc(node.name)}</h1>
      ${node.description ? `<p class="lede">${esc(node.description)}</p>` : ''}
    </div></section>
    <div class="wrap">
      ${node.children.length ? `<section class="block"><h2>Sections</h2>${subjectList(node.children)}</section>` : ''}
      <section class="block" id="resBlock">
        <h2>Resources</h2>
        <div class="filters" id="filters"></div>
        <div class="res-list" id="resList"><p class="muted pad">Loading…</p></div>
      </section>
    </div>`;

  const { data, error } = await sb.from('resources')
    .select('*')
    .eq('category_id', id)
    .eq('is_published', true)
    .order('sort_order')
    .order('created_at', { ascending: false });
  if (location.hash !== `#/c/${id}`) return;
  const list = document.getElementById('resList');
  if (error) { list.innerHTML = `<p class="error-text pad">${esc(error.message)}</p>`; return; }
  if (!data.length) {
    if (node.children.length) document.getElementById('resBlock').remove();
    else list.innerHTML = '<p class="empty">No resources here yet. The union adds new material regularly.</p>';
    return;
  }
  setupFilters(data);
}

function setupFilters(items) {
  const state = { kind: 'all', medium: '' };
  const kinds = [...new Set(items.map(r => r.kind))];
  const mediums = [...new Set(items.map(r => r.medium).filter(Boolean))];
  const filters = document.getElementById('filters');
  const list = document.getElementById('resList');

  const draw = () => {
    const shown = items.filter(r => (state.kind === 'all' || r.kind === state.kind) && (!state.medium || r.medium === state.medium));
    list.innerHTML = shown.length ? shown.map(r => resRow(r)).join('') : '<p class="empty">Nothing matches these filters.</p>';
  };

  if (kinds.length > 1 || mediums.length > 1) {
    filters.innerHTML = `
      <div class="chips" role="group" aria-label="Type">
        <button class="chip" type="button" data-kind="all" aria-pressed="true">All (${items.length})</button>
        ${kinds.map(k => `<button class="chip" type="button" data-kind="${k}" aria-pressed="false">${KINDS[k]?.label || k} (${items.filter(r => r.kind === k).length})</button>`).join('')}
      </div>
      ${mediums.length > 1 ? `<label class="medium-select">Medium
        <select id="mediumSel"><option value="">All</option>${mediums.map(m => `<option>${esc(m)}</option>`).join('')}</select>
      </label>` : ''}`;
    filters.addEventListener('click', e => {
      const b = e.target.closest('[data-kind]');
      if (!b) return;
      state.kind = b.dataset.kind;
      filters.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    });
    const sel = document.getElementById('mediumSel');
    if (sel) sel.addEventListener('change', () => { state.medium = sel.value; draw(); });
  } else {
    filters.remove();
  }
  draw();
}

async function renderSearch(q) {
  document.title = `Search | ${siteName()}`;
  const clean = q.replace(/[%,()*\\"]/g, ' ').replace(/\s+/g, ' ').trim();
  view.innerHTML = `
    <section class="cat-head"><div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Subjects</a><span aria-current="page">Search</span></nav>
      <h1>Search</h1>
      ${searchForm(q)}
    </div></section>
    <div class="wrap block">
      <div id="catHits"></div>
      <div id="resHits"></div>
    </div>`;
  bindSearch();
  const resHits = document.getElementById('resHits');
  if (!clean) { resHits.innerHTML = '<p class="empty">Type a word like “organic”, “2023” or “unit 5” to search.</p>'; return; }

  const lower = clean.toLowerCase();
  const cats = [...S.tree.byId.values()].filter(n => n.name.toLowerCase().includes(lower)).slice(0, 12);
  if (cats.length) {
    document.getElementById('catHits').innerHTML = `<h2>Sections</h2><ul class="cat-hits">${cats.map(n =>
      `<li><a href="#/c/${n.id}">${pathTo(S.tree.byId, n.id).map(p => esc(p.name)).join(' / ')}</a></li>`).join('')}</ul>`;
  }

  resHits.innerHTML = '<p class="muted">Searching…</p>';
  const yearOnly = /^\d{4}$/.test(clean);
  let query = sb.from('resources').select('*, categories(id, name)').eq('is_published', true);
  query = yearOnly
    ? query.or(`year.eq.${clean},title.ilike.%${clean}%`)
    : query.or(`title.ilike.%${clean}%,description.ilike.%${clean}%`);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(60);
  if (!document.body.contains(resHits)) return;
  if (error) { resHits.innerHTML = `<p class="error-text">${esc(error.message)}</p>`; return; }
  resHits.innerHTML = `<h2>${plural(data.length, 'resource')} found</h2>` + (data.length
    ? `<div class="res-list">${data.map(r => resRow(r, true)).join('')}</div>`
    : '<p class="empty">No resources match that. Try a shorter word, or browse the subjects.</p>');
}

function renderAbout() {
  const st = S.settings;
  document.title = `About | ${siteName()}`;
  view.innerHTML = `
    <section class="cat-head"><div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Subjects</a><span aria-current="page">About</span></nav>
      <h1>${esc(st.about_title)}</h1>
    </div></section>
    <div class="wrap block prose">
      ${richText(st.about_body)}
      ${st.contact_email ? `<h2>Contact us</h2><p>Have a paper to share or found a broken link? Email <a href="mailto:${esc(st.contact_email)}">${esc(st.contact_email)}</a>.</p>` : ''}
    </div>`;
}

/* ---------- video player ---------- */

const player = document.getElementById('player');
const frame = player.querySelector('iframe');
document.addEventListener('click', e => {
  const b = e.target.closest('[data-play]');
  if (!b) return;
  document.getElementById('playerTitle').textContent = b.dataset.title || 'Video';
  frame.src = `https://www.youtube-nocookie.com/embed/${b.dataset.play}?autoplay=1&rel=0`;
  player.showModal();
});
document.getElementById('playerClose').addEventListener('click', () => player.close());
player.addEventListener('click', e => { if (e.target === player) player.close(); });
player.addEventListener('close', () => { frame.src = 'about:blank'; });

load();
