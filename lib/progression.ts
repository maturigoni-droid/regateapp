import { supabase } from '@/lib/supabase';

export const PROGRESS_SELECT =
  'position,sail_number,crew,boat,club,total,net,document_id,result_documents!inner(title,published_at,classes(name),championships!inner(slug,name,year,start_date))';

export type ProgressRow = {
  position: number | null;
  sail_number: string | null;
  crew: string | null;
  boat: string | null;
  club: string | null;
  total: number | null;
  net: number | null;
  document_id: string;
  result_documents: {
    title: string;
    published_at: string | null;
    classes: { name: string } | null;
    championships: { slug: string; name: string; year: number | null; start_date: string | null };
  };
};

export type ProgressResult = ProgressRow & { fleet: number | null };

/**
 * Turns the raw entries of a sailor or boat into one result per championship and class, oldest first.
 * A championship publishes many versions of the same standings (provisional, per day, v2...): keep the latest.
 * It is grouped by class, not by sail number, because sail numbers change between versions and regattas.
 */
export async function buildResults(rows: ProgressRow[]): Promise<ProgressResult[]> {
  const latest = new Map<string, ProgressRow>();
  for (const r of rows) {
    const k = [r.result_documents.championships.slug, r.result_documents.classes?.name ?? ''].join('|');
    const cur = latest.get(k);
    if (!cur || (r.result_documents.published_at ?? '') > (cur.result_documents.published_at ?? '')) latest.set(k, r);
  }
  const picked = [...latest.values()];

  // Fleet size of each standings document (a few requests at a time).
  const fleet = new Map<string, number>();
  const docIds = [...new Set(picked.map((r) => r.document_id))];
  let next = 0;
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      while (next < docIds.length) {
        const id = docIds[next++];
        const { count } = await supabase.from('entries').select('id', { count: 'exact', head: true }).eq('document_id', id);
        if (count != null) fleet.set(id, count);
      }
    }),
  );

  return picked
    .map((r) => ({ ...r, fleet: fleet.get(r.document_id) ?? null }))
    .sort((a, b) => (a.result_documents.championships.start_date ?? '9').localeCompare(b.result_documents.championships.start_date ?? '9'));
}
