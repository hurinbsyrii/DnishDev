create table public.tasks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null default gen_random_uuid()::text check (length(id) between 1 and 120),
  title text not null check (length(btrim(title)) between 1 and 160),
  notes text not null default '' check (length(notes) <= 3000),
  status text not null default 'todo' check (status in ('todo', 'progress', 'done')),
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High')),
  due date,
  due_time text check (due_time is null or due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  column_entered_at bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint check (column_entered_at between 0 and 9007199254740991),
  version integer not null default 1,
  primary key (user_id, id),
  check (due_time is null or due is not null)
);
alter table public.tasks enable row level security;
revoke all on public.tasks from anon, authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
create policy "Read own tasks" on public.tasks for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own tasks" on public.tasks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own tasks" on public.tasks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own tasks" on public.tasks for delete to authenticated using ((select auth.uid()) = user_id);
create trigger advance_task_version before update on public.tasks
for each row execute function public.advance_project_version();

-- Server receipts make retries safe, even after an imported task is deleted.
create table public.task_browser_imports (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  import_key text not null check (length(import_key) = 64),
  primary key (user_id, import_key)
);
alter table public.task_browser_imports enable row level security;
revoke all on public.task_browser_imports from anon, authenticated;
grant select, insert on public.task_browser_imports to authenticated;
create policy "Read own task imports" on public.task_browser_imports for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own task imports" on public.task_browser_imports for insert to authenticated with check ((select auth.uid()) = user_id);

create function public.import_browser_tasks(p_import_key text, p_tasks jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to import tasks.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if exists (select 1 from public.task_browser_imports where user_id = auth.uid() and import_key = p_import_key) then return; end if;
  insert into public.tasks (id, title, notes, status, priority, due, due_time, column_entered_at)
    select id, title, notes, status, priority, due, due_time, column_entered_at
    from jsonb_to_recordset(p_tasks) as t(id text, title text, notes text, status text, priority text, due date, due_time text, column_entered_at bigint)
    on conflict (user_id, id) do nothing;
  insert into public.task_browser_imports (import_key) values (p_import_key);
end;
$$;
revoke all on function public.import_browser_tasks(text, jsonb) from public, anon;
grant execute on function public.import_browser_tasks(text, jsonb) to authenticated;
alter publication supabase_realtime add table public.tasks;
