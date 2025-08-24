import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const INDEX_FILE = path.join(DATA_DIR, 'files-index.json');

async function atomicWrite(filePath, data) {
  const tmp = filePath + '.' + Date.now() + '.tmp';
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, filePath);
}

export async function ensureIndex() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(INDEX_FILE); }
  catch { await fs.writeFile(INDEX_FILE, JSON.stringify({ count: 0, items: [] }, null, 2)); }
}

function normalize(meta) {
  const q = [meta.filename, meta.originalname, meta.mimetype, meta.ext, (meta.tags||[]).join(' ')].join(' ').toLowerCase();
  return { ...meta, _q: q };
}

export async function addToIndex(meta) {
  await ensureIndex();
  const raw = await fs.readFile(INDEX_FILE, 'utf-8');
  const idx = JSON.parse(raw);
  const item = normalize(meta);
  const pos = idx.items.findIndex(i => i.id === item.id);
  if (pos === -1) idx.items.push(item); else idx.items[pos] = item;
  idx.count = idx.items.length;
  await atomicWrite(INDEX_FILE, JSON.stringify(idx, null, 2));
  return item;
}

export async function getFromIndex(id) {
  await ensureIndex();
  const raw = await fs.readFile(INDEX_FILE, 'utf-8');
  const idx = JSON.parse(raw);
  return idx.items.find(i => i.id === id) || null;
}

export async function deleteFromIndex(id) {
  await ensureIndex();
  const raw = await fs.readFile(INDEX_FILE, 'utf-8');
  const idx = JSON.parse(raw);
  const before = idx.items.length;
  idx.items = idx.items.filter(i => i.id !== id);
  idx.count = idx.items.length;
  await atomicWrite(INDEX_FILE, JSON.stringify(idx, null, 2));
  return idx.items.length < before;
}

export async function listFiles({ q, mime, ext, tag, sort = 'created_at', page = 1, limit = 20 }) {
  await ensureIndex();
  const raw = await fs.readFile(INDEX_FILE, 'utf-8');
  let items = JSON.parse(raw).items;

  if (q) {
    const needle = String(q).toLowerCase();
    items = items.filter(i => i._q.includes(needle));
  }
  if (mime) items = items.filter(i => (i.mimetype||'').toLowerCase() === String(mime).toLowerCase());
  if (ext) items = items.filter(i => (i.ext||'').toLowerCase() === String(ext).toLowerCase());
  if (tag) items = items.filter(i => (i.tags||[]).map(t=>t.toLowerCase()).includes(String(tag).toLowerCase()));

  const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
  const sorter = {
    filename: (a,b) => collator.compare(a.filename||'', b.filename||''),
    size: (a,b) => (a.size||0) - (b.size||0),
    created_at: (a,b) => new Date(a.created_at) - new Date(b.created_at),
  }[sort] || ((a,b)=>0);
  items = items.slice().sort(sorter);

  const total = items.length;
  const start = (page - 1) * limit;
  const paged = items.slice(start, start + limit);
  return { total, page, limit, items: paged };
}
