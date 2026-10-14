import { Suspense } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { crewKeys, displayNameFor, queryTokens } from '@/lib/names';

type Search = { [key: string]: string | string[] | undefined };

type Row = {
  position: number | null;
  sail_number: string | null;
  crew: string | null;
  club: string | null;
  result_documents: {
    title: string;
    published_at: string | null;
    classes: { name: string } | null;
    championships: { slug: string; name: string; year: number | null; start_date: string | null };
  };
};

type Person = { key: string; rows: Row[] };

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());

const when = (r: Row) => r.result_documents.championships.start_date ?? r.result_documents.published_at ?? '';

async function Content({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const raw = sp.q;
  const q = ((Array.isArray(raw) ? raw[0] : raw) ?? '').trim();

  let people: { key: string; name: string; championships: number; clubs: string[]; latest: Row }[] = [];
  if (q.length >= 3) {
    const { data } = await supabase
      .from('entries')
      .select('position,sail_number,crew,club,result_documents!inner(title,published_at,classes(name),championships!inner(slug,name,year,start_date))')
      .ilike('crew', `%${q}%`)
      .limit(1000);

    // One entry per person (not per sail number or championship): group the rows by person key.
    const tokens = queryTokens(q);
    const byKey = new Map<string, Person>();
    for (const r of (data ?? []) as unknown as Row[]) {
      const key = crewKeys(r.crew).find((k) => tokens.every((t) => k.split('-').some((w) => w.startsWith(t))));
      if (!key) continue;
      const p = byKey.get(key) ?? { key, rows: [] };
      p.rows.push(r);
      byKey.set(key, p);
    }

    people = [...byKey.values()]
      .map((p) => {
        const latest = [...p.rows].sort((a, b) => when(b).localeCompare(when(a)))[0];
        const clubCount = new Map<string, number>();
        for (const r of p.rows) if (r.club) clubCount.set(r.club, (clubCount.get(r.club) ?? 0) + 1);
        return {
          key: p.key,
          name: titleCase(displayNameFor(latest.crew, p.key) ?? p.key.split('-').join(' ')),
          championships: new Set(p.rows.map((r) => r.result_documents.championships.slug)).size,
          clubs: [...clubCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c),
          latest,
        };
      })
      .sort((a, b) => b.championships - a.championships || when(b.latest).localeCompare(when(a.latest)))
      .slice(0, 50);
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
      {q.length >= 3 && <p className="mb-3 mt-8 text-sm text-muted">{people.length} {people.length === 1 ? 'persona' : 'personas'}</p>}
      {people.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {people.map((p) => {
            const c = p.latest.result_documents.championships;
            return (
              <li key={p.key} className="border-b border-line last:border-b-0">
                <Link href={`/timoneles/${p.key}`} className="group block px-5 py-4 transition-colors hover:bg-accent-soft">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium tracking-tight group-hover:text-accent">{p.name}</span>
                    <span className="shrink-0 text-sm text-accent">Ver progresión →</span>
                  </div>
                  <div className="mt-0.5 text-sm tabular-nums text-muted">
                    {p.championships} {p.championships === 1 ? 'campeonato' : 'campeonatos'}
                    {p.clubs.length > 0 && ` · ${p.clubs.join(' / ')}`}
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    Último: {c.name} ({p.latest.result_documents.classes?.name ?? '—'}), puesto {p.latest.position}
                  </div>
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
