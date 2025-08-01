const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const uploadFolder = path.join(__dirname, 'convocatorias');
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadFolder),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

const convocatoriasFile = path.join(uploadFolder, 'convocatorias.json');
function getConvocatorias() {
  if (!fs.existsSync(convocatoriasFile)) return [];
  return JSON.parse(fs.readFileSync(convocatoriasFile));
}
function saveConvocatorias(data) {
  fs.writeFileSync(convocatoriasFile, JSON.stringify(data, null, 2));
}

app.get('/api/convocatorias', (req, res) => {
  res.json(getConvocatorias());
});

app.get('/convocatorias/:filename', (req, res) => {
  const filePath = path.join(uploadFolder, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('Archivo no encontrado');
  }
});

app.post('/api/convocatorias', upload.single('archivo'), (req, res) => {
  const { titulo, password } = req.body;
  if (password !== '1234') return res.status(401).json({ error: 'Contraseña incorrecta' });
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  const tipo = req.file.mimetype === 'application/pdf' ? 'pdf' : 'png';
  const nueva = {
    titulo,
    archivoUrl: `/convocatorias/${req.file.filename}`,
    tipo
  };
  const convocatorias = getConvocatorias();
  convocatorias.push(nueva);
  saveConvocatorias(convocatorias);
  res.json(nueva);
});

app.use('/convocatorias', express.static(uploadFolder));

app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
