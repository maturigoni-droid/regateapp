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
            {items.map((d) => (
              <li key={d.id}>
                <a href={documentUrl(d)} target="_blank" rel="noopener noreferrer" className="flex justify-between gap-3 px-4 py-2 hover:bg-neutral-50">
                  <span>{d.title}</span>
                  <span className="shrink-0 text-sm text-neutral-500">PDF ↗</span>
                </a>
              </li>
            ))}
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
