# RegateApp

Resultados históricos de regatas de Argentina, de todas las clases. Los datos salen de [viramos.com](https://viramos.com/), se guardan en Supabase y se muestran con Next.js.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar las claves de Supabase
npm run dev
```

`.env.local` nunca se sube al repo. `SUPABASE_SERVICE_ROLE_KEY` es solo para los scripts locales; no la cargues en Vercel.

## Actualizar los datos

```bash
npm run sync
```

Corre en orden, y se puede repetir sin duplicar datos:

| Paso | Script | Qué hace |
|---|---|---|
| 1 | `npm run scrape` | Baja campeonatos y resultados de viramos a `data/` |
| 2 | `npm run upload` | Filtra los clubes argentinos y los carga en Supabase |
| 3 | `npm run mirror` | Copia los documentos nuevos al bucket `results` |
| 4 | `npm run download` | Trae los archivos copiados a `data/files/` |
| 5 | `npm run parse` | Lee las tablas HTML y las guarda en `entries` |

Los clubes que cuentan como Argentina están en `scripts/upload.ts` (`ARGENTINE_CLUBS`).

## Base de datos

El esquema está en `supabase/schema.sql`. Se ejecuta una vez en el editor SQL de Supabase.

## Cobertura de posiciones

Solo se leen las tablas HTML. Los PDFs quedan enlazados al original, sin posiciones estructuradas.
