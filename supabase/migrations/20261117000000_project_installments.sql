-- Keep each additional payment on the versioned project so concurrent edits
-- use the existing optimistic locking and Realtime subscription.
alter table public.projects add column payments jsonb not null default '[]'::jsonb;

-- Preserve the amount and date of existing final payments.
update public.projects
set payments = jsonb_build_array(jsonb_build_object(
  'id', gen_random_uuid()::text,
  'amount_cents', price_cents - deposit_cents,
  'date', paid_date::text
))
where paid_date is not null and price_cents > deposit_cents;

-- Customers may finish paying before the work is completed.
do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.projects'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%paid_date%'
      and pg_get_constraintdef(oid) like '%completed_date%'
  loop
    execute format('alter table public.projects drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.projects add constraint published_project_complete
check (published_date is null or (completed_date is not null and published_date >= completed_date));

create function public.validate_project_payments()
returns trigger language plpgsql set search_path = '' as $$
declare
  payment jsonb;
  amount numeric;
  received bigint := new.deposit_cents;
  received_on date;
  last_received date := new.deposit_date;
  payment_ids text[] := array[]::text[];
begin
  if jsonb_typeof(new.payments) is distinct from 'array' then
    raise exception 'Payments must be an array.';
  end if;
  if new.deposit_date > (current_timestamp at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Payment dates cannot be in the future.';
  end if;
  for payment in select value from jsonb_array_elements(new.payments)
  loop
    if jsonb_typeof(payment) is distinct from 'object'
      or jsonb_typeof(payment->'amount_cents') is distinct from 'number'
      or jsonb_typeof(payment->'id') is distinct from 'string'
      or coalesce(payment->>'id', '') = ''
      or payment->>'id' = 'deposit'
      or (payment->>'id') = any(payment_ids)
      or jsonb_typeof(payment->'date') is distinct from 'string'
      or (payment->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Each payment needs a unique ID, an amount and a valid date.';
    end if;
    amount := (payment->>'amount_cents')::numeric;
    if amount <> trunc(amount) or amount <= 0 or amount > 999999999 then
      raise exception 'Payment amounts must be positive integer cents.';
    end if;
    received_on := (payment->>'date')::date;
    if received_on > (current_timestamp at time zone 'Asia/Kuala_Lumpur')::date then
      raise exception 'Payment dates cannot be in the future.';
    end if;
    payment_ids := array_append(payment_ids, payment->>'id');
    received := received + amount::bigint;
    last_received := greatest(last_received, received_on);
  end loop;
  if received > new.price_cents then
    raise exception 'Payments received cannot exceed the project price.';
  end if;
  new.paid_date := case when received = new.price_cents then coalesce(last_received, new.paid_date) else null end;
  return new;
end;
$$;

create trigger validate_project_payments before insert or update on public.projects
for each row execute function public.validate_project_payments();

-- A deposit covering the full price is also a fully paid project.
update public.projects set payments = payments
where price_cents > 0 and deposit_cents = price_cents and paid_date is null;
