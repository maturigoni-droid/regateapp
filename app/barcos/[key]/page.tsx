import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { buildResults, PROGRESS_SELECT, type ProgressRow } from '@/lib/progression';
import { ProgressionView } from '@/components/ProgressionView';

async function Content({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-z0-9-]{3,120}$/.test(key)) notFound();

  const { data } = await supabase
    .from('entries')
    .select(PROGRESS_SELECT)
    .eq('boat_key', key)
    .not('position', 'is', null)
    .limit(500);
  const rows = (data ?? []) as unknown as ProgressRow[];
  if (rows.length === 0) notFound();

  const results = await buildResults(rows);
  const name = results.map((r) => r.boat).find(Boolean) ?? key.split('-').join(' ');

  return (
    <ProgressionView
      title={name.toLowerCase()}
      subtitle="Progresión de puestos del barco en los campeonatos disponibles."
      results={results}
      showCrew
    />
  );
}

export default function BarcoPage(props: PageProps<'/barcos/[key]'>) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-4xl px-5 py-10 text-muted">Cargando…</main>}>
      <Content params={props.params} />
    </Suspense>
  );
}
