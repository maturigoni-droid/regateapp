import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false } },
);

export type Championship = {
  id: string;
  slug: string;
  name: string;
  club: string | null;
  year: number | null;
  start_date: string | null;
  end_date: string | null;
  source_url: string | null;
};

export function formatDates(start: string | null, end: string | null) {
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  if (!start) return '';
  return end && end !== start ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

// Link to our own copy of a document. HTML documents are not linked: their data lives in the database.
export function documentUrl(d: { storage_path: string | null }): string | null {
  if (!d.storage_path || d.storage_path.endsWith('.html')) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/results/${d.storage_path}`;
}
