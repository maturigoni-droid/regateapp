import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://viramos.com';
const UA = { 'user-agent': 'Mozilla/5.0 (RegateApp scraper)' };

export type ScrapedResult = {
  title: string;
  url: string;
  className: string | null;
  publishedAt: string | null;
};

export type ScrapedChampionship = {
  slug: string;
  name: string;
  clubName: string | null;
  clubSlug: string | null;
  startDate: string | null;
  endDate: string | null;
  classes: string[];
  results: ScrapedResult[];
};

async function getHtml(path: string): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(BASE + path, { headers: UA });
    if (res.ok) return res.text();
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error(`Failed to fetch ${path}`);
}

function rscText(html: string): string {
  const parts = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => JSON.parse(m[1]) as string);
  return parts.join('');
}

function extractJson(text: string, start: number): any {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('Unbalanced JSON');
}

async function listSlugs(): Promise<string[]> {
  const html = await getHtml('/championships/all');
  const slugs = new Set<string>();
  for (const m of html.matchAll(/href="\/([^"/_?][^"/?]*)"/g)) slugs.add(m[1]);
  slugs.delete('championships');
  return [...slugs];
}

async function scrapeChampionship(slug: string): Promise<ScrapedChampionship | null> {
  const t = rscText(await getHtml('/' + slug));
  const ci = t.indexOf('"championship":{"id"');
  if (ci < 0) return null;
  const champ = extractJson(t, ci + '"championship":'.length);
  const ri = t.indexOf('"results":[');
  const raw: any[] = ri >= 0 ? extractJson(t, ri + '"results":'.length) : [];
  const results: ScrapedResult[] = raw
    .filter((r) => r.document?.fileSrc)
    .map((r) => ({
      title: r.document.name,
      url: r.document.fileSrc,
      className: r.sailingClass?.name ?? null,
      publishedAt: r.document.updatedAt ?? r.createdAt ?? null,
    }));
  return {
    slug: champ.slug,
    name: champ.name,
    clubName: champ.club?.name ?? null,
    clubSlug: champ.club?.slug ?? null,
    startDate: champ.startDate?.slice(0, 10) ?? null,
    endDate: champ.endDate?.slice(0, 10) ?? null,
    classes: (champ.classes ?? []).map((c: any) => c.name),
    results,
  };
}

async function main() {
  const slugs = await listSlugs();
  console.log(`${slugs.length} championships found`);
  const out: ScrapedChampionship[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < slugs.length) {
        const slug = slugs[next++];
        try {
          const c = await scrapeChampionship(slug);
          if (c) out.push(c);
          else console.warn('no data for', slug);
        } catch (e) {
          console.warn('failed', slug, (e as Error).message);
        }
      }
    }),
  );
  out.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  mkdirSync('data', { recursive: true });
  writeFileSync('data/championships.json', JSON.stringify(out, null, 1));
  const clubs = new Map<string, number>();
  for (const c of out) clubs.set(`${c.clubName} [${c.clubSlug}]`, (clubs.get(`${c.clubName} [${c.clubSlug}]`) ?? 0) + 1);
  console.log('results total', out.reduce((n, c) => n + c.results.length, 0));
  console.log([...clubs.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'));
}

main();
