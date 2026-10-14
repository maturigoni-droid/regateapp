import { Suspense } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { boatKey, crewKeys, displayNameFor, queryTokens } from '@/lib/names';

type Search = { [key: string]: string | string[] | undefined };

type Row = {
  position: number | null;
  sail_number: string | null;
  crew: string | null;
  boat: string | null;
  club: string | null;
  result_documents: {
    title: string;
    published_at: string | null;
    classes: { name: string } | null;
    championships: { slug: string; name: string; year: number | null; start_date: string | null };
  };
};

type Hit = {
  kind: 'person' | 'boat';
  key: string;
  name: string;
  championships: number;
  detail: string;
  latest: Row;
};

const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());

const when = (r: Row) => r.result_documents.championships.start_date ?? r.result_documents.published_at ?? '';
const matches = (key: string, tokens: string[]) => tokens.every((t) => key.split('-').some((w) => w.startsWith(t)));

function mostCommon(values: (string | null)[], n: number): string[] {
  const count = new Map<string, number>();
  for (const v of values) if (v) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v]) => v);
}

async function Content({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const raw = sp.q;
  const q = ((Array.isArray(raw) ? raw[0] : raw) ?? '').trim();

  let hits: Hit[] = [];
  if (q.length >= 3) {
    // Characters that have a meaning inside a PostgREST filter are dropped from the pattern.
    const pattern = q.replace(/[,()%*\\]/g, ' ').trim();
    const { data } = await supabase
      .from('entries')
      .select('position,sail_number,crew,boat,club,result_documents!inner(title,published_at,classes(name),championships!inner(slug,name,year,start_date))')
      .or(`crew.ilike.%${pattern}%,boat.ilike.%${pattern}%`)
      .limit(1000);

    // One hit per person and one per boat (not per sail number or championship).
    const tokens = queryTokens(q);
    const people = new Map<string, Row[]>();
    const boats = new Map<string, Row[]>();
    for (const r of (data ?? []) as unknown as Row[]) {
      const pk = crewKeys(r.crew).find((k) => matches(k, tokens));
      if (pk) people.set(pk, [...(people.get(pk) ?? []), r]);
      const bk = boatKey(r.boat);
      if (bk && matches(bk, tokens)) boats.set(bk, [...(boats.get(bk) ?? []), r]);
    }

    const latestOf = (rows: Row[]) => [...rows].sort((a, b) => when(b).localeCompare(when(a)))[0];
    const champs = (rows: Row[]) => new Set(rows.map((r) => r.result_documents.championships.slug)).size;

    for (const [key, rows] of people) {
      const latest = latestOf(rows);
      const clubs = mostCommon(rows.map((r) => r.club), 2);
      hits.push({
        kind: 'person',
        key,
        name: titleCase(displayNameFor(latest.crew, key) ?? key.split('-').join(' ')),
        championships: champs(rows),
        detail: clubs.join(' / '),
        latest,
      });
    }
    for (const [key, rows] of boats) {
      const latest = latestOf(rows);
      const skippers = mostCommon(rows.map((r) => r.crew), 1);
      hits.push({
        kind: 'boat',
        key,
        name: titleCase(latest.boat ?? key.split('-').join(' ')),
        championships: champs(rows),
        detail: skippers.length ? `Timonel / dueño: ${titleCase(skippers[0])}` : '',
        latest,
      });
    }
    hits = hits.sort((a, b) => b.championships - a.championships || when(b.latest).localeCompare(when(a.latest))).slice(0, 50);
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 pb-16 pt-12">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Buscar por timonel o barco</h1>
      <p className="mt-3 text-muted">Encontrá a un timonel, un tripulante o un barco en todos los resultados disponibles.</p>
      <form className="mt-6 flex gap-2.5">
        <input
          name="q"
          defaultValue={q}
          placeholder="Apellido, nombre o nombre del barco (mín. 3 letras)"
          className="h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-accent"
        />
        <button className="h-10 rounded-lg bg-ink px-5 text-sm font-medium text-bg transition-opacity hover:opacity-85">Buscar</button>
      </form>
      <p className="mt-2 text-xs text-muted">Incluye solo las tablas que pudimos leer; el resto está como PDF en cada campeonato.</p>
      {q.length >= 3 && <p className="mb-3 mt-8 text-sm text-muted">{hits.length} {hits.length === 1 ? 'resultado' : 'resultados'}</p>}
      {hits.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {hits.map((h) => {
            const c = h.latest.result_documents.championships;
            return (
              <li key={`${h.kind}-${h.key}`} className="border-b border-line last:border-b-0">
                <Link href={`/${h.kind === 'boat' ? 'barcos' : 'timoneles'}/${h.key}`} className="group block px-5 py-4 transition-colors hover:bg-accent-soft">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-baseline gap-2">
                      <span className="font-medium tracking-tight group-hover:text-accent">{h.name}</span>
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{h.kind === 'boat' ? 'Barco' : 'Timonel'}</span>
                    </span>
                    <span className="shrink-0 text-sm text-accent">Ver progresión →</span>
                  </div>
                  <div className="mt-0.5 text-sm tabular-nums text-muted">
                    {h.championships} {h.championships === 1 ? 'campeonato' : 'campeonatos'}
                    {h.detail && ` · ${h.detail}`}
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    Último: {c.name} ({h.latest.result_documents.classes?.name ?? '—'}), puesto {h.latest.position}
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
