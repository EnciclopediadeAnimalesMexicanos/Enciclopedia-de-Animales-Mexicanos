// js/animales.js
// Si tu front se abre como archivo local (file://) o por un servidor distinto,
// deja la URL absoluta. Si sirves el front desde el backend (express.static),
// puedes poner const API = ""; y usar rutas relativas.
const API = "http://localhost:4000";

const $ = s => document.querySelector(s);
const tbody = document.querySelector("#tabla-animales tbody");
const formBuscar = $("#form-buscar");
const qInput = $("#q");
const recargarBtn = $("#recargar");
const formCrear = $("#form-crear");

function escapeHTML(s="") {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function fetchJSON(url, opts) {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(opts?.headers||{}) },
    ...opts
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

function render(items=[]) {
  tbody.innerHTML = items.map(a => `
    <tr data-id="${a.id}">
      <td>${escapeHTML(a.nombre)}</td>
      <td>${escapeHTML(a.especie)}</td>
      <td>${escapeHTML(a.habitat)}</td>
      <td><button class="btn-borrar">Borrar</button></td>
    </tr>
  `).join("");
}

async function cargarLista(q="") {
  const data = await fetchJSON(`${API}/animals?q=${encodeURIComponent(q)}&limit=50&page=1`);
  render(data.items);
}

formBuscar.addEventListener("submit", e => {
  e.preventDefault();
  cargarLista(qInput.value.trim());
});
recargarBtn.addEventListener("click", () => {
  qInput.value = "";
  cargarLista();
});

document.querySelector("#tabla-animales tbody").addEventListener("click", async e => {
  const btn = e.target.closest(".btn-borrar");
  if (!btn) return;
  const tr = btn.closest("tr");
  const id = tr?.dataset.id;
  if (!id) return;
  if (!confirm("¿Borrar esta ficha?")) return;
  await fetch(`${API}/animals/${id}`, { method: "DELETE" });
  tr.remove();
});

formCrear.addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(formCrear);
  const ficha = {
    nombre: fd.get("nombre"),
    nombre_cientifico: fd.get("nombre_cientifico"),
    especie: fd.get("especie"),
    habitat: fd.get("habitat"),
    descripcion: fd.get("descripcion"),
    estatus_conservacion: fd.get("estatus_conservacion") || "ND",
    tags: (fd.get("tags") || "").split(",").map(s => s.trim()).filter(Boolean)
  };
  const res = await fetchJSON(`${API}/animals`, {
    method: "POST",
    body: JSON.stringify(ficha)
  });
  formCrear.reset();
  alert(`Creado: ${res.nombre} (id: ${res.id})`);
  cargarLista();
});

// Carga inicial
cargarLista().catch(err => {
  console.error(err);
  tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHTML(err.message)}</td></tr>`;
});
