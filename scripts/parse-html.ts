import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
const supabase = createClient(url, key, { auth: { persistSession: false } });

type Field = 'position' | 'sail_number' | 'crew' | 'club' | 'boat' | 'total' | 'net' | 'race';

const clean = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

function fieldOf(header: string): Field | null {
  const h = clean(header).toLowerCase();
  if (/^r?\d+$/.test(h)) return 'race';
  if (/^(pl\.?|pos\.?|place|puesto|rank)$/.test(h)) return 'position';
  if (/^(sail\s?#?|s#|b#|boat\s?#|sail no\.?|sailno|nro vela|vela)$/.test(h)) return 'sail_number';
  if (/^(sailor|crew|helm|helmname|skipper|timonel|patron)$/.test(h)) return 'crew';
  if (/^(from|club)$/.test(h)) return 'club';
  if (/^(boat|boat name|barco)$/.test(h)) return 'boat';
  if (/^(nett|net)$/.test(h)) return 'net';
  if (/^(total|tot\.?|t)$/.test(h)) return 'total';
  return null;
}

export type ParsedEntry = {
  position: number | null;
  sail_number: string | null;
  crew: string | null;
  club: string | null;
  boat: string | null;
  race_scores: Record<string, string>;
  total: number | null;
  net: number | null;
  raw: Record<string, string>;
};

export function parseHtmlResults(html: string): ParsedEntry[] {
  const $ = cheerio.load(html);
  for (const table of $('table').toArray()) {
    const rows = $(table).find('tr').toArray();
    const headerCells = $(rows[0]).find('th').toArray().map((c) => clean($(c).text()));
    if (headerCells.length === 0) continue;
    const fields = headerCells.map(fieldOf);
    if (!fields.includes('position') || !fields.includes('race')) continue;

    const entries: ParsedEntry[] = [];
    for (const row of rows.slice(1)) {
      const cells = $(row).find('td').toArray().map((c) => clean($(c).text()));
      if (cells.length !== headerCells.length) continue;
      const e: ParsedEntry = { position: null, sail_number: null, crew: null, club: null, boat: null, race_scores: {}, total: null, net: null, raw: {} };
      cells.forEach((v, i) => {
        e.raw[headerCells[i]] = v;
        const f = fields[i];
        if (f === 'race') e.race_scores[headerCells[i]] = v;
        else if (f === 'position') e.position = /^\d+$/.test(v) ? Number(v) : null;
        else if (f === 'total' || f === 'net') e[f] = v !== '' && !isNaN(Number(v)) ? Number(v) : null;
        else if (f) e[f] = v || null;
      });
      entries.push(e);
    }
    if (entries.length) return entries;
  }
  return [];
}

async function main() {
  const { data: docs, error } = await supabase.from('result_documents').select('id,title,storage_path').like('storage_path', '%.html');
  if (error) throw new Error(error.message);
  let parsed = 0, empty = 0, total = 0;
  for (const d of docs) {
    const html = readFileSync(`data/files/${d.storage_path}`, 'latin1');
    const entries = parseHtmlResults(html);
    if (!entries.length) {
      empty++;
      console.warn('no table parsed:', d.title);
      continue;
    }
    const del = await supabase.from('entries').delete().eq('document_id', d.id);
    if (del.error) throw new Error(del.error.message);
    const ins = await supabase.from('entries').insert(entries.map((e) => ({ document_id: d.id, ...e })));
    if (ins.error) throw new Error(ins.error.message);
    parsed++;
    total += entries.length;
  }
  console.log(`parsed ${parsed} documents (${total} entries), empty ${empty}`);
}

if (process.argv[1]?.includes('parse-html')) main().catch((e) => { console.error(e.message); process.exit(1); });
