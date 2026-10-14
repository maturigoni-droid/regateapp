import { mkdirSync, writeFileSync } from 'node:fs';
import type { Discovered } from './discovery-types';
import { classFromText } from './discovery-utils';

// ROMS (Joomla) event sites hosted by CUBA for its Campeonato Metropolitano:
// https://cuba.roms.ar/metropolitano<year>/index.php/es/onb-results
// Usage: tsx scripts/discover-roms.ts [firstYear] [lastYear]
const HOST = 'https://cuba.roms.ar';
const FIRST = Number(process.argv[2] ?? 2021);
const LAST = Number(process.argv[3] ?? new Date().getFullYear());
const UA = { 'user-agent': 'Mozilla/5.0 (RegateApp discovery)' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const out: Discovered[] = [];
  for (let year = FIRST; year <= LAST; year++) {
    const res = await fetch(`${HOST}/metropolitano${year}/index.php/es/onb-results`, { headers: UA });
    await sleep(800);
    if (!res.ok) {
      console.log(year, 'not available', res.status);
      continue;
    }
    const html = await res.text();
    const urls = [...new Set([...html.matchAll(/href="([^"]+\.(?:pdf|xlsx?))"/gi)].map((m) => new URL(m[1], res.url).toString()))];
    if (urls.length === 0) continue;

    const results = urls.map((url) => {
      const file = decodeURIComponent(url.split('/').pop() ?? '');
      const d = file.match(/(\d{2})-(\d{2})-(\d{4})/);
      return {
        title: file.replace(/\.(pdf|xlsx?)$/i, '').replace(/_/g, ' '),
        url,
        className: classFromText(file),
        publishedAt: d ? `${d[3]}-${d[2]}-${d[1]}` : null,
      };
    });
    const dates = results.map((r) => r.publishedAt).filter(Boolean).sort() as string[];
    out.push({
      source: 'cuba-metropolitano',
      slug: `cuba-metropolitano-${year}`,
      name: `Campeonato Metropolitano ${year}`,
      club: 'Club Universitario de Buenos Aires',
      country: 'AR',
      startDate: dates[0] ?? `${year}-08-01`,
      endDate: dates[dates.length - 1] ?? `${year}-08-31`,
      classes: [...new Set(results.map((r) => r.className).filter(Boolean) as string[])],
      results,
      extra: { eventUrl: `${HOST}/metropolitano${year}/` },
    });
    console.log(year, results.length, 'documents', JSON.stringify([...new Set(results.map((r) => r.className))]));
  }
  mkdirSync('data/discovery', { recursive: true });
  writeFileSync('data/discovery/cuba-metropolitano.json', JSON.stringify(out, null, 1));
  console.log(`${out.length} editions, ${out.reduce((n, c) => n + c.results.length, 0)} documents`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
