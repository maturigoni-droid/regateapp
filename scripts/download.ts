import { config } from 'dotenv';
import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

async function fetchWithRetry(url: string): Promise<Buffer> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error('Failed to download ' + url);
}

async function main() {
  mkdirSync('data/files', { recursive: true });
  const { data } = await supabase.from('result_documents').select('storage_path').not('storage_path', 'is', null);
  let next = 0;
  let fetched = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < data!.length) {
        const p = data![next++].storage_path as string;
        const file = 'data/files/' + p;
        // Drop leftovers from earlier runs that saved an error body instead of the document.
        if (existsSync(file) && statSync(file).size < 400) unlinkSync(file);
        if (existsSync(file)) continue;
        writeFileSync(file, await fetchWithRetry(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/results/${p}`));
        fetched++;
      }
    }),
  );
  console.log(`downloaded ${fetched} new files (${data!.length} documents total)`);
}
main();
