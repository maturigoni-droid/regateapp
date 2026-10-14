import { config } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

// Usage: tsx scripts/load-parsed.ts [--apply]
// Validates data/parsed/*.json (transcribed standings) and, with --apply, stores them in `entries`.
const apply = process.argv.includes('--apply');

type Row = {
  position: number | null;
  sail_number: string | null;
  crew: string | null;
  boat: string | null;
  club: string | null;
  race_scores: Record<string, string> | null;
  total: number | null;
  net: number | null;
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function clean(raw: any): Row | null {
  const position = Number.isInteger(raw?.position) && raw.position > 0 ? raw.position : null;
  const row: Row = {
    position,
    sail_number: str(raw?.sail_number),
    crew: str(raw?.crew),
    boat: str(raw?.boat),
    club: str(raw?.club),
    race_scores:
      raw?.race_scores && typeof raw.race_scores === 'object' && !Array.isArray(raw.race_scores)
        ? Object.fromEntries(Object.entries(raw.race_scores).map(([k, v]) => [k, String(v)]))
        : null,
    total: numOrNull(raw?.total),
    net: numOrNull(raw?.net),
  };
  if (!row.position || !(row.crew || row.boat)) return null;
  return row;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: docs } = await supabase.from('result_documents').select('id').limit(5000);
  const known = new Set((docs ?? []).map((d) => d.id));

  let loaded = 0, rejected = 0, empty = 0, rows = 0;
  for (const f of readdirSync('data/parsed').filter((n) => n.endsWith('.json'))) {
    let doc: any;
    try {
      doc = JSON.parse(readFileSync(`data/parsed/${f}`, 'utf8'));
    } catch {
      console.warn('invalid JSON:', f);
      rejected++;
      continue;
    }
    const id = f.replace(/\.json$/, '');
    if (doc.document_id !== id || !known.has(id)) {
      console.warn('unknown document:', f);
      rejected++;
      continue;
    }
    const raw: any[] = Array.isArray(doc.entries) ? doc.entries : [];
    if (raw.length === 0) {
      empty++;
      continue;
    }
    const cleaned = raw.map(clean);
    const good = cleaned.filter((r): r is Row => r !== null);
    // Quality gate: nearly every row must be valid and positions must be broadly in order.
    const outOfOrder = good.filter((r, i) => i > 0 && r.position! < good[i - 1].position! - 1).length;
    if (good.length < raw.length * 0.9 || good.length < 2 || outOfOrder > good.length * 0.1) {
      console.warn(`rejected ${f}: ${good.length}/${raw.length} valid rows, ${outOfOrder} out of order`);
      rejected++;
      continue;
    }
    if (apply) {
      const del = await supabase.from('entries').delete().eq('document_id', id);
      if (del.error) throw new Error(del.error.message);
      const ins = await supabase.from('entries').insert(good.map((r) => ({ document_id: id, ...r })));
      if (ins.error) throw new Error(ins.error.message);
    }
    loaded++;
    rows += good.length;
  }
  console.log(`${apply ? 'loaded' : 'would load'} ${loaded} documents (${rows} entries); empty ${empty}; rejected ${rejected}`);
  if (!apply) console.log('Dry run. Use --apply to write to Supabase.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
