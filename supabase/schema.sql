-- RegateApp schema
create table if not exists championships (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  club text,
  country text,
  year int,
  start_date date,
  end_date date,
  source_url text,
  created_at timestamptz default now()
);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table if not exists championship_classes (
  championship_id uuid references championships(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  primary key (championship_id, class_id)
);

create table if not exists result_documents (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references championships(id) on delete cascade,
  class_id uuid references classes(id),
  title text not null,
  source_url text unique not null,
  storage_path text,
  published_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references result_documents(id) on delete cascade,
  position int,
  sail_number text,
  boat text,
  crew text,
  race_scores jsonb,
  total numeric,
  net numeric
);

create index if not exists championships_year_idx on championships(year);
create index if not exists result_documents_champ_idx on result_documents(championship_id);

alter table championships enable row level security;
alter table classes enable row level security;
alter table championship_classes enable row level security;
alter table result_documents enable row level security;
alter table entries enable row level security;

create policy "public read" on championships for select using (true);
create policy "public read" on classes for select using (true);
create policy "public read" on championship_classes for select using (true);
create policy "public read" on result_documents for select using (true);
create policy "public read" on entries for select using (true);

-- Added for parsed standings
alter table entries add column if not exists club text, add column if not exists raw jsonb;
