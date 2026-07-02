
-- InfoConnect RH - Row Level Security
-- À exécuter après 01-schema.sql.

alter table public.profiles enable row level security;
alter table public.channels enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.post_views enable row level security;
alter table public.poll_votes enable row level security;

-- Profiles
create policy "Profiles are readable by authenticated users"
on public.profiles for select
to authenticated
using (true);

create policy "Users can update their own profile name"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

create policy "Admins can update profiles"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Channels
create policy "Authenticated users can read channels"
on public.channels for select
to authenticated
using (true);

create policy "Admins can create channels"
on public.channels for insert
to authenticated
with check (public.is_admin());

create policy "Admins can update channels"
on public.channels for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete channels"
on public.channels for delete
to authenticated
using (public.is_admin());

-- Posts
create policy "Authenticated users can read posts"
on public.posts for select
to authenticated
using (true);

create policy "Admins can create posts"
on public.posts for insert
to authenticated
with check (public.is_admin() and author_id = auth.uid());

create policy "Admins can update posts"
on public.posts for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete posts"
on public.posts for delete
to authenticated
using (public.is_admin());

-- Comments
create policy "Authenticated users can read comments"
on public.comments for select
to authenticated
using (true);

create policy "Authenticated users can create comments"
on public.comments for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own comments"
on public.comments for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users or admins can delete comments"
on public.comments for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

-- Reactions
create policy "Authenticated users can read reactions"
on public.reactions for select
to authenticated
using (true);

create policy "Authenticated users can create their reactions"
on public.reactions for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can delete their reactions"
on public.reactions for delete
to authenticated
using (user_id = auth.uid());

-- Views
create policy "Authenticated users can insert their own views"
on public.post_views for insert
to authenticated
with check (user_id = auth.uid());

create policy "Admins can read views"
on public.post_views for select
to authenticated
using (public.is_admin());

-- Poll votes
create policy "Authenticated users can read poll votes aggregate source"
on public.poll_votes for select
to authenticated
using (true);

create policy "Authenticated users can vote once"
on public.poll_votes for insert
to authenticated
with check (user_id = auth.uid());

-- Storage policies for private bucket
create policy "Authenticated users can read publication files"
on storage.objects for select
to authenticated
using (bucket_id = 'publication-files');

create policy "Admins can upload publication files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'publication-files' and public.is_admin());

create policy "Admins can update publication files"
on storage.objects for update
to authenticated
using (bucket_id = 'publication-files' and public.is_admin())
with check (bucket_id = 'publication-files' and public.is_admin());

create policy "Admins can delete publication files"
on storage.objects for delete
to authenticated
using (bucket_id = 'publication-files' and public.is_admin());
