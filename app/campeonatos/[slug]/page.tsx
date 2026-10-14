import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase, formatDates, documentUrl } from '@/lib/supabase';

type EntryRow = {
  document_id: string;
  position: number | null;
  sail_number: string | null;
  crew: string | null;
  club: string | null;
  boat: string | null;
  race_scores: Record<string, string> | null;
  total: number | null;
  net: number | null;
};

const PAGE = 1000;

// Supabase returns at most 1000 rows per request, so page through the results.
async function fetchEntries(ids: string[]): Promise<EntryRow[]> {
  const rows: EntryRow[] = [];
  if (ids.length === 0) return rows;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from('entries')
      .select('document_id,position,sail_number,crew,club,boat,race_scores,total,net')
      .in('document_id', ids)
      .order('document_id')
      .order('position')
      .order('id')
      .range(from, from + PAGE - 1);
    rows.push(...((data ?? []) as EntryRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: c } = await supabase.from('championships').select('*').eq('slug', slug).maybeSingle();
  if (!c) notFound();

  const { data: docs } = await supabase
    .from('result_documents')
    .select('id,title,source_url,storage_path,published_at,classes(name)')
    .eq('championship_id', c.id)
    .order('published_at', { ascending: false });

  const ids = (docs ?? []).map((d) => d.id);
  const entryRows = await fetchEntries(ids);
  const entriesByDoc = new Map<string, NonNullable<typeof entryRows>>();
  for (const e of entryRows ?? []) entriesByDoc.set(e.document_id, [...(entriesByDoc.get(e.document_id) ?? []), e]);

  const groups = new Map<string, NonNullable<typeof docs>>();
  for (const d of docs ?? []) {
    const name = (d.classes as unknown as { name: string } | null)?.name ?? 'General';
    groups.set(name, [...(groups.get(name) ?? []), d]);
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 pb-16 pt-10">
      <Link href="/" className="text-sm text-muted transition-colors hover:text-ink">← Campeonatos</Link>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">{c.name}</h1>
      <p className="mt-2 text-muted">
        {c.club} · {formatDates(c.start_date, c.end_date)} {c.year}
        {c.source_url && (
          <>
            {' · '}
            <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Ver en Viramos</a>
          </>
        )}
      </p>

      {groups.size === 0 && <p className="mt-10 text-muted">Todavía no hay resultados publicados.</p>}
      {[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, items]) => (
        <section key={name} className="mt-10">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">{name}</h2>
          <ul className="overflow-hidden rounded-xl border border-line bg-surface">
            {items.map((d) => {
              const rows = entriesByDoc.get(d.id) ?? [];
              const raceKeys = rows.length ? Object.keys(rows[0].race_scores ?? {}) : [];
              return (
                <li key={d.id} className="border-b border-line last:border-b-0">
                  <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <span className="font-medium tracking-tight">{d.title}</span>
                    <a href={documentUrl(d)} target="_blank" rel="noopener noreferrer" className="shrink-0 text-sm text-accent hover:underline">
                      Original ↗
                    </a>
                  </div>
                  {rows.length > 0 && (
                    <details className="group border-t border-line">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-2.5 text-sm text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
                        <span className="inline-block transition-transform group-open:rotate-90">›</span>
                        Posiciones ({rows.length})
                      </summary>
                      <div className="overflow-x-auto px-5 pb-4">
                        <table className="w-full min-w-[40rem] text-left text-sm tabular-nums">
                          <thead>
                            <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                              <th className="py-2 pr-3 font-medium">Pos</th>
                              <th className="pr-3 font-medium">Vela</th>
                              <th className="pr-3 font-medium">Timonel / tripulación</th>
                              <th className="pr-3 font-medium">Club</th>
                              {raceKeys.map((k) => (
                                <th key={k} className="pr-3 text-right font-medium">R{k.replace(/^r/i, '')}</th>
                              ))}
                              <th className="text-right font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, i) => (
                              <tr key={i} className="border-b border-line/60 last:border-b-0">
                                <td className="py-2 pr-3 font-medium">{r.position}</td>
                                <td className="pr-3 text-muted">{r.sail_number}</td>
                                <td className="pr-3">{r.boat ? <><span className="font-medium">{r.boat}</span>{r.crew ? <span className="text-muted"> · {r.crew}</span> : null}</> : r.crew}</td>
                                <td className="pr-3 text-muted">{r.club}</td>
                                {raceKeys.map((k) => (
                                  <td key={k} className="pr-3 text-right text-muted">{(r.race_scores as Record<string, string>)?.[k]}</td>
                                ))}
                                <td className="text-right font-semibold">{r.net ?? r.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}

export default function ChampionshipPage(props: PageProps<'/campeonatos/[slug]'>) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-4xl px-5 py-10 text-muted">Cargando…</main>}>
      <Content params={props.params} />
    </Suspense>
  );
}
