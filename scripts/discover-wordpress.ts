import { mkdirSync, writeFileSync } from 'node:fs';
import type { Discovered, DiscoveredResult } from './discovery-types';
import { classFromText } from './discovery-utils';

// Discovers result documents (PDF/XLSX links) published as posts on a WordPress site.
// Usage: tsx scripts/discover-wordpress.ts <source> <baseUrl> <clubName> [fromYear]
// e.g.   tsx scripts/discover-wordpress.ts yca https://yca.org.ar "Yacht Club Argentino" 2015
const [source, base, clubName, fromArg] = process.argv.slice(2);
if (!source || !base || !clubName) throw new Error('Usage: discover-wordpress.ts <source> <baseUrl> <clubName> [fromYear]');
const FROM_YEAR = Number(fromArg ?? 2015);
const UA = { 'user-agent': 'Mozilla/5.0 (RegateApp discovery)' };
const PAUSE_MS = 700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(path: string): Promise<{ data: any; totalPages: number }> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(base + path, { headers: UA });
    if (res.ok) return { data: await res.json(), totalPages: Number(res.headers.get('x-wp-totalpages') ?? 1) };
    await sleep(2000 * attempt);
  }
  throw new Error('Failed ' + path);
}

async function getAll(path: string): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; ; page++) {
    const { data, totalPages } = await getJson(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    out.push(...data);
    if (page >= totalPages) break;
    await sleep(PAUSE_MS);
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const RESULT_WORDS = /result|clasific|posicion|general|final|suma|puntaje|overall|ranking|podio/i;
const NOT_RESULTS = /aviso|instrucc|inscrip|programa|reglamento|cronograma|declaraci|formulario|recorrido|autorizaci|\bIR\b|\bAR\b|\bTOA\b/i;

async function main() {
  console.log('categories...');
  const cats: any[] = await getAll('/wp-json/wp/v2/categories?_fields=id,name,slug,parent,count');
  const byId = new Map(cats.map((c) => [c.id, c]));
  const isYear = (c: any) => /^\d{4}$/.test(c.slug);

  // Championship of a post: the top-most non-year category in its chain; null if it only has year categories.
  const championshipCat = (catIds: number[]) => {
    for (const id of catIds) {
      let c = byId.get(id);
      while (c && c.parent && byId.get(c.parent)) c = byId.get(c.parent);
      // Very large categories (e.g. "regatas", "noticias") are not one championship: group those posts individually.
      if (c && !isYear(c) && c.slug !== 'uncategorized' && c.slug !== 'sin-categoria' && c.count <= 30) return c;
    }
    return null;
  };

  console.log('posts since', FROM_YEAR, '...');
  const after = `${FROM_YEAR}-01-01T00:00:00`;
  const light: any[] = await getAll(`/wp-json/wp/v2/posts?after=${after}&_fields=id,date,slug,link,title,categories`);
  console.log(light.length, 'posts in total');

  // Only fetch the body of posts that look like results (by title/slug, or filed under a "...resultados" category).
  // Small sites (<= 1500 posts) are cheap enough to read in full, which also catches result PDFs in posts
  // whose title doesn't say "resultados" (e.g. "Regata Pilote Norden").
  const candidates = light.filter((p) => {
    if (light.length <= 1500) return true;
    const text = `${decode(p.title.rendered)} ${p.slug}`;
    const inResultsCat = (p.categories ?? []).some((id: number) => /result/.test(byId.get(id)?.slug ?? ''));
    return RESULT_WORDS.test(text) || inResultsCat;
  });
  console.log(candidates.length, 'candidate posts; fetching bodies');

  const posts: any[] = [];
  const BATCH = 15;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const ids = candidates.slice(i, i + BATCH).map((p) => p.id);
    try {
      const { data } = await getJson(`/wp-json/wp/v2/posts?include=${ids.join(',')}&per_page=${BATCH}&_fields=id,date,slug,link,title,categories,content`);
      posts.push(...data);
    } catch {
      // Retry one by one so a single broken post does not drop its whole batch.
      for (const id of ids) {
        try {
          const { data } = await getJson(`/wp-json/wp/v2/posts/${id}?_fields=id,date,slug,link,title,categories,content`);
          posts.push(data);
        } catch {
          console.warn('skipped post', id);
        }
        await sleep(PAUSE_MS);
      }
    }
    await sleep(PAUSE_MS);
  }
  console.log(posts.length, 'posts with body');

  const groups = new Map<string, Discovered>();
  for (const p of posts) {
    const html: string = p.content?.rendered ?? '';
    const docs: DiscoveredResult[] = [];
    for (const m of html.matchAll(/<a\s[^>]*href="([^"]+\.(?:pdf|xlsx?))(?:\?[^"]*)?"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = m[1].startsWith('http') ? m[1] : new URL(m[1], base).toString();
      const text = decode(m[2]);
      const label = text.length > 3 && !/^(descargar|download|pdf|ver|aqui|aquí)/i.test(text) ? text : decode(p.title.rendered);
      const haystack = `${text} ${decodeURIComponent(url.split('/').pop() ?? '')} ${decode(p.title.rendered)}`;
      if (NOT_RESULTS.test(label) && !RESULT_WORDS.test(label)) continue;
      if (!RESULT_WORDS.test(haystack)) continue;
      docs.push({ title: label, url, className: classFromText(haystack), publishedAt: p.date });
    }
    if (docs.length === 0) continue;

    const cat = championshipCat(p.categories ?? []);
    const key = cat ? `cat-${cat.slug}` : `post-${p.slug}`;
    const name = cat ? decode(cat.name) : decode(p.title.rendered);
    let g = groups.get(key);
    if (!g) {
      g = { source, slug: `${source}-${cat ? cat.slug : p.slug}`, name, club: clubName, country: 'AR', startDate: p.date.slice(0, 10), endDate: p.date.slice(0, 10), classes: [], results: [], extra: { postUrls: [] } };
      groups.set(key, g);
    }
    for (const d of docs) if (!g.results.some((r) => r.url === d.url)) g.results.push(d);
    g.startDate = g.startDate! < p.date.slice(0, 10) ? g.startDate : p.date.slice(0, 10);
    g.endDate = g.endDate! > p.date.slice(0, 10) ? g.endDate : p.date.slice(0, 10);
    (g.extra!.postUrls as string[]).push(p.link);
  }

  const out = [...groups.values()].map((g) => ({ ...g, classes: [...new Set(g.results.map((r) => r.className).filter(Boolean) as string[])] }));
  out.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  mkdirSync('data/discovery', { recursive: true });
  writeFileSync(`data/discovery/${source}.json`, JSON.stringify(out, null, 1));

  const docs = out.flatMap((c) => c.results);
  const byYear: Record<string, number> = {};
  for (const c of out) for (const r of c.results) byYear[(r.publishedAt ?? '?').slice(0, 4)] = (byYear[(r.publishedAt ?? '?').slice(0, 4)] ?? 0) + 1;
  console.log(`${out.length} championships/events, ${docs.length} result documents`);
  console.log('pdf:', docs.filter((d) => /\.pdf$/i.test(d.url)).length, '| xlsx/xls:', docs.filter((d) => /\.xlsx?$/i.test(d.url)).length);
  console.log('docs by year:', JSON.stringify(Object.fromEntries(Object.entries(byYear).sort())));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
