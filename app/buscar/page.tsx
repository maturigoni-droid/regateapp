import { Suspense } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

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
      .select('position,sail_number,crew,club,total,net,result_documents!inner(title,classes(name),championships!inner(slug,name,year))')
      .ilike('crew', `%${q}%`)
      .limit(100);
    rows = (data ?? []) as unknown as Row[];
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <Link href="/" className="text-sm text-sky-700 hover:underline">← Campeonatos</Link>
      <h1 className="mt-3 text-2xl font-bold">Buscar timonel o tripulante</h1>
      <form className="mt-4 flex gap-3">
        <input name="q" defaultValue={q} placeholder="Apellido o nombre (mín. 3 letras)" className="flex-1 rounded border border-neutral-300 px-3 py-2" />
        <button className="rounded bg-sky-700 px-4 py-2 font-medium text-white hover:bg-sky-800">Buscar</button>
      </form>
      <p className="mt-2 text-xs text-neutral-500">Solo incluye resultados cuyas tablas pudimos leer; el resto está como PDF en cada campeonato.</p>
      {q.length >= 3 && <p className="mt-4 text-sm text-neutral-500">{rows.length} resultados</p>}
      <ul className="mt-2 divide-y divide-neutral-200 rounded border border-neutral-200">
        {rows.map((r, i) => (
          <li key={i} className="px-4 py-3">
            <div className="font-medium">{r.crew}</div>
            <div className="text-sm text-neutral-600">
              Puesto {r.position} · Vela {r.sail_number} · {r.club} · Total {r.net ?? r.total}
            </div>
            <Link href={`/campeonatos/${r.result_documents.championships.slug}`} className="text-sm text-sky-700 hover:underline">
              {r.result_documents.championships.name} ({r.result_documents.classes?.name ?? r.result_documents.title})
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function Buscar({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-4xl px-4 py-8 text-neutral-500">Cargando…</main>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
