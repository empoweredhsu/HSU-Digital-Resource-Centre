// Admin panel: create / rename / move / delete categories and resources.

const $ = s => document.querySelector(s);
const A = {
  tree: { byId: new Map(), roots: [] },
  counts: new Map(),
  selected: localStorage.getItem('hsu.selected') || null,
  open: new Set(JSON.parse(localStorage.getItem('hsu.open') || '[]')),
  resources: [],
  editingCat: null,
  editingRes: null,
  mode: null,            // null = categories, 'settings' = site text and picture
  settingsImage: null,
  pendingImage: undefined,
};

/* ---------------- auth ---------------- */

function showLogin(msg = '') {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#loginMsg').textContent = msg;
  $('#loginMsg').classList.toggle('error', Boolean(msg));
}

async function boot() {
  if (!sb) {
    showLogin('Add your Supabase URL and key to js/config.js first.');
    $('#loginForm button').disabled = true;
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (session) enter(session.user); else showLogin();
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  const { data, error } = await sb.auth.signInWithPassword({
    email: f.elements.email.value.trim(),
    password: f.elements.password.value,
  });
  btn.disabled = false;
  btn.textContent = 'Sign in';
  if (error) { showLogin(error.message === 'Invalid login credentials' ? 'Email or password is wrong.' : error.message); return; }
  enter(data.user);
});

async function enter(user) {
  const { data: ok, error } = await sb.rpc('is_admin');
  if (error || !ok) {
    await sb.auth.signOut();
    showLogin('This account is not an admin. Ask the site owner to add your email to the admins table.');
    return;
  }
  $('#who').textContent = user.email;
  $('#login').hidden = true;
  $('#app').hidden = false;
  await refresh();
}

$('#logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  showLogin('You have signed out.');
  $('#loginMsg').classList.remove('error');
});

/* ---------------- data ---------------- */

async function refresh() {
  const [cats, counts] = await Promise.all([
    sb.from('categories').select('*'),
    sb.from('category_counts').select('*'),
  ]);
  if (cats.error) { toast(cats.error.message, 'error'); return; }
  A.tree = buildTree(cats.data);
  A.counts = new Map((counts.data || []).map(r => [r.category_id, r.total]));
  if (A.selected && !A.tree.byId.has(A.selected)) select(null, false);
  renderTree();
  await renderPanel();
}

function select(id, render = true) {
  A.mode = null;
  A.selected = id;
  if (id) localStorage.setItem('hsu.selected', id); else localStorage.removeItem('hsu.selected');
  if (id) pathTo(A.tree.byId, id).slice(0, -1).forEach(p => A.open.add(p.id));
  saveOpen();
  if (render) { renderTree(); renderPanel(); }
}

function saveOpen() { localStorage.setItem('hsu.open', JSON.stringify([...A.open])); }

function siblingsOf(node) {
  return node.parent_id ? (A.tree.byId.get(node.parent_id)?.children || []) : A.tree.roots;
}

/* ---------------- tree ---------------- */

function renderTree() {
  const ul = (nodes, depth) => `<ul>${nodes.map(n => {
    const has = n.children.length > 0;
    const open = A.open.has(n.id);
    return `<li>
      <div class="node${n.id === A.selected ? ' sel' : ''}" style="--d:${depth}">
        ${has
          ? `<button class="caret${open ? ' open' : ''}" type="button" data-toggle="${n.id}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(n.name)}">▸</button>`
          : '<span class="caret-sp"></span>'}
        <button class="node-name" type="button" data-select="${n.id}">${n.icon ? esc(n.icon) + ' ' : ''}${esc(n.name)}</button>
        <span class="node-count">${totalCount(n, A.counts)}</span>
      </div>
      ${has && open ? ul(n.children, depth + 1) : ''}
    </li>`;
  }).join('')}</ul>`;
  $('#tree').innerHTML = A.tree.roots.length ? ul(A.tree.roots, 0) : '<p class="muted small">No subjects yet. Use “New subject” to add Physics, Chemistry and so on.</p>';
}

