import { Suspense } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { crewKeys, queryTokens } from '@/lib/names';

type Search = { [key: string]: string | string[] | undefined };

type Row = {
  position: number | null;
  sail_number: string | null;
  crew: string | null;
  club: string | null;
  total: number | null;
  net: number | null;
  result_documents: {
    title: string;
    published_at: string | null;
    classes: { name: string } | null;
    championships: { slug: string; name: string; year: number | null };
  };
};

async function Content({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const raw = sp.q;
  const q = ((Array.isArray(raw) ? raw[0] : raw) ?? '').trim();

  let rows: Row[] = [];
  if (q.length >= 3) {
    const { data } = await supabase
      .from('entries')
      .select('position,sail_number,crew,club,total,net,result_documents!inner(title,published_at,classes(name),championships!inner(slug,name,year))')
      .ilike('crew', `%${q}%`)
      .limit(500);
    // A championship publishes many versions of the same standings (provisional, per day, v2, v3...).
    // Keep only the latest version per person and championship.
    const latest = new Map<string, Row>();
    for (const r of (data ?? []) as unknown as Row[]) {
      const key = [r.result_documents.championships.slug, (r.crew ?? '').toLowerCase(), r.sail_number ?? ''].join('|');
      const cur = latest.get(key);
      if (!cur || (r.result_documents.published_at ?? '') > (cur.result_documents.published_at ?? '')) latest.set(key, r);
    }
    rows = [...latest.values()]
      .sort((a, b) => (b.result_documents.published_at ?? '').localeCompare(a.result_documents.published_at ?? ''))
      .slice(0, 100);
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 pb-16 pt-12">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Buscar timonel</h1>
      <p className="mt-3 text-muted">Encontrá a un timonel o tripulante en todos los resultados disponibles.</p>
      <form className="mt-6 flex gap-2.5">
        <input
          name="q"
          defaultValue={q}
          placeholder="Apellido o nombre (mín. 3 letras)"
          className="h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-accent"
        />
        <button className="h-10 rounded-lg bg-ink px-5 text-sm font-medium text-bg transition-opacity hover:opacity-85">Buscar</button>
      </form>
      <p className="mt-2 text-xs text-muted">Incluye solo las tablas que pudimos leer; el resto está como PDF en cada campeonato.</p>
      {q.length >= 3 && <p className="mb-3 mt-8 text-sm text-muted">{rows.length} resultados</p>}
      {rows.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((r, i) => {
            const keys = crewKeys(r.crew);
            const tokens = queryTokens(q);
            const key = keys.find((k) => tokens.every((t) => k.split('-').some((w) => w.startsWith(t)))) ?? keys[0];
            return (
            <li key={i} className="border-b border-line px-5 py-4 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium tracking-tight">{r.crew}</span>
                {key && (
                  <Link href={`/timoneles/${key}`} className="shrink-0 text-sm text-accent hover:underline">
                    Ver progresión →
                  </Link>
                )}
              </div>
              <div className="mt-0.5 text-sm tabular-nums text-muted">
                Puesto {r.position} · Vela {r.sail_number} · {r.club} · Total {r.net ?? r.total}
              </div>
              <Link href={`/campeonatos/${r.result_documents.championships.slug}`} className="mt-1.5 inline-block text-sm text-accent hover:underline">
                {r.result_documents.championships.name} ({r.result_documents.classes?.name ?? r.result_documents.title})
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

export default function Buscar({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-4xl px-5 py-12 text-muted">Cargando…</main>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
