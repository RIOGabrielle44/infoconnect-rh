
-- InfoConnect RH - données de départ et nomination d'un admin
-- 1) Créez d'abord votre compte via l'application.
-- 2) Remplacez admin@entreprise.fr par votre email.
-- 3) Exécutez ce script.

update public.profiles
set role = 'admin'
where id = (
  select id from auth.users where email = 'admin@entreprise.fr' limit 1
);

insert into public.channels (title, slug, description, color, created_by)
select 'Infos RH', 'infos-rh', 'Paie, congés, intégration, mobilité interne', '#2563eb', id from public.profiles where role = 'admin' limit 1
on conflict (slug) do nothing;
insert into public.channels (title, slug, description, color, created_by)
select 'QVT & Vie au travail', 'qvt-vie-au-travail', 'Bien-être, événements, enquêtes internes', '#059669', id from public.profiles where role = 'admin' limit 1
on conflict (slug) do nothing;
insert into public.channels (title, slug, description, color, created_by)
select 'Sécurité', 'securite', 'Consignes, alertes, procédures terrain', '#ea580c', id from public.profiles where role = 'admin' limit 1
on conflict (slug) do nothing;
insert into public.channels (title, slug, description, color, created_by)
select 'Formation', 'formation', 'Modules, supports, quiz et ressources', '#7c3aed', id from public.profiles where role = 'admin' limit 1
on conflict (slug) do nothing;