$('#tree').addEventListener('click', e => {
  const t = e.target.closest('[data-toggle]');
  if (t) {
    const id = t.dataset.toggle;
    A.open.has(id) ? A.open.delete(id) : A.open.add(id);
    saveOpen();
    renderTree();
    return;
  }
  const s = e.target.closest('[data-select]');
  if (s) {
    A.open.add(s.dataset.select);
    select(s.dataset.select);
  }
});

/* ---------------- panel ---------------- */

async function renderPanel() {
  $('#settingsLink').classList.toggle('active', A.mode === 'settings');
  if (A.mode === 'settings') return renderSettings();
  const panel = $('#panel');
  const node = A.selected ? A.tree.byId.get(A.selected) : null;

  if (!node) {
    const roots = A.tree.roots;
    const total = [...A.counts.values()].reduce((a, b) => a + b, 0);
    panel.innerHTML = `
      <div class="panel-head">
        <div>
          <h1>All subjects</h1>
          <p class="muted">${plural(roots.length, 'subject')}, ${plural(A.tree.byId.size, 'category', 'categories')} in total, ${plural(total, 'resource')}.</p>
        </div>
        <button class="btn primary" type="button" data-act="add-root">New subject</button>
      </div>
      <section class="sec">
        ${roots.length ? itemsForCats(roots) : '<p class="empty">Start by adding a subject such as Physics, Chemistry, Biology or Combined Maths. Then open it to add sections and resources.</p>'}
      </section>`;
    return;
  }

  const trail = pathTo(A.tree.byId, node.id);
  panel.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb">
      <button class="link-btn" type="button" data-act="home">All subjects</button>
      ${trail.map((t, i) => i === trail.length - 1
        ? `<span aria-current="page">${esc(t.name)}</span>`
        : `<button class="link-btn" type="button" data-select="${t.id}">${esc(t.name)}</button>`).join('')}
    </nav>
    <div class="panel-head">
      <div>
        <h1>${node.icon ? esc(node.icon) + ' ' : ''}${esc(node.name)}</h1>
        ${node.description ? `<p class="muted">${esc(node.description)}</p>` : ''}
      </div>
      <div class="row">
        <button class="btn" type="button" data-act="edit-cat">Rename or move</button>
        <button class="btn danger" type="button" data-act="del-cat">Delete</button>
      </div>
    </div>

    <section class="sec">
      <div class="sec-head">
        <h2>Subcategories</h2>
        <button class="btn small" type="button" data-act="add-sub">Add subcategory</button>
      </div>
      ${node.children.length ? itemsForCats(node.children) : '<p class="empty small">No subcategories. Add one to split this into units, topics or paper types.</p>'}
    </section>

    <section class="sec">
      <div class="sec-head">
        <h2>Resources</h2>
        <button class="btn small primary" type="button" data-act="add-res">Add resource</button>
      </div>
      <div id="resItems"><p class="muted">Loading…</p></div>
    </section>`;

  const { data, error } = await sb.from('resources').select('*')
    .eq('category_id', node.id)
    .order('sort_order')
    .order('created_at', { ascending: false });
  if (A.selected !== node.id) return;
  const box = $('#resItems');
  if (error) { box.innerHTML = `<p class="error-text">${esc(error.message)}</p>`; return; }
  A.resources = data;
  box.innerHTML = data.length ? itemsForRes(data) : '<p class="empty small">No resources here yet. Use “Add resource” to upload PDFs or add links.</p>';
}

function itemsForCats(list) {
  return `<ul class="items">${list.map((n, i) => `
    <li class="item">
      <span class="item-icon">${esc(n.icon || n.name.charAt(0))}</span>
      <div class="item-main">
        <button class="link-btn item-title" type="button" data-select="${n.id}">${esc(n.name)}</button>
        <span class="item-sub">${n.children.length ? plural(n.children.length, 'subcategory', 'subcategories') + ', ' : ''}${plural(totalCount(n, A.counts), 'resource')}</span>
      </div>
      <div class="row tight">
        <button class="icon-btn" type="button" data-act="cat-up" data-id="${n.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(n.name)} up">↑</button>
        <button class="icon-btn" type="button" data-act="cat-down" data-id="${n.id}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(n.name)} down">↓</button>
      </div>
    </li>`).join('')}</ul>`;
}

function itemsForRes(list) {
  return `<ul class="items">${list.map((r, i) => {
    const href = resourceHref(r);
    const meta = [KINDS[r.kind]?.label, r.year, r.medium && `${r.medium} medium`].filter(Boolean).map(m => `<span class="tag">${esc(m)}</span>`).join('');
    return `<li class="item">
      <span class="item-icon res-icon k-${esc(r.kind)}">${ICONS[r.kind] || ICONS.link}</span>
      <div class="item-main">
        ${href ? `<a class="item-title" href="${esc(href)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : `<span class="item-title">${esc(r.title)}</span>`}
        <span class="res-meta">${meta}${r.is_published ? '' : '<span class="tag hidden-tag">Hidden</span>'}</span>
      </div>
      <div class="row tight">
        <button class="icon-btn" type="button" data-act="res-up" data-id="${r.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(r.title)} up">↑</button>
        <button class="icon-btn" type="button" data-act="res-down" data-id="${r.id}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(r.title)} down">↓</button>
        <button class="btn small" type="button" data-act="edit-res" data-id="${r.id}">Edit</button>
        <button class="btn small danger" type="button" data-act="del-res" data-id="${r.id}">Delete</button>
      </div>
    </li>`;
  }).join('')}</ul>`;
}

/* ---------------- actions ---------------- */

document.addEventListener('click', async e => {
  const sel = e.target.closest('#panel [data-select]');
  if (sel) { select(sel.dataset.select); return; }

  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const node = A.selected ? A.tree.byId.get(A.selected) : null;

  switch (act) {
    case 'home': select(null); break;
    case 'settings':
      A.mode = 'settings';
      A.selected = null;
      localStorage.removeItem('hsu.selected');
      renderTree();
      renderPanel();
      break;
    case 'add-root': openCatDialog(null, null); break;
    case 'add-sub': openCatDialog(null, node?.id || null); break;
    case 'edit-cat': if (node) openCatDialog(node); break;
    case 'del-cat': if (node) deleteCategory(node); break;
    case 'add-res': openResDialog(null); break;
    case 'edit-res': openResDialog(A.resources.find(r => r.id === b.dataset.id)); break;
    case 'del-res': deleteResource(A.resources.find(r => r.id === b.dataset.id)); break;
    case 'cat-up':
    case 'cat-down': {
      const n = A.tree.byId.get(b.dataset.id);
      const sibs = siblingsOf(n);
      await reorder('categories', sibs, sibs.indexOf(n), act === 'cat-up' ? -1 : 1);
      break;
    }
    case 'res-up':
    case 'res-down': {
      const idx = A.resources.findIndex(r => r.id === b.dataset.id);
      await reorder('resources', A.resources, idx, act === 'res-up' ? -1 : 1);
      break;
    }
  }
});

async function reorder(table, list, idx, dir) {
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= list.length) return;
  const arr = list.slice();
  [arr[idx], arr[j]] = [arr[j], arr[idx]];
  const jobs = arr.map((item, i) => item.sort_order === i ? null : sb.from(table).update({ sort_order: i }).eq('id', item.id)).filter(Boolean);
  const results = await Promise.all(jobs);
  const failed = results.find(r => r.error);
  if (failed) toast(`Couldn't reorder: ${failed.error.message}`, 'error');
  await refresh();
}

/* ---------------- category dialog ---------------- */

function categoryOptions({ exclude = new Set(), selected = '', topLevel = true } = {}) {
  const out = topLevel ? [`<option value="">Top level (a main subject)</option>`] : [];
  const walk = (nodes, d) => nodes.forEach(n => {
    if (exclude.has(n.id)) return;
    out.push(`<option value="${n.id}"${n.id === selected ? ' selected' : ''}>${'\u2003'.repeat(d)}${esc(n.icon ? n.icon + ' ' : '')}${esc(n.name)}</option>`);
    walk(n.children, d + 1);
  });
  walk(A.tree.roots, 0);
  return out.join('');
}

function openCatDialog(node, parentId) {
  A.editingCat = node;
  const f = $('#catForm');
  f.reset();
  $('#catMsg').textContent = '';
  const el = f.elements;
  if (node) {
    $('#catDlgTitle').textContent = `Edit “${node.name}”`;
    el.name.value = node.name;
    el.icon.value = node.icon || '';
    el.description.value = node.description || '';
    el.parent_id.innerHTML = categoryOptions({ exclude: new Set(descendantIds(node)), selected: node.parent_id || '' });
  } else {
    const parent = parentId ? A.tree.byId.get(parentId) : null;
    $('#catDlgTitle').textContent = parent ? `New subcategory in “${parent.name}”` : 'New subject';
    el.parent_id.innerHTML = categoryOptions({ selected: parentId || '' });
  }
  $('#catDlg').showModal();
  el.name.focus();
}

$('#catForm').addEventListener('submit', async e => {
  e.preventDefault();
  const el = e.target.elements;
  const btn = e.target.querySelector('button[type=submit]');
  const payload = {
    name: el.name.value.trim(),
    icon: el.icon.value.trim() || null,
    description: el.description.value.trim() || null,
    parent_id: el.parent_id.value || null,
  };
  if (!payload.name) { $('#catMsg').textContent = 'Enter a name.'; return; }
  btn.disabled = true;

  const ed = A.editingCat;
  const newSiblings = payload.parent_id ? (A.tree.byId.get(payload.parent_id)?.children || []) : A.tree.roots;
  const nextOrder = newSiblings.reduce((m, n) => Math.max(m, n.sort_order + 1), 0);
  let res;
  if (ed) {
    if ((ed.parent_id || null) !== payload.parent_id) payload.sort_order = nextOrder;
    res = await sb.from('categories').update(payload).eq('id', ed.id).select().single();
  } else {
    payload.sort_order = nextOrder;
    res = await sb.from('categories').insert(payload).select().single();
  }
  btn.disabled = false;
  if (res.error) { $('#catMsg').textContent = res.error.message; $('#catMsg').classList.add('error'); return; }

  $('#catDlg').close();
  toast(ed ? 'Category saved' : `Added “${payload.name}”`);
  if (payload.parent_id) A.open.add(payload.parent_id);
  saveOpen();
  if (!ed && !payload.parent_id) A.selected = res.data.id;
  await refresh();
  if (!ed && !payload.parent_id) select(res.data.id);
});

async function deleteCategory(node) {
  const ids = descendantIds(node);
  const { count } = await sb.from('resources').select('id', { count: 'exact', head: true }).in('category_id', ids);
  const subs = ids.length - 1;
  const parts = [subs && plural(subs, 'subcategory', 'subcategories'), count && plural(count, 'resource')].filter(Boolean);
  const msg = `Delete “${node.name}”${parts.length ? ` and everything inside it (${parts.join(' and ')})` : ''}? Uploaded files are deleted too. This can't be undone.`;
  if (!confirm(msg)) return;

  const { data: files, error: fErr } = await sb.from('resources').select('file_path').in('category_id', ids).not('file_path', 'is', null);
  if (fErr) { toast(fErr.message, 'error'); return; }
  const paths = files.map(f => f.file_path);
  for (let i = 0; i < paths.length; i += 900) {
    const { error } = await sb.storage.from(BUCKET).remove(paths.slice(i, i + 900));
    if (error) { toast(`Couldn't delete files: ${error.message}`, 'error'); return; }
  }
  const { error } = await sb.from('categories').delete().eq('id', node.id);
  if (error) { toast(error.message, 'error'); return; }
  toast(`Deleted “${node.name}”`);
  A.selected = node.parent_id || null;
  if (A.selected) localStorage.setItem('hsu.selected', A.selected); else localStorage.removeItem('hsu.selected');
  await refresh();
}

/* ---------------- resource dialog ---------------- */

const resForm = $('#resForm');
const rEl = resForm.elements;

function currentKind() { return resForm.querySelector('input[name=kind]:checked').value; }

function updateResFields() {
  const kind = currentKind();
  const upload = KINDS[kind].upload;
  const ed = A.editingRes;
  $('#fileField').hidden = !upload;
  $('#urlField').hidden = upload;
  rEl.url.required = !upload;

  const fileInput = rEl.files;
  fileInput.accept = kind === 'pdf' ? '.pdf,application/pdf' : '';
  fileInput.multiple = !ed;
  if (ed && ed.file_path && upload) {
    $('#fileHint').textContent = `Current file: ${ed.file_path.split('/').pop().replace(/^\d+-\w+-/, '')}. Choose a new file only if you want to replace it.`;
  } else if (!ed) {
    $('#fileHint').textContent = `You can select several files at once; each one becomes its own resource named after the file. Max ${MAX_UPLOAD_MB} MB per file. For bigger files, use a Google Drive link.`;
  } else {
    $('#fileHint').textContent = `Max ${MAX_UPLOAD_MB} MB.`;
  }
  $('#urlHint').textContent = {
    drive: 'In Google Drive, set sharing to “Anyone with the link can view”, then copy the link.',
    youtube: 'Paste the video link, e.g. https://youtu.be/… or https://www.youtube.com/watch?v=…',
    link: 'Any website students should visit.',
  }[kind] || '';

  const many = upload && !ed && fileInput.files.length > 1;
  $('#titleField').hidden = many;
  rEl.title.required = !upload || Boolean(ed);
}

resForm.addEventListener('change', e => {
  if (e.target.name === 'kind' || e.target.name === 'files') updateResFields();
});

function openResDialog(r) {
  A.editingRes = r || null;
  resForm.reset();
  $('#resMsg').textContent = '';
  $('#resMsg').classList.remove('error');
  rEl.category_id.innerHTML = categoryOptions({ topLevel: false, selected: r ? r.category_id : A.selected });
  if (r) {
    $('#resDlgTitle').textContent = 'Edit resource';
    resForm.querySelector(`input[name=kind][value="${r.kind}"]`).checked = true;
    rEl.url.value = r.url || '';
    rEl.title.value = r.title;
    rEl.description.value = r.description || '';
    rEl.year.value = r.year || '';
    rEl.medium.value = r.medium || '';
    rEl.is_published.checked = r.is_published;
  } else {
    $('#resDlgTitle').textContent = 'Add resource';
  }
  updateResFields();
  $('#resDlg').showModal();
}

function resMsg(text, isError = false) {
  $('#resMsg').textContent = text;
  $('#resMsg').classList.toggle('error', isError);
}

async function uploadFile(file, categoryId) {
  const clean = file.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = `${categoryId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${clean}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(`Upload failed for ${file.name}: ${error.message}`);
  return path;
}

async function nextResourceOrder(categoryId) {
  const { data } = await sb.from('resources').select('sort_order').eq('category_id', categoryId).order('sort_order', { ascending: false }).limit(1);
  return data && data.length ? data[0].sort_order + 1 : 0;
}

resForm.addEventListener('submit', async e => {
  e.preventDefault();
  const kind = currentKind();
  const upload = KINDS[kind].upload;
  const ed = A.editingRes;
  const files = [...rEl.files.files];
  const title = rEl.title.value.trim();
  const base = {
    kind,
    description: rEl.description.value.trim() || null,
    year: rEl.year.value ? parseInt(rEl.year.value, 10) : null,
    medium: rEl.medium.value || null,
    category_id: rEl.category_id.value,
    is_published: rEl.is_published.checked,
  };
  if (!base.category_id) { resMsg('Choose a category.', true); return; }

  const save = $('#resSave');
  save.disabled = true;
  try {
    const tooBig = files.find(f => f.size > MAX_UPLOAD_MB * 1024 * 1024);
    if (upload && tooBig) throw new Error(`${tooBig.name} is larger than ${MAX_UPLOAD_MB} MB. Upload it to Google Drive and add it as a Drive link instead.`);

    const moved = ed && ed.category_id !== base.category_id;
    if (moved) base.sort_order = await nextResourceOrder(base.category_id);

    if (upload) {
      if (ed) {
        if (!files.length && !ed.file_path) throw new Error('Choose a file to upload.');
        let file_path = ed.file_path;
        if (files.length) { resMsg('Uploading…'); file_path = await uploadFile(files[0], base.category_id); }
        const { error } = await sb.from('resources').update({ ...base, title: title || stripExt(files[0]?.name) || ed.title, url: null, file_path }).eq('id', ed.id);
        if (error) throw error;
        if (files.length && ed.file_path) await sb.storage.from(BUCKET).remove([ed.file_path]);
      } else {
        if (!files.length) throw new Error('Choose at least one file.');
        let order = await nextResourceOrder(base.category_id);
        for (const [i, file] of files.entries()) {
          resMsg(files.length > 1 ? `Uploading ${i + 1} of ${files.length}: ${file.name}` : 'Uploading…');
          const file_path = await uploadFile(file, base.category_id);
          const t = files.length === 1 && title ? title : stripExt(file.name);
          const { error } = await sb.from('resources').insert({ ...base, title: t, file_path, url: null, sort_order: order++ });
          if (error) { await sb.storage.from(BUCKET).remove([file_path]); throw error; }
        }
      }
    } else {
      const url = safeUrl(rEl.url.value);
      if (!url) throw new Error('Enter a full link starting with https://');
      if (kind === 'youtube' && !youtubeId(url)) throw new Error('That isn\'t a YouTube video link. Copy the link from the video\'s Share button.');
      if (!title) throw new Error('Enter a title.');
      const row = { ...base, title, url, file_path: null };
      if (ed) {
        const { error } = await sb.from('resources').update(row).eq('id', ed.id);
        if (error) throw error;
        if (ed.file_path) await sb.storage.from(BUCKET).remove([ed.file_path]);
      } else {
        row.sort_order = await nextResourceOrder(base.category_id);
        const { error } = await sb.from('resources').insert(row);
        if (error) throw error;
      }
    }

    $('#resDlg').close();
    toast(ed ? 'Resource saved' : (upload && files.length > 1 ? `Added ${files.length} resources` : 'Resource added'));
    await refresh();
  } catch (err) {
    resMsg(err.message || String(err), true);
  } finally {
    save.disabled = false;
  }
});

async function deleteResource(r) {
  if (!r) return;
  if (!confirm(`Delete “${r.title}”?${r.file_path ? ' The uploaded file is deleted too.' : ''} This can't be undone.`)) return;
  if (r.file_path) {
    const { error } = await sb.storage.from(BUCKET).remove([r.file_path]);
    if (error) { toast(`Couldn't delete the file: ${error.message}`, 'error'); return; }
  }
  const { error } = await sb.from('resources').delete().eq('id', r.id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Resource deleted');
  await refresh();
}

/* ---------------- site text and picture ---------------- */

const SETTING_FIELDS = ['brand_name', 'brand_sub', 'footer_note', 'hero_title', 'hero_text', 'about_title', 'about_body', 'contact_email'];
const MAX_IMAGE_MB = 5;

async function renderSettings() {
  const panel = $('#panel');
  panel.innerHTML = '<p class="muted">Loading…</p>';
  const { data, error } = await sb.from('site_settings').select('data').eq('id', 1).maybeSingle();
  if (A.mode !== 'settings') return;
  if (error) {
    panel.innerHTML = `<h1>Site text and picture</h1>
      <p class="error-text">Couldn't load the settings: ${esc(error.message)}</p>
      <p>If you set up the database before this update, run <code>supabase/update-1-site-settings.sql</code> once in the Supabase SQL Editor, then reload this page.</p>`;
    return;
  }
  const st = { ...DEFAULT_SETTINGS, ...(data?.data || {}) };
  A.settingsImage = st.hero_image_path || null;
  A.pendingImage = undefined;

  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h1>Site text and picture</h1>
        <p class="muted">Change the words and the home page picture students see. Changes appear on the site as soon as you save.</p>
      </div>
    </div>
    <form id="setForm" class="stack settings-form">
      <section class="sec">
        <h2>Home page</h2>
        <label>Main title <textarea name="hero_title" rows="2" maxlength="160" required></textarea></label>
        <label>Text under the title <span class="muted">(optional)</span> <textarea name="hero_text" rows="3" maxlength="600"></textarea></label>
        <div class="hero-pic">
          <div class="hero-pic-preview" id="heroPreview"></div>
          <div>
            <p class="field-label">Picture beside the title</p>
            <p class="hint flat">A PNG with a transparent background looks best on the yellow, like your HSU logo. JPG and WebP work too. Max ${MAX_IMAGE_MB} MB. With no picture, the kolam pattern shows.</p>
            <div class="row">
              <label class="btn small file-btn">Choose picture<input type="file" name="hero_image" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
              <button class="btn small" type="button" id="heroRemove">Use kolam pattern</button>
            </div>
          </div>
        </div>
      </section>

      <section class="sec">
        <h2>About page</h2>
        <label>Title <input name="about_title" maxlength="120" required></label>
        <label>Text <textarea name="about_body" rows="10"></textarea></label>
        <p class="hint">Leave a blank line to start a new paragraph. Start a line with ## and a space to make a heading, like “## How to use it”. Links and email addresses become clickable.</p>
        <label>Contact email <span class="muted">(optional, shown at the end of the About page)</span> <input name="contact_email" type="email"></label>
      </section>

      <section class="sec">
        <h2>Top bar and footer</h2>
        <div class="two">
          <label>Name <input name="brand_name" maxlength="80" required></label>
          <label>Second line <input name="brand_sub" maxlength="120"></label>
        </div>
        <label>Footer note <input name="footer_note" maxlength="200"></label>
      </section>

      <div class="save-bar">
        <p class="form-msg" id="setMsg" role="status"></p>
        <button class="btn" type="button" id="setReset">Restore original text</button>
        <button class="btn primary" type="submit" id="setSave">Save changes</button>
      </div>
    </form>`;

  const f = $('#setForm');
  SETTING_FIELDS.forEach(k => { f.elements[k].value = st[k] ?? ''; });
  drawHeroPreview();

  f.elements.hero_image.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) { setMsg(`That picture is larger than ${MAX_IMAGE_MB} MB. Choose a smaller one.`, true); e.target.value = ''; return; }
    A.pendingImage = file;
    setMsg('New picture chosen. Save changes to put it on the site.');
    drawHeroPreview();
  });
  $('#heroRemove').addEventListener('click', () => {
    A.pendingImage = null;
    f.elements.hero_image.value = '';
    setMsg('Kolam pattern chosen. Save changes to put it on the site.');
    drawHeroPreview();
  });
  $('#setReset').addEventListener('click', () => {
    if (!confirm('Put back the original text in every box? Your picture stays. Nothing changes on the site until you save.')) return;
    SETTING_FIELDS.forEach(k => { f.elements[k].value = DEFAULT_SETTINGS[k] ?? ''; });
    setMsg('Original text restored in the form. Save changes to apply it.');
  });
  f.addEventListener('submit', saveSettings);
}

function setMsg(text, isError = false) {
  const m = $('#setMsg');
  if (!m) return;
  m.textContent = text;
  m.classList.toggle('error', isError);
}

function drawHeroPreview() {
  const box = $('#heroPreview');
  if (!box) return;
  let src = null;
  if (A.pendingImage instanceof File) src = URL.createObjectURL(A.pendingImage);
  else if (A.pendingImage === undefined && A.settingsImage) src = publicFileUrl(A.settingsImage);
  box.innerHTML = src ? `<img src="${esc(src)}" alt="Home page picture preview">` : kolamSVG();
  $('#heroRemove').hidden = !src;
}

async function saveSettings(e) {
  e.preventDefault();
  const f = e.target;
  const data = {};
  SETTING_FIELDS.forEach(k => { data[k] = f.elements[k].value.trim(); });
  for (const k of REQUIRED_SETTINGS) if (!data[k]) { setMsg('Fill in the name and both titles.', true); return; }

  const btn = $('#setSave');
  btn.disabled = true;
  let newPath = null;
  try {
    let path = A.settingsImage;
    if (A.pendingImage instanceof File) {
      setMsg('Uploading picture…');
      newPath = await uploadFile(A.pendingImage, 'site');
      path = newPath;
    } else if (A.pendingImage === null) {
      path = null;
    }
    data.hero_image_path = path;

    const { error } = await sb.from('site_settings').upsert({ id: 1, data, updated_at: new Date().toISOString() });
    if (error) throw error;

    if (A.settingsImage && A.settingsImage !== path) await sb.storage.from(BUCKET).remove([A.settingsImage]);
    A.settingsImage = path;
    A.pendingImage = undefined;
    f.elements.hero_image.value = '';
    drawHeroPreview();
    setMsg('');
    toast('Changes saved');
  } catch (err) {
    if (newPath) await sb.storage.from(BUCKET).remove([newPath]);
    setMsg(err.message || String(err), true);
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- dialogs ---------------- */

document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

boot();
