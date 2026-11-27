-- Notepad-style money sheet: account balances, emergency money, and a plan for
-- what is left of this month's budget. One row per account owner.
-- The older expenses and expense_budgets tables are left untouched.
create function public.valid_money_items(items jsonb, is_plan boolean)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  ids text[] := '{}';
  cents numeric;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 50 then return false; end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'cents') is distinct from 'number'
      or char_length(item->>'id') not between 1 and 120
      or char_length(item->>'name') > 100
      or item->>'id' = any(ids) then return false; end if;
    if is_plan and jsonb_typeof(item->'daily') is distinct from 'boolean' then return false; end if;
    ids := array_append(ids, item->>'id');
    cents := (item->>'cents')::numeric;
    if cents <> trunc(cents) or cents < 0 or cents > 99999999999 then return false; end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.valid_money_items(jsonb, boolean) from public, anon;
grant execute on function public.valid_money_items(jsonb, boolean) to authenticated;

create table public.money_sheets (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  -- The month the current budget was started for, e.g. 2026-11.
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  budget_cents bigint not null check (budget_cents between 0 and 99999999999),
  -- Can be negative while a month has started but its income has not arrived yet.
  emergency_cents bigint not null check (emergency_cents between -99999999999 and 99999999999),
  accounts jsonb not null default '[]'::jsonb check (public.valid_money_items(accounts, false)),
  plan jsonb not null default '[]'::jsonb check (public.valid_money_items(plan, true)),
  version integer not null default 1
);

alter table public.money_sheets enable row level security;
revoke all on public.money_sheets from anon, authenticated;
grant select, insert, update, delete on public.money_sheets to authenticated;
create policy "Own money sheet" on public.money_sheets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create trigger advance_money_sheet_version before update on public.money_sheets
  for each row execute function public.advance_project_version();
alter publication supabase_realtime add table public.money_sheets;
