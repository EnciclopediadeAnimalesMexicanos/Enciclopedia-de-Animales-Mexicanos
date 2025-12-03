const express = require('express');
const path = require('path');

const app = express();

// Servir todos los archivos estáticos del proyecto (html, css, js, imagenes, pdf, etc.)
app.use(express.static(__dirname));

// Levantar el servidor en el puerto 8080
app.listen(8080, () => {
  console.log("Servidor corriendo en http://localhost:8080");
});
