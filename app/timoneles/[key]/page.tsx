import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { displayNameFor } from '@/lib/names';
import { ProgressChart, type ChartPoint } from '@/components/ProgressChart';

type Row = {
  position: number | null;
  sail_number: string | null;
  crew: string | null;
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

type Result = Row & { fleet: number | null };

const shortDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }) : '';

async function Content({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-z0-9-]{3,120}$/.test(key)) notFound();

  const { data } = await supabase
    .from('entries')
    .select(
      'position,sail_number,crew,club,total,net,document_id,result_documents!inner(title,published_at,classes(name),championships!inner(slug,name,year,start_date))',
    )
    .contains('crew_keys', [key])
    .not('position', 'is', null)
    .limit(500);
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) notFound();

  // A championship publishes many versions of the same standings; keep the latest per class.
  // Not per sail number: a sailor's sail number can change between versions and regattas.
  const latest = new Map<string, Row>();
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

  const results: Result[] = picked
    .map((r) => ({ ...r, fleet: fleet.get(r.document_id) ?? null }))
    .sort((a, b) => (a.result_documents.championships.start_date ?? '9').localeCompare(b.result_documents.championships.start_date ?? '9'));

  const name =
    results.map((r) => displayNameFor(r.crew, key)).find(Boolean) ?? key.split('-').join(' ');
  const positions = results.map((r) => r.position!);
  const best = Math.min(...positions);
  const last = results[results.length - 1];

  const points: ChartPoint[] = results.map((r) => ({
    label: shortDate(r.result_documents.championships.start_date),
    position: r.position!,
    tooltip: `${r.result_documents.championships.name} (${r.result_documents.classes?.name ?? '—'}): puesto ${r.position}${r.fleet ? ` de ${r.fleet}` : ''}`,
  }));

  return (
    <main className="mx-auto w-full max-w-4xl px-5 pb-16 pt-10">
      <Link href="/buscar" className="text-sm text-muted transition-colors hover:text-ink">← Buscar timonel</Link>
      <h1 className="mt-5 text-3xl font-semibold capitalize tracking-tight sm:text-4xl">{name.toLowerCase()}</h1>
      <p className="mt-2 text-muted">Progresión de puestos en los campeonatos disponibles.</p>

      <dl className="mt-8 grid grid-cols-3 gap-3">
        {[
          ['Campeonatos', String(results.length)],
          ['Mejor puesto', `${best}°`],
          ['Último puesto', `${last.position}°`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-8 rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">Puesto por campeonato</h2>
        {results.length > 1 ? (
          <ProgressChart points={points} />
        ) : (
          <p className="text-sm text-muted">Hace falta más de un campeonato para ver la progresión.</p>
        )}
      </section>

      <section className="mt-8 overflow-hidden rounded-xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="pr-3 font-medium">Campeonato</th>
                <th className="pr-3 font-medium">Clase</th>
                <th className="pr-3 font-medium">Puesto</th>
                <th className="pr-5 text-right font-medium">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const c = r.result_documents.championships;
                return (
                  <tr key={i} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3 text-muted">{shortDate(c.start_date)}</td>
                    <td className="pr-3">
                      <Link href={`/campeonatos/${c.slug}`} className="text-accent hover:underline">{c.name}</Link>
                    </td>
                    <td className="pr-3 text-muted">{r.result_documents.classes?.name ?? '—'}</td>
                    <td className="pr-3 font-medium">
                      {r.position}°{r.fleet ? <span className="font-normal text-muted"> de {r.fleet}</span> : null}
                    </td>
                    <td className="pr-5 text-right">{r.net ?? r.total ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default function TimonelPage(props: PageProps<'/timoneles/[key]'>) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-4xl px-5 py-10 text-muted">Cargando…</main>}>
      <Content params={props.params} />
    </Suspense>
  );
}
