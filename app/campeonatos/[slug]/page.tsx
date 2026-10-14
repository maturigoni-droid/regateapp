import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase, formatDates, documentUrl } from '@/lib/supabase';

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
  const { data: entryRows } = ids.length
    ? await supabase
        .from('entries')
        .select('document_id,position,sail_number,crew,club,boat,race_scores,total,net')
        .in('document_id', ids)
        .order('position')
        .limit(5000)
    : { data: [] };
  const entriesByDoc = new Map<string, NonNullable<typeof entryRows>>();
  for (const e of entryRows ?? []) entriesByDoc.set(e.document_id, [...(entriesByDoc.get(e.document_id) ?? []), e]);

  const groups = new Map<string, NonNullable<typeof docs>>();
  for (const d of docs ?? []) {
    const name = (d.classes as unknown as { name: string } | null)?.name ?? 'General';
    groups.set(name, [...(groups.get(name) ?? []), d]);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/" className="text-sm text-sky-700 hover:underline">← Todos los campeonatos</Link>
      <h1 className="mt-3 text-2xl font-bold">{c.name}</h1>
      <p className="text-neutral-600">{c.club} · {formatDates(c.start_date, c.end_date)} {c.year}</p>
      {c.source_url && (
        <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="text-sm text-sky-700 hover:underline">
          Ver en Viramos
        </a>
      )}

      {groups.size === 0 && <p className="mt-6 text-neutral-500">Todavía no hay resultados publicados.</p>}
      {[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, items]) => (
        <section key={name} className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">{name}</h2>
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
            {items.map((d) => {
              const rows = entriesByDoc.get(d.id) ?? [];
              const raceKeys = rows.length ? Object.keys(rows[0].race_scores ?? {}) : [];
              return (
                <li key={d.id}>
                  <div className="flex justify-between gap-3 px-4 py-2">
                    <span>{d.title}</span>
                    <a href={documentUrl(d)} target="_blank" rel="noopener noreferrer" className="shrink-0 text-sm text-sky-700 hover:underline">
                      Original ↗
                    </a>
                  </div>
                  {rows.length > 0 && (
                    <details className="border-t border-neutral-100 px-4 py-2">
                      <summary className="cursor-pointer text-sm text-neutral-600">Ver posiciones ({rows.length})</summary>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-neutral-200 text-neutral-500">
                              <th className="py-1 pr-2">Pos</th>
                              <th className="pr-2">Vela</th>
                              <th className="pr-2">Timonel / tripulación</th>
                              <th className="pr-2">Club</th>
                              {raceKeys.map((k) => (
                                <th key={k} className="pr-2 text-right">R{k.replace(/^r/i, '')}</th>
                              ))}
                              <th className="text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, i) => (
                              <tr key={i} className="border-b border-neutral-100">
                                <td className="py-1 pr-2">{r.position}</td>
                                <td className="pr-2">{r.sail_number}</td>
                                <td className="pr-2">{r.crew}</td>
                                <td className="pr-2">{r.club}</td>
                                {raceKeys.map((k) => (
                                  <td key={k} className="pr-2 text-right">{(r.race_scores as Record<string, string>)?.[k]}</td>
                                ))}
                                <td className="text-right font-medium">{r.net ?? r.total}</td>
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
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl px-4 py-8 text-neutral-500">Cargando…</main>}>
      <Content params={props.params} />
    </Suspense>
  );
}
