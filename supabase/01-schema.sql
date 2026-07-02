
-- InfoConnect RH - schema Supabase production
-- À exécuter dans Supabase SQL Editor, dans l'ordre.

create extension if not exists pgcrypto;

create type public.user_role as enum ('employee', 'admin');
create type public.publication_format as enum ('PDF', 'Vidéo', 'Audio', 'Image', 'Texte', 'Questionnaire');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.user_role not null default 'employee',
  created_at timestamptz not null default now()
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text,
  color text not null default '#2563eb',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  title text not null,
  body text not null,
  format public.publication_format not null default 'Texte',
  pinned boolean not null default false,
  file_path text,
  file_name text,
  file_type text,
  file_size bigint,
  poll_question text,
  poll_options text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);

create table public.post_views (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index int not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), 'employee')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace view public.posts_with_stats
with (security_invoker = true)
as
select
  p.*,
  coalesce(v.view_count, 0) as view_count,
  coalesce(r.reaction_count, 0) as reaction_count,
  coalesce(c.comment_count, 0) as comment_count,
  coalesce(cm.comments, '[]'::jsonb) as comments,
  coalesce(pv.poll_results, '[]'::jsonb) as poll_results
from public.posts p
left join (
  select post_id, count(*)::int as view_count from public.post_views group by post_id
) v on v.post_id = p.id
left join (
  select post_id, count(*)::int as reaction_count from public.reactions group by post_id
) r on r.post_id = p.id
left join (
  select post_id, count(*)::int as comment_count from public.comments group by post_id
) c on c.post_id = p.id
left join (
  select co.post_id, jsonb_agg(jsonb_build_object('id', co.id, 'body', co.body, 'created_at', co.created_at, 'full_name', pr.full_name) order by co.created_at asc) as comments
  from public.comments co
  left join public.profiles pr on pr.id = co.user_id
  group by co.post_id
) cm on cm.post_id = p.id
left join (
  select post_id, jsonb_agg(jsonb_build_object('option_index', option_index, 'votes', votes) order by option_index) as poll_results
  from (
    select post_id, option_index, count(*)::int as votes from public.poll_votes group by post_id, option_index
  ) x
  group by post_id
) pv on pv.post_id = p.id;

-- Storage bucket privé pour les fichiers de publication
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'publication-files',
  'publication-files',
  false,
  52428800,
  array['application/pdf','image/png','image/jpeg','image/webp','video/mp4','audio/mpeg','audio/mp4','audio/wav','audio/ogg']
)
on conflict (id) do nothing;
