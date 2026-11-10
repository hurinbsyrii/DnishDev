create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  client text not null check (length(btrim(client)) between 1 and 120),
  category text not null check (length(btrim(category)) between 1 and 60),
  price_cents integer not null check (price_cents between 0 and 999999999),
  deposit_cents integer not null default 0 check (deposit_cents between 0 and price_cents),
  deposit_date date,
  cost_cents integer not null default 0 check (cost_cents between 0 and 999999999),
  cost_date date,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  completed_date date,
  paid_date date,
  published_date date,
  version integer not null default 1,
  check ((deposit_cents > 0) = (deposit_date is not null)),
  check ((cost_cents > 0) = (cost_date is not null)),
  check (paid_date is null or (completed_date is not null and paid_date >= completed_date
    and (deposit_date is null or paid_date >= deposit_date))),
  check (published_date is null or (paid_date is not null and published_date >= paid_date))
);

create index projects_user_id_idx on public.projects (user_id);
alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
grant select, insert, update, delete on public.projects to authenticated;

create policy "Read own projects" on public.projects for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own projects" on public.projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own projects" on public.projects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own projects" on public.projects for delete to authenticated using ((select auth.uid()) = user_id);

create function public.advance_project_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger advance_project_version before update on public.projects
for each row execute function public.advance_project_version();

alter publication supabase_realtime add table public.projects;
