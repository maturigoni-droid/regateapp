import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { crewKeys } from '../lib/names';

config({ path: '.env.local' });

// Fills entries.crew_keys for rows that don't have it yet. Safe to re-run.
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let done = 0;
  for (;;) {
    const { data, error } = await supabase.from('entries').select('id,crew').is('crew_keys', null).limit(500);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    // Few parallel requests at a time: Supabase answers 429 when too many connections are open.
    let next = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (next < data.length) {
          const r = data[next++];
          const res = await supabase.from('entries').update({ crew_keys: crewKeys(r.crew) }).eq('id', r.id);
          if (res.error) throw new Error(res.error.message);
        }
      }),
    );
    done += data.length;
  }
  console.log(`crew_keys filled for ${done} entries`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
