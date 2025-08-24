import { z } from 'zod';

export const AnimalSchema = z.object({
  id: z.string().optional(),
  nombre: z.string().min(2),
  nombre_cientifico: z.string().min(2),
  especie: z.string().min(2),
  habitat: z.string().min(2),
  descripcion: z.string().min(10),
  estatus_conservacion: z.string().default('ND'),
  tags: z.array(z.string()).default([]),
  imagen_url: z.string().url().optional(),
  fuente: z.string().optional(),
  extra: z.record(z.any()).optional()
}).strict();

export function validateAnimal(body) {
  const parsed = AnimalSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
    const err = new Error('Validación inválida');
    err.status = 400;
    err.details = issues;
    throw err;
  }
  return parsed.data;
}

import { z } from 'zod';

// Enum IUCN típica + ND
const Estatus = z.enum(['CR', 'EN', 'VU', 'NT', 'LC', 'ND']);

// Acepta URL absoluta o ruta relativa servida por tu backend (/uploads/...)
const ImagenUrl = z.preprocess(
  (v) => (v === '' ? undefined : v), // trata '' como undefined
  z.union([
    z.string().url(),
    z.string().regex(/^\/uploads\//, 'Debe comenzar con /uploads/ o ser URL http(s)'),
  ]).optional()
);

export const AnimalSchema = z.object({
  id: z.string().optional(), // asignado por el servidor
  nombre: z.string().trim().min(2),               // p. ej. "Ajolote"
  nombre_cientifico: z.string().trim().min(2),
  especie: z.string().trim().min(2),              // taxón amplio (anfibio, ave, mamífero)
  habitat: z.string().trim().min(2),
  descripcion: z.string().trim().min(10),
  estatus_conservacion: Estatus.default('ND'),    // "CR","EN","VU","NT","LC","ND"
  tags: z.array(z.string().trim()).default([]).transform(
    (arr) => Array.from(new Set(arr.filter(Boolean))) // dedup + limpia vacíos
  ),
  imagen_url: ImagenUrl,                           // ahora acepta /uploads/xxx o http(s)
  fuente: z.string().trim().optional(),
  extra: z.record(z.any()).optional()
}).strict();

export function validateAnimal(body) {
  const parsed = AnimalSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
    const err = new Error('Validación inválida');
    err.status = 400;
    err.details = issues;
    throw err;
  }
  return parsed.data;
}
