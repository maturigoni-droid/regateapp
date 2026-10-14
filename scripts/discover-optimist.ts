import { mkdirSync, writeFileSync } from 'node:fs';
import type { Discovered } from './discovery-types';

// Asociación Optimist Argentina publishes its calendar and results through a public API
// (the same one its website uses). Usage: tsx scripts/discover-optimist.ts [fromYear]
const API = 'https://api.optimist-argentina.org';
const FROM_YEAR = Number(process.argv[2] ?? 2015);
const UA = { 'user-agent': 'Mozilla/5.0 (RegateApp discovery)' };

async function getJson(path: string): Promise<any> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(API + path, { headers: UA });
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error('Failed ' + path);
}

const abs = (u: string | null | undefined) => (!u ? null : u.startsWith('http') ? u : API + u);

function className(resultName: string): string {
  const n = resultName.toLowerCase();
  if (/timon/.test(n)) return 'Optimist Timoneles';
  if (/princip/.test(n)) return 'Optimist Principiantes';
  if (/escuela/.test(n)) return 'Optimist Escuela';
  return 'Optimist';
}

async function main() {
  const out: Discovered[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      'filters[anio_campeonato][$gte]': String(FROM_YEAR),
      'populate[resultados][populate][resultado_archivo]': 'true',
      'populate[clubes][fields][0]': 'nombre_club',
      sort: 'inicio_campeonato:desc',
      'pagination[page]': String(page),
      'pagination[pageSize]': '50',
    });
    const j = await getJson('/api/campeonatos?' + params);
    for (const c of j.data) {
      const results = (c.resultados ?? [])
        .map((r: any) => ({
          title: r.nombre_resultado as string,
          url: abs(r.tipo_resultado === 'archivo' ? r.resultado_archivo?.url : r.resultado_enlace),
          className: className(r.nombre_resultado ?? ''),
          publishedAt: r.updatedAt ?? null,
        }))
        .filter((r: any) => r.url);
      out.push({
        source: 'optimist-argentina',
        slug: `oa-${c.slug_campeonato}`,
        name: c.nombre_campeonato,
        club: (c.clubes ?? []).map((k: any) => k.nombre_club).join(' / ') || null,
        country: c.pais_campeonato ?? null,
        startDate: c.inicio_campeonato ?? null,
        endDate: c.fin_campeonato ?? null,
        classes: ['Optimist'],
        results,
        extra: { tipo: c.tipo_campeonato, ciudad: c.ciudad_campeonato, web: c.sitio_web_campeonato },
      });
    }
    if (page >= j.meta.pagination.pageCount) break;
  }
  mkdirSync('data/discovery', { recursive: true });
  writeFileSync('data/discovery/optimist-argentina.json', JSON.stringify(out, null, 1));

  const docs = out.flatMap((c) => c.results);
  const kinds = new Map<string, number>();
  for (const d of docs) {
    const k = /\.pdf(\?|$)/i.test(d.url) ? 'pdf' : /docs\.google\.com/.test(d.url) ? 'google-sheet' : /viramos/.test(d.url) ? 'viramos' : 'other:' + new URL(d.url).hostname;
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  const byYear = new Map<string, number>();
  for (const c of out) byYear.set(c.startDate?.slice(0, 4) ?? '?', (byYear.get(c.startDate?.slice(0, 4) ?? '?') ?? 0) + c.results.length);
  console.log(`${out.length} championships from ${FROM_YEAR}, ${docs.length} result documents`);
  console.log('by type:', Object.fromEntries(kinds));
  console.log('docs by year:', Object.fromEntries([...byYear.entries()].sort()));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
