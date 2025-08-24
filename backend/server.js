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
const UPLOADS_DIR = path.join(__dirname, 'uploads');

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
    const name = ${Date.now()}--;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
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
      url: /uploads/,
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
      url: /uploads/,
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

// Metadatos por id
app.get('/files/:id', async (req, res, next) => {
  try {
    const meta = await getFromIndex(req.params.id);
    if (!meta) return res.status(404).json({ error: 'No encontrado' });
    res.json(meta);
  } catch (e) { next(e); }
});

// Borrar archivo + índice
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
  console.log(API (solo archivos) escuchando en http://localhost:4000);
});
