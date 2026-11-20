-- Keep existing starting amounts and browser-import behavior.
alter table public.expense_budgets
  add column spending_limit_cents bigint,
  add column allocations jsonb not null default '[]'::jsonb,
  add constraint expense_budget_spending_limit
    check (spending_limit_cents between 0 and amount_cents);

create function public.valid_expense_budget_allocations(budget_month text, spending_limit bigint, items jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  name_key text;
  names text[] := '{}';
  cents numeric;
  allocated numeric := 0;
  month_days integer;
begin
  if jsonb_typeof(items) <> 'array' then return false; end if;
  if jsonb_array_length(items) = 0 then return true; end if;
  if spending_limit is null or jsonb_array_length(items) > 50 then return false; end if;
  month_days := extract(day from make_date(left(budget_month, 4)::int, right(budget_month, 2)::int, 1)
    + interval '1 month - 1 day');

  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'cadence') is distinct from 'string'
      or jsonb_typeof(item->'cents') is distinct from 'number'
      or item->>'cadence' not in ('monthly', 'daily')
      or char_length(item->>'name') > 100 then return false; end if;
    name_key := lower(regexp_replace(item->>'name', '^[[:space:]]+|[[:space:]]+$', '', 'g'));
    if name_key = '' or name_key = any(names) then return false; end if;
    names := array_append(names, name_key);
    cents := (item->>'cents')::numeric;
    if cents <> trunc(cents) or cents < 0 or cents > 99999999999 then return false; end if;
    allocated := allocated + cents * case when item->>'cadence' = 'daily' then month_days else 1 end;
  end loop;
  return allocated <= spending_limit;
end;
$$;

revoke all on function public.valid_expense_budget_allocations(text, bigint, jsonb) from public, anon;
grant execute on function public.valid_expense_budget_allocations(text, bigint, jsonb) to authenticated;

alter table public.expense_budgets
  add constraint expense_budget_allocations
    check (public.valid_expense_budget_allocations(month, spending_limit_cents, allocations));
