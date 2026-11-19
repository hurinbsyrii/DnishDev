-- Account-owned expenses and monthly starting balances.
create table public.expenses (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null default gen_random_uuid()::text check (length(id) between 1 and 120),
  title text not null check (length(btrim(title)) between 1 and 160),
  amount_cents bigint not null check (amount_cents between 1 and 99999999999),
  spent_on date not null,
  category text not null check (length(category) between 1 and 100),
  notes text not null default '' check (length(notes) <= 2000),
  version integer not null default 1,
  primary key (user_id, id)
);
create index expenses_by_date on public.expenses (user_id, spent_on);
create table public.expense_budgets (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount_cents bigint not null check (amount_cents between 0 and 99999999999),
  version integer not null default 1,
  primary key (user_id, month)
);
alter table public.expenses enable row level security;
alter table public.expense_budgets enable row level security;
revoke all on public.expenses, public.expense_budgets from anon, authenticated;
grant select, insert, update, delete on public.expenses, public.expense_budgets to authenticated;
create policy "Own expenses" on public.expenses for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own expense budgets" on public.expense_budgets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create trigger advance_expense_version before update on public.expenses for each row execute function public.advance_project_version();
create trigger advance_expense_budget_version before update on public.expense_budgets for each row execute function public.advance_project_version();

-- Per-record receipts prevent stale browser backups from restoring deleted entries.
create table public.expense_browser_imports (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('expense', 'budget')),
  record_id text not null check (length(record_id) between 1 and 120),
  primary key (user_id, kind, record_id)
);
alter table public.expense_browser_imports enable row level security;
revoke all on public.expense_browser_imports from anon, authenticated;
grant select, insert on public.expense_browser_imports to authenticated;
create policy "Read own expense imports" on public.expense_browser_imports for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own expense imports" on public.expense_browser_imports for insert to authenticated with check ((select auth.uid()) = user_id);
create function public.import_browser_expenses(p_expenses jsonb, p_budgets jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to import expenses.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  insert into public.expenses (id, title, amount_cents, spent_on, category, notes)
    select t.id, t.title, t.amount_cents, t.spent_on, t.category, t.notes
    from jsonb_to_recordset(p_expenses) as t(id text, title text, amount_cents bigint, spent_on date, category text, notes text)
    where not exists (select 1 from public.expense_browser_imports i where i.user_id = auth.uid() and i.kind = 'expense' and i.record_id = t.id)
    on conflict (user_id, id) do nothing;
  insert into public.expense_budgets (month, amount_cents)
    select t.month, t.amount_cents from jsonb_to_recordset(p_budgets) as t(month text, amount_cents bigint)
    where not exists (select 1 from public.expense_browser_imports i where i.user_id = auth.uid() and i.kind = 'budget' and i.record_id = t.month)
    on conflict (user_id, month) do nothing;
  insert into public.expense_browser_imports (kind, record_id)
    select 'expense', t.id from jsonb_to_recordset(p_expenses) as t(id text)
    union all select 'budget', t.month from jsonb_to_recordset(p_budgets) as t(month text)
    on conflict do nothing;
end;
$$;
revoke all on function public.import_browser_expenses(jsonb, jsonb) from public, anon;
grant execute on function public.import_browser_expenses(jsonb, jsonb) to authenticated;
alter publication supabase_realtime add table public.expenses, public.expense_budgets;
