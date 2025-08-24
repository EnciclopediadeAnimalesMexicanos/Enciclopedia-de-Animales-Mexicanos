import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const ANIMALS_DIR = path.join(DATA_DIR, 'animals');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');

async function ensureDirs() {
  await fs.mkdir(ANIMALS_DIR, { recursive: true });
  try { await fs.access(INDEX_FILE); }
  catch { await fs.writeFile(INDEX_FILE, JSON.stringify({ count: 0, items: [] }, null, 2)); }
}

function normalizeIndexItem(doc) {
  return {
    id: doc.id,
    nombre: doc.nombre,
    nombre_cientifico: doc.nombre_cientifico,
    especie: doc.especie,
    habitat: doc.habitat,
    tags: doc.tags || [],
    _q: [doc.nombre, doc.nombre_cientifico, doc.especie, doc.habitat, doc.descripcion, (doc.tags||[]).join(' ')].join(' ').toLowerCase()
  };
}

async function atomicWrite(filePath, data) {
  const tmp = filePath + '.' + Date.now() + '.tmp';
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, filePath);
}

export async function initStorage() {
  await ensureDirs();
}

export async function listAnimals({ page = 1, limit = 20, q, especie, habitat, tag, sort = 'nombre' }) {
  await ensureDirs();
  const raw = await fs.readFile(INDEX_FILE, 'utf-8');
  const index = JSON.parse(raw);

  let items = index.items;

  if (q) {
    const needle = String(q).toLowerCase();
    items = items.filter(i => i._q.includes(needle));
  }
  if (especie) items = items.filter(i => i.especie.toLowerCase() === String(especie).toLowerCase());
  if (habitat) items = items.filter(i => i.habitat.toLowerCase() === String(habitat).toLowerCase());
  if (tag) items = items.filter(i => (i.tags||[]).map(t=>t.toLowerCase()).includes(String(tag).toLowerCase()));

  items = items.sort((a, b) => String(a[sort]||'').localeCompare(String(b[sort]||''), 'es', { sensitivity: 'base' }));

  const total = items.length;
  const start = (page - 1) * limit;
  const end = start + limit;
  const pageItems = items.slice(start, end);

  return { total, page, limit, items: pageItems };
}

export async function getAnimal(id) {
  await ensureDirs();
  const file = path.join(ANIMALS_DIR, `${id}.json`);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function createAnimal(doc) {
  await ensureDirs();
  const id = nanoid(12);
  const file = path.join(ANIMALS_DIR, `${id}.json`);
  const record = { ...doc, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await atomicWrite(file, JSON.stringify(record, null, 2));

  const raw = await fs.readFile(INDEX_FILE, 'utf-8');
  const index = JSON.parse(raw);
  index.items.push(normalizeIndexItem(record));
  index.count = index.items.length;
  await atomicWrite(INDEX_FILE, JSON.stringify(index, null, 2));

  return record;
}

export async function updateAnimal(id, patch) {
  await ensureDirs();
  const current = await getAnimal(id);
  if (!current) return null;
  const next = { ...current, ...patch, id, updated_at: new Date().toISOString() };
  const file = path.join(ANIMALS_DIR, `${id}.json`);
  await atomicWrite(file, JSON.stringify(next, null, 2));

  const raw = await fs.readFile(INDEX_FILE, 'utf-8');
  const index = JSON.parse(raw);
  const pos = index.items.findIndex(i => i.id === id);
  if (pos !== -1) index.items[pos] = normalizeIndexItem(next);
  index.count = index.items.length;
  await atomicWrite(INDEX_FILE, JSON.stringify(index, null, 2));

  return next;
}

export async function deleteAnimal(id) {
  await ensureDirs();
  const file = path.join(ANIMALS_DIR, `${id}.json`);
  try { await fs.unlink(file); }
  catch (e) { if (e.code === 'ENOENT') return false; else throw e; }

  const raw = await fs.readFile(INDEX_FILE, 'utf-8');
  const index = JSON.parse(raw);
  index.items = index.items.filter(i => i.id !== id);
  index.count = index.items.length;
  await atomicWrite(INDEX_FILE, JSON.stringify(index, null, 2));
  return true;
}
