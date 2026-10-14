import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

async function main() {
  mkdirSync('data/files', { recursive: true });
  const { data } = await supabase.from('result_documents').select('storage_path').not('storage_path', 'is', null);
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < data!.length) {
        const p = data![next++].storage_path as string;
        if (existsSync('data/files/' + p)) continue;
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/results/${p}`);
        writeFileSync('data/files/' + p, Buffer.from(await res.arrayBuffer()));
      }
    }),
  );
  console.log('downloaded', data!.length);
}
main();
