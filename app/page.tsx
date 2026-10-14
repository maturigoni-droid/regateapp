import { Suspense } from 'react';
import Link from 'next/link';
import { supabase, formatDates, type Championship } from '@/lib/supabase';

type Search = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

const field =
  'h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-accent';

async function Content({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const year = one(sp.year);
  const cls = one(sp.class);
  const q = one(sp.q).trim();

  const [{ data: classes }, { data: years }] = await Promise.all([
    supabase.from('classes').select('id,name').order('name'),
    supabase.from('championships').select('year').order('year', { ascending: false }),
  ]);
  const yearOptions = [...new Set((years ?? []).map((y) => y.year).filter(Boolean))];

  let ids: string[] | null = null;
  if (cls) {
    const { data } = await supabase.from('championship_classes').select('championship_id, classes!inner(name)').eq('classes.name', cls);
    ids = (data ?? []).map((r) => r.championship_id);
  }

  let query = supabase
    .from('championships')
    .select('*, championship_classes(classes(name)), result_documents(count)')
    .order('start_date', { ascending: false });
  if (year) query = query.eq('year', Number(year));
  if (q) query = query.ilike('name', `%${q}%`);
  if (ids) query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  const { data } = await query;
  const rows = (data ?? []) as (Championship & {
    championship_classes: { classes: { name: string } | null }[];
    result_documents: { count: number }[];
  })[];

  return (
    <main className="mx-auto w-full max-w-5xl px-5">
      <section className="pb-8 pt-14">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Resultados de regatas argentinas.</h1>
        <p className="mt-4 max-w-xl text-lg text-muted">Todas las clases, todos los campeonatos, en un solo lugar.</p>
      </section>

      <form className="flex flex-wrap gap-2.5">
        <input name="q" defaultValue={q} placeholder="Buscar campeonato" className={`${field} min-w-52 flex-1`} />
        <select name="year" defaultValue={year} className={field}>
          <option value="">Todos los años</option>
          {yearOptions.map((y) => (
            <option key={y} value={y!}>{y}</option>
          ))}
        </select>
        <select name="class" defaultValue={cls} className={field}>
          <option value="">Todas las clases</option>
          {(classes ?? []).map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <button className="h-10 rounded-lg bg-ink px-5 text-sm font-medium text-bg transition-opacity hover:opacity-85">Filtrar</button>
      </form>

      <p className="mb-3 mt-8 text-sm text-muted">{rows.length} campeonatos</p>
      <ul className="mb-16 overflow-hidden rounded-xl border border-line bg-surface">
        {rows.map((c) => {
          const names = [...new Set(c.championship_classes.map((x) => x.classes?.name).filter(Boolean))];
          const count = c.result_documents[0]?.count ?? 0;
          return (
            <li key={c.id} className="border-b border-line last:border-b-0">
              <Link href={`/campeonatos/${c.slug}`} className="group block px-5 py-4 transition-colors hover:bg-accent-soft">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium tracking-tight group-hover:text-accent">{c.name}</span>
                  <span className="text-sm tabular-nums text-muted">
                    {formatDates(c.start_date, c.end_date)} {c.year}
                  </span>
                </div>
                <div className="mt-0.5 text-sm text-muted">
                  {c.club} · {count} {count === 1 ? 'resultado' : 'resultados'}
                </div>
                {names.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {names.slice(0, 8).map((n) => (
                      <span key={n} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent">{n}</span>
                    ))}
                    {names.length > 8 && <span className="px-1 text-xs text-muted">+{names.length - 8}</span>}
                  </div>
                )}
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && <li className="px-5 py-10 text-center text-muted">Sin resultados para ese filtro.</li>}
      </ul>
    </main>
  );
}

export default function Home({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-5xl px-5 py-14 text-muted">Cargando…</main>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
