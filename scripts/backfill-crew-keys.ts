import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { boatKey, crewKeys } from '../lib/names';

config({ path: '.env.local' });

// Fills entries.crew_keys (people) and entries.boat_key (boats) for rows that don't have them yet.
// Safe to re-run.
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Few parallel requests at a time: Supabase answers 429 when too many connections are open.
  async function runAll<T>(items: T[], fn: (item: T) => Promise<void>) {
    let next = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (next < items.length) await fn(items[next++]);
      }),
    );
  }

  let people = 0;
  for (;;) {
    const { data, error } = await supabase.from('entries').select('id,crew').is('crew_keys', null).limit(500);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    await runAll(data, async (r) => {
      const res = await supabase.from('entries').update({ crew_keys: crewKeys(r.crew) }).eq('id', r.id);
      if (res.error) throw new Error(res.error.message);
    });
    people += data.length;
  }

  // Boats: only rows that have a boat name and no key yet.
  let boats = 0;
  for (;;) {
    const { data, error } = await supabase.from('entries').select('id,boat').not('boat', 'is', null).is('boat_key', null).limit(500);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    await runAll(data, async (r) => {
      // Rows whose name yields no usable key get an empty string so they are not picked up again.
      const res = await supabase.from('entries').update({ boat_key: boatKey(r.boat) ?? '' }).eq('id', r.id);
      if (res.error) throw new Error(res.error.message);
    });
    boats += data.length;
  }
  console.log(`crew_keys filled for ${people} entries, boat_key for ${boats}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
