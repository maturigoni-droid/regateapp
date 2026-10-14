import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { ScrapedChampionship } from './scrape';

config({ path: '.env.local' });

// Clubs (viramos club slugs) that organize in Argentina.
const ARGENTINE_CLUBS = new Set([
  'yca', 'cnsi', 'cnmp', 'cnc', 'cuba', 'yacht-olivos', 'cavla',
  'barrancas', 'comision-interclubes', 'amwindsurf', 'ycc',
]);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
const supabase = createClient(url, key, { auth: { persistSession: false } });

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

async function main() {
  const all: ScrapedChampionship[] = JSON.parse(readFileSync('data/championships.json', 'utf8'));
  const champs = all.filter((c) => c.clubSlug && ARGENTINE_CLUBS.has(c.clubSlug));
  console.log(`${champs.length} Argentine championships of ${all.length}`);

  const classNames = [...new Set(champs.flatMap((c) => [...c.classes, ...c.results.map((r) => r.className ?? '')]).filter(Boolean))];
  const classRows = check(
    await supabase.from('classes').upsert(classNames.map((name) => ({ name })), { onConflict: 'name' }).select('id,name'),
    'classes',
  );
  const classId = new Map(classRows.map((r) => [r.name, r.id as string]));

  const champRows = check(
    await supabase
      .from('championships')
      .upsert(
        champs.map((c) => ({
          slug: c.slug,
          name: c.name.replace(/\s+/g, ' ').trim(),
          club: c.clubName?.trim() ?? null,
          country: 'AR',
          year: c.startDate ? Number(c.startDate.slice(0, 4)) : null,
          start_date: c.startDate,
          end_date: c.endDate,
          source_url: `https://viramos.com/${c.slug}`,
        })),
        { onConflict: 'slug' },
      )
      .select('id,slug'),
    'championships',
  );
  const champId = new Map(champRows.map((r) => [r.slug, r.id as string]));

  const links = champs.flatMap((c) =>
    [...new Set(c.classes)].map((n) => ({ championship_id: champId.get(c.slug)!, class_id: classId.get(n)! })),
  );
  check(await supabase.from('championship_classes').upsert(links, { onConflict: 'championship_id,class_id' }), 'championship_classes');

  const docs = champs.flatMap((c) =>
    c.results.map((r) => ({
      championship_id: champId.get(c.slug)!,
      class_id: r.className ? classId.get(r.className) ?? null : null,
      title: r.title.replace(/\s+/g, ' ').trim(),
      source_url: r.url,
      published_at: r.publishedAt,
    })),
  );
  for (let i = 0; i < docs.length; i += 200) {
    check(await supabase.from('result_documents').upsert(docs.slice(i, i + 200), { onConflict: 'source_url' }), 'result_documents');
  }
  console.log(`uploaded: ${champRows.length} championships, ${classRows.length} classes, ${docs.length} result documents`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
