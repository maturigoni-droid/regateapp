import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const BUCKET = 'results';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase env vars in .env.local');
const supabase = createClient(url, key, { auth: { persistSession: false } });

const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

function sniff(buf: Buffer, headerType: string): { ext: string; type: string } {
  const head = buf.subarray(0, 16).toString('latin1');
  if (head.startsWith('%PDF')) return { ext: 'pdf', type: 'application/pdf' };
  if (/^\s*<(!doctype|html)/i.test(head)) return { ext: 'html', type: 'text/html' };
  if (head.startsWith('ÿØ')) return { ext: 'jpg', type: 'image/jpeg' };
  if (head.startsWith('PNG')) return { ext: 'png', type: 'image/png' };
  return { ext: EXT[headerType] ?? 'bin', type: headerType };
}

async function main() {
  const { error: bucketErr } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (bucketErr && !/already exists/i.test(bucketErr.message)) throw new Error('bucket: ' + bucketErr.message);

  const { data: docs, error } = await supabase.from('result_documents').select('id,source_url').is('storage_path', null);
  if (error) throw new Error(error.message);
  console.log(`${docs.length} documents to mirror`);

  let done = 0, failed = 0, next = 0;
  await Promise.all(
    // Few parallel downloads: some source sites sit behind rate limiting.
    Array.from({ length: 3 }, async () => {
      while (next < docs.length) {
        const d = docs[next++];
        try {
          let res = await fetch(d.source_url);
          for (let attempt = 1; !res.ok && attempt <= 3; attempt++) {
            await new Promise((r) => setTimeout(r, 1500 * attempt));
            res = await fetch(d.source_url);
          }
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const buf = Buffer.from(await res.arrayBuffer());
          const { ext, type } = sniff(buf, (res.headers.get('content-type') ?? '').split(';')[0]);
          const path = `${d.id}.${ext}`;
          const up = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: type || undefined, upsert: true });
          if (up.error) throw new Error(up.error.message);
          const upd = await supabase.from('result_documents').update({ storage_path: path }).eq('id', d.id);
          if (upd.error) throw new Error(upd.error.message);
          done++;
        } catch (e) {
          failed++;
          console.warn('failed', d.source_url, (e as Error).message);
        }
      }
    }),
  );
  console.log(`mirrored ${done}, failed ${failed}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
