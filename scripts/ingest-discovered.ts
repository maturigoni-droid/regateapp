import { config } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Discovered } from './discovery-types';

config({ path: '.env.local' });

// Usage: tsx scripts/ingest-discovered.ts [--apply]
// Registers the championships and result documents found by the discover-*.ts scripts
// (data/discovery/*.json). Files are copied to Storage afterwards with `npm run mirror`.
const apply = process.argv.includes('--apply');

const MOTOR = /regularidad|a motor/i; // motor-boat "regularity" races are not sailing
const DOC_EXT = /\.(pdf|xlsx?)(\?|$)/i;
const DAY = 86400000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
const supabase = createClient(url, key, { auth: { persistSession: false } });

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const cleanName = (s: string) => clean(s).replace(/^resultados?(\s+finales?)?\s*[-–:|]?\s*/i, '') || clean(s);

async function main() {
  const existing = check(await supabase.from('championships').select('slug,name,start_date,end_date').limit(5000), 'championships');
  const known = new Set(existing.map((c) => c.slug));
  const STOP = new Set(['campeonato', 'copa', 'regata', 'resultados', 'resultado', 'final', 'finales', 'club', 'yacht', 'argentino', 'argentina', 'fecha', 'serie', 'general', 'clase', 'trofeo', 'semana', 'ranking']);
  const tokens = (name: string) =>
    new Set(
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4 && !/^\d+$/.test(t) && !STOP.has(t)),
    );
  const ranges = existing.map((c) => ({
    from: new Date((c.start_date ?? '1900-01-01') + 'T00:00:00').getTime() - 3 * DAY,
    to: new Date((c.end_date ?? c.start_date ?? '1900-01-01') + 'T00:00:00').getTime() + 3 * DAY,
    tokens: tokens(c.name),
  }));
  // A championship already loaded (e.g. from viramos) with overlapping dates AND a similar name is the same event: skip it.
  // Dates alone are not enough, since several different events often share a weekend.
  const overlapsExisting = (name: string, start: string | null) => {
    if (!start || start < '2025-01-01') return false; // viramos only has 2025 onwards
    const t = new Date(start + 'T00:00:00').getTime();
    const mine = tokens(name);
    return ranges.some((r) => t >= r.from && t <= r.to && [...mine].some((w) => r.tokens.has(w)));
  };

  const stats: Record<string, { events: number; docs: number; skipped: Record<string, number> }> = {};
  const toLoad: { champ: Discovered; docs: Discovered['results'] }[] = [];

  for (const f of readdirSync('data/discovery').filter((n) => n.endsWith('.json'))) {
    const events: Discovered[] = JSON.parse(readFileSync(`data/discovery/${f}`, 'utf8'));
    for (const e of events) {
      const s = (stats[e.source] ??= { events: 0, docs: 0, skipped: {} });
      const skip = (why: string, n = e.results.length) => (s.skipped[why] = (s.skipped[why] ?? 0) + n);
      if (known.has(e.slug) && !apply) {
        // Already ingested earlier: still counted so re-runs are idempotent.
      }
      if (MOTOR.test(`${e.name} ${e.results.map((r) => r.title).join(' ')}`)) { skip('motor'); continue; }
      if (e.source === 'optimist-argentina' && /metropolitano/i.test(e.name)) { skip('duplicado (CUBA Metropolitano)'); continue; }
      if (overlapsExisting(e.name, e.startDate)) { skip('ya cubierto por otro campeonato'); continue; }
      const docs = e.results.filter((r) => DOC_EXT.test(r.url));
      if (docs.length < e.results.length) skip('no es PDF/Excel', e.results.length - docs.length);
      if (docs.length === 0) continue;
      s.events++;
      s.docs += docs.length;
      toLoad.push({ champ: e, docs });
    }
  }

  for (const [src, s] of Object.entries(stats)) {
    console.log(`${src.padEnd(20)} eventos ${String(s.events).padStart(3)}  docs ${String(s.docs).padStart(3)}  omitidos ${JSON.stringify(s.skipped)}`);
  }
  console.log(`TOTAL ${toLoad.length} eventos, ${toLoad.reduce((n, x) => n + x.docs.length, 0)} documentos`);
  if (!apply) {
    console.log('Dry run. Use --apply to write to Supabase.');
    return;
  }

  const classNames = [...new Set(toLoad.flatMap((x) => [...x.champ.classes, ...x.docs.map((d) => d.className ?? '')]).filter(Boolean))];
  const classRows = check(
    await supabase.from('classes').upsert(classNames.map((name) => ({ name })), { onConflict: 'name' }).select('id,name'),
    'classes',
  );
  const classId = new Map(classRows.map((r) => [r.name, r.id as string]));

  const champRows = check(
    await supabase
      .from('championships')
      .upsert(
        toLoad.map(({ champ: e }) => ({
          slug: e.slug,
          name: cleanName(e.name),
          club: e.club,
          country: e.country ?? 'AR',
          year: e.startDate ? Number(e.startDate.slice(0, 4)) : null,
          start_date: e.startDate,
          end_date: e.endDate,
          source_url: null,
        })),
        { onConflict: 'slug' },
      )
      .select('id,slug'),
    'championships',
  );
  const champId = new Map(champRows.map((r) => [r.slug, r.id as string]));

  const links = toLoad.flatMap(({ champ: e, docs }) =>
    [...new Set(docs.map((d) => d.className).filter(Boolean) as string[])].map((n) => ({ championship_id: champId.get(e.slug)!, class_id: classId.get(n)! })),
  );
  if (links.length) check(await supabase.from('championship_classes').upsert(links, { onConflict: 'championship_id,class_id' }), 'championship_classes');

  const docs = toLoad.flatMap(({ champ: e, docs }) =>
    docs.map((d) => ({
      championship_id: champId.get(e.slug)!,
      class_id: d.className ? classId.get(d.className) ?? null : null,
      title: clean(d.title),
      source_url: d.url,
      published_at: d.publishedAt,
    })),
  );
  // The same file can be linked from several posts: keep one row per URL.
  const unique = [...new Map(docs.map((d) => [d.source_url, d])).values()];
  for (let i = 0; i < unique.length; i += 200) {
    check(await supabase.from('result_documents').upsert(unique.slice(i, i + 200), { onConflict: 'source_url' }), 'result_documents');
  }
  console.log(`loaded ${champRows.length} championships, ${unique.length} documents`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
