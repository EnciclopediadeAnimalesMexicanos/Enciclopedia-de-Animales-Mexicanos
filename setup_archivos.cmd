@echo off
setlocal ENABLEDELAYEDEXPANSION

rem ==== Ajustes ====
set "ROOT=%cd%"
set "BACKEND=%ROOT%\backend"
set "LIB=%BACKEND%\lib"
set "DATA=%BACKEND%\data"
set "UPLOADS=%BACKEND%\uploads"
set "PORT=4000"

echo.
echo === Enciclopedia: Backend SOLO ARCHIVOS (Express + Multer) ===
echo Carpeta raiz: %ROOT%

rem ==== Crear estructura ====
mkdir "%BACKEND%" 2>nul
mkdir "%LIB%" 2>nul
mkdir "%DATA%" 2>nul
mkdir "%UPLOADS%" 2>nul

rem ==== .env ====
> "%BACKEND%\.env" (
  echo PORT=%PORT%
  echo CORS_ORIGIN=*
)

rem ==== package.json ====
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$c=@'
{
  ""name"": ""animales-mx-api-files"",
  ""version"": ""1.0.0"",
  ""type"": ""module"",
  ""main"": ""server.js"",
  ""scripts"": {
    ""dev"": ""node server.js"",
    ""start"": ""NODE_ENV=production node server.js""
  },
  ""dependencies"": {
    ""cors"": ""^2.8.5"",
    ""dotenv"": ""^16.4.5"",
    ""express"": ""^4.19.2"",
    ""express-rate-limit"": ""^7.4.0"",
    ""helmet"": ""^7.1.0"",
    ""morgan"": ""^1.10.0"",
    ""multer"": ""^1.4.5-lts.2""
  }
}
'@; Set-Content -Path '%BACKEND%\package.json' -Value $c -Encoding UTF8"

rem ==== server.js (SOLO ARCHIVOS) ====
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$c=@'
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

import { ensureIndex, addToIndex, listFiles, getFromIndex, deleteFromIndex } from './lib/fileindex.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads'); // backend/uploads

app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use(limiter);

app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.mkdir(UPLOADS_DIR, { recursive: true });
await ensureIndex();

app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d', etag: true }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const base = path.basename(file.originalname || 'archivo', ext).replace(/\s+/g, '_').slice(0, 60);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${base}${ext}`;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      'image/jpeg','image/png','image/webp','image/gif','image/svg+xml',
      'application/pdf','text/plain','text/csv','application/json'
    ]);
    if (allowed.has(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido'));
  }
});

// Subir 1 archivo (opcional tags="aves,selva")
app.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const tags = (req.body?.tags || '').split(',').map(s => s.trim()).filter(Boolean);
    const meta = {
      id: req.file.filename,
      url: `/uploads/${req.file.filename}`,
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      ext: path.extname(req.file.filename).replace('.', ''),
      tags,
      created_at: new Date().toISOString()
    };
    await addToIndex(meta);
    res.status(201).json(meta);
  } catch (e) { next(e); }
});

// Subir varios (campo files)
app.post('/uploads', upload.array('files', 10), async (req, res, next) => {
  try {
    const tags = (req.body?.tags || '').split(',').map(s => s.trim()).filter(Boolean);
    const files = (req.files || []).map(f => ({
      id: f.filename,
      url: `/uploads/${f.filename}`,
      filename: f.filename,
      originalname: f.originalname,
      size: f.size,
      mimetype: f.mimetype,
      ext: path.extname(f.filename).replace('.', ''),
      tags,
      created_at: new Date().toISOString()
    }));
    for (const m of files) await addToIndex(m);
    if (!files.length) return res.status(400).json({ error: 'No se recibieron archivos' });
    res.status(201).json({ files });
  } catch (e) { next(e); }
});

// Listar/buscar
// GET /files?q=ajolote&mime=image/png&ext=png&tag=end%C3%A9mico&sort=created_at|filename|size&page=1&limit=20
app.get('/files', async (req, res, next) => {
  try {
    const { q, mime, ext, tag, sort = 'created_at', page = '1', limit = '20' } = req.query;
    const out = await listFiles({ q, mime, ext, tag, sort, page: Number(page), limit: Number(limit) });
    res.json(out);
  } catch (e) { next(e); }
});

// Metadatos por id (filename)
app.get('/files/:id', async (req, res, next) => {
  try {
    const meta = await getFromIndex(req.params.id);
    if (!meta) return res.status(404).json({ error: 'No encontrado' });
    res.json(meta);
  } catch (e) { next(e); }
});

// Borrar archivo + indice
app.delete('/files/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const filePath = path.join(UPLOADS_DIR, id);
    try { await fs.unlink(filePath); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const removed = await deleteFromIndex(id);
    if (!removed) return res.status(404).json({ error: 'No encontrado' });
    res.status(204).send();
  } catch (e) { next(e); }
});

// Autocomplete
app.get('/search/suggest', async (req, res, next) => {
  try {
    const { q = '' } = req.query;
    const out = await listFiles({ q, page: 1, limit: 10, sort: 'filename' });
    const suggestions = out.items.map(i => ({ id: i.id, filename: i.filename, url: i.url }));
    res.json({ q, suggestions });
  } catch (e) { next(e); }
});

// 404 y errores
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Error interno' });
});

app.listen(PORT, () => {
  console.log(`API (solo archivos) escuchando en http://localhost:${PORT}`);
});
'@; Set-Content -Path '%BACKEND%\server.js' -Value $c -Encoding UTF8"

rem ==== lib/fileindex.js ====
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$c=@'
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
'@; Set-Content -Path '%LIB%\fileindex.js' -Value $c -Encoding UTF8"

rem ==== Instalar dependencias ====
pushd "%BACKEND%"
echo.
echo Instalando dependencias...
npm install

if errorlevel 1 (
  echo [ERROR] npm install fallo. Revisa tu conexion o tu Node/npm.
  popd
  exit /b 1
)

rem ==== Lanzar servidor en ventana aparte ====
echo Iniciando servidor en puerto %PORT% ...
start "API Archivos %PORT%" cmd /k "cd /d %BACKEND% && npm run dev"

echo.
echo Listo. Endpoints principales:
echo  - GET  http://localhost:%PORT%/health
echo  - POST http://localhost:%PORT%/upload        (file)
echo  - POST http://localhost:%PORT%/uploads       (files[])
echo  - GET  http://localhost:%PORT%/files?q=...&ext=png&limit=10&page=1
echo  - GET  http://localhost:%PORT%/search/suggest?q=...
echo  - GET  http://localhost:%PORT%/uploads/NOMBRE.ext
echo  - DEL  http://localhost:%PORT%/files/NOMBRE.ext
echo.
echo Pruebas rapidas (CMD):
echo curl -F "file=@C:\ruta\a\imagen.png" -F "tags=endémico,ave" http://localhost:%PORT%/upload
echo curl "http://localhost:%PORT%/files?q=imagen&limit=10&page=1"
popd

endlocal
