import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

async function main() {
  const { data, error } = await supabase
    .from('result_documents')
    .select('id,title,storage_path,classes(name),championships(slug,name,year)')
    .like('storage_path', '%.pdf')
    .limit(2000);
  if (error) throw new Error(error.message);
  const has = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data: page } = await supabase.from('entries').select('document_id').order('id').range(from, from + 999);
    (page ?? []).forEach((r) => has.add(r.document_id));
    if (!page || page.length < 1000) break;
  }
  const docs = data.filter((d) => !has.has(d.id));
  writeFileSync('data/docs.json', JSON.stringify(docs, null, 1));
  console.log(`${docs.length} PDFs without entries`);
}
main();
