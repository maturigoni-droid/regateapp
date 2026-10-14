import Link from 'next/link';
import { ProgressChart, type ChartPoint } from '@/components/ProgressChart';
import type { ProgressResult } from '@/lib/progression';

const shortDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }) : '';

export function ProgressionView({
  title,
  subtitle,
  results,
  showCrew = false,
}: {
  title: string;
  subtitle: string;
  results: ProgressResult[];
  /** Show the helm/owner column (useful for boats, whose crew can change). */
  showCrew?: boolean;
}) {
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
      <Link href="/buscar" className="text-sm text-muted transition-colors hover:text-ink">← Buscar</Link>
      <h1 className="mt-5 text-3xl font-semibold capitalize tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-muted">{subtitle}</p>

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
                {showCrew && <th className="pr-3 font-medium">Timonel / dueño</th>}
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
                    {showCrew && <td className="pr-3">{r.crew ?? '—'}</td>}
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
