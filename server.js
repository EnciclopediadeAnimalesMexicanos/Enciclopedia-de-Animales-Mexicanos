server.js
// server.js
// Servidor Express para manejar fichas de animales
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = 3000;
const RUTA_FICHAS = path.join(__dirname, 'fichas.json');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ruta 1: Obtener todas las fichas
app.get('/obtener-fichas', (req, res) => {
  fs.readFile(RUTA_FICHAS, 'utf8', (err, data) => {
    if (err) {
      console.error('Error al leer fichas:', err);
      return res.status(500).json({ error: 'Error al leer las fichas.' });
    }
    try {
      const fichas = JSON.parse(data);
      res.json(fichas);
    } catch (e) {
      res.json([]);
    }
  });
});

// Ruta 2: Guardar una ficha nueva
app.post('/guardar-ficha', (req, res) => {
  const nuevaFicha = req.body;

  fs.readFile(RUTA_FICHAS, 'utf8', (err, data) => {
    let fichas = [];
    if (!err && data) {
      try {
        fichas = JSON.parse(data);
      } catch (e) {
        console.warn('Archivo fichas.json mal formado. Se reiniciará.');
      }
    }

    fichas.push(nuevaFicha);

    fs.writeFile(RUTA_FICHAS, JSON.stringify(fichas, null, 2), err => {
      if (err) {
        console.error('Error al guardar ficha:', err);
        return res.status(500).json({ error: 'No se pudo guardar la ficha.' });
      }
      res.json({ mensaje: 'Ficha guardada correctamente.' });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
