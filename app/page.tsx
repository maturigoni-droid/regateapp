import { Suspense } from 'react';
import Link from 'next/link';
import { supabase, formatDates, type Championship } from '@/lib/supabase';

type Search = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

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
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold">RegateApp</h1>
      <p className="mt-1 text-neutral-600">Resultados históricos de regatas de Argentina, de todas las clases.</p>

      <form className="mt-6 flex flex-wrap gap-3">
        <input name="q" defaultValue={q} placeholder="Buscar campeonato" className="min-w-48 flex-1 rounded border border-neutral-300 px-3 py-2" />
        <select name="year" defaultValue={year} className="rounded border border-neutral-300 px-3 py-2">
          <option value="">Todos los años</option>
          {yearOptions.map((y) => (
            <option key={y} value={y!}>{y}</option>
          ))}
        </select>
        <select name="class" defaultValue={cls} className="rounded border border-neutral-300 px-3 py-2">
          <option value="">Todas las clases</option>
          {(classes ?? []).map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <button className="rounded bg-sky-700 px-4 py-2 font-medium text-white hover:bg-sky-800">Filtrar</button>
      </form>

      <p className="mt-6 text-sm text-neutral-500">{rows.length} campeonatos</p>
      <ul className="mt-2 divide-y divide-neutral-200 rounded border border-neutral-200">
        {rows.map((c) => {
          const names = [...new Set(c.championship_classes.map((x) => x.classes?.name).filter(Boolean))];
          return (
            <li key={c.id}>
              <Link href={`/campeonatos/${c.slug}`} className="block px-4 py-3 hover:bg-neutral-50">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-sm text-neutral-500">{formatDates(c.start_date, c.end_date)} {c.year}</span>
                </div>
                <div className="text-sm text-neutral-600">
                  {c.club} · {c.result_documents[0]?.count ?? 0} resultados
                </div>
                {names.length > 0 && <div className="mt-1 text-xs text-neutral-500">{names.join(' · ')}</div>}
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && <li className="px-4 py-6 text-neutral-500">Sin resultados para ese filtro.</li>}
      </ul>
    </main>
  );
}

export default function Home({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-5xl px-4 py-8 text-neutral-500">Cargando…</main>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
