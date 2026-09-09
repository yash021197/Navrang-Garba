create extension if not exists pgcrypto;

create table public.event_days (
  id uuid primary key default gen_random_uuid(),
  day_number smallint not null unique check (day_number between 1 and 10),
  name text not null unique,
  event_date date,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('SINGLE', 'COUPLE', 'GROUP_OF_4')),
  name text not null unique,
  description text not null,
  capacity smallint not null check (capacity between 1 and 4),
  price numeric(12,2) not null default 0 check (price >= 0),
  currency char(3) not null default 'INR' check (currency = upper(currency)),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  mobile text not null check (mobile ~ '^[0-9+ -]{7,20}$'),
  email text check (email is null or char_length(email) <= 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique check (booking_reference ~ '^BOOK-[A-Z0-9]{8,32}$'),
  customer_id uuid not null references public.customers(id) on delete restrict,
  event_day_id uuid not null references public.event_days(id) on delete restrict,
  ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
  quantity smallint not null check (quantity > 0 and quantity <= 20),
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null default 'INR' check (currency = upper(currency)),
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_day_id, ticket_type_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  provider text not null,
  provider_order_id text,
  provider_payment_id text,
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null default 'INR' check (currency = upper(currency)),
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_order_id),
  unique (provider, provider_payment_id)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  event_day_id uuid not null,
  ticket_type_id uuid not null,
  ticket_reference text not null unique check (ticket_reference ~ '^TKT-[A-Z0-9]{8,32}$'),
  ticket_token uuid not null unique default gen_random_uuid(),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'USED', 'CANCELLED')),
  scanned_at timestamptz,
  scanned_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (booking_id, event_day_id, ticket_type_id) references public.bookings(id, event_day_id, ticket_type_id) on delete restrict,
  check ((status = 'USED') = (scanned_at is not null))
);

create table public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete restrict,
  scanned_by uuid,
  result text not null check (result in ('SUCCESS', 'ALREADY_USED', 'CANCELLED', 'INVALID', 'PAYMENT_NOT_COMPLETED')),
  reason text,
  scanned_at timestamptz not null default now()
);

create index customers_mobile_idx on public.customers (mobile);
create index bookings_customer_id_idx on public.bookings (customer_id);
create index bookings_event_day_id_idx on public.bookings (event_day_id);
create index bookings_payment_status_idx on public.bookings (payment_status);
create index payments_booking_id_idx on public.payments (booking_id);
create index payments_provider_payment_id_idx on public.payments (provider_payment_id) where provider_payment_id is not null;
create index tickets_booking_id_idx on public.tickets (booking_id);
create index tickets_event_day_id_idx on public.tickets (event_day_id);
create index tickets_status_idx on public.tickets (status);
create index tickets_scanned_at_idx on public.tickets (scanned_at) where scanned_at is not null;
create index scan_logs_ticket_id_scanned_at_idx on public.scan_logs (ticket_id, scanned_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger event_days_set_updated_at before update on public.event_days for each row execute function public.set_updated_at();
create trigger ticket_types_set_updated_at before update on public.ticket_types for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger tickets_set_updated_at before update on public.tickets for each row execute function public.set_updated_at();

create or replace function public.validate_and_consume_ticket(input_token uuid, scanner_user_id uuid default null)
returns table (result text, reason text, ticket_reference text, event_day_id uuid, ticket_type_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare found_ticket public.tickets%rowtype; booking_status text;
begin
  select * into found_ticket from public.tickets where ticket_token = input_token for update;
  if not found then return query select 'INVALID'::text, 'Ticket not found'::text, null::text, null::uuid, null::uuid; return; end if;
  select payment_status into booking_status from public.bookings where id = found_ticket.booking_id;
  if booking_status is distinct from 'PAID' then
    insert into public.scan_logs (ticket_id, scanned_by, result, reason) values (found_ticket.id, scanner_user_id, 'PAYMENT_NOT_COMPLETED', 'Booking payment is not completed');
    return query select 'PAYMENT_NOT_COMPLETED'::text, 'Payment not completed'::text, found_ticket.ticket_reference, found_ticket.event_day_id, found_ticket.ticket_type_id; return;
  end if;
  if found_ticket.status = 'CANCELLED' then
    insert into public.scan_logs (ticket_id, scanned_by, result, reason) values (found_ticket.id, scanner_user_id, 'CANCELLED', 'Ticket is cancelled');
    return query select 'CANCELLED'::text, 'Ticket is cancelled'::text, found_ticket.ticket_reference, found_ticket.event_day_id, found_ticket.ticket_type_id; return;
  end if;
  if found_ticket.status = 'USED' then
    insert into public.scan_logs (ticket_id, scanned_by, result, reason) values (found_ticket.id, scanner_user_id, 'ALREADY_USED', 'Ticket was already used');
    return query select 'ALREADY_USED'::text, 'Ticket already used'::text, found_ticket.ticket_reference, found_ticket.event_day_id, found_ticket.ticket_type_id; return;
  end if;
  update public.tickets set status = 'USED', scanned_at = now(), scanned_by = scanner_user_id where id = found_ticket.id and status = 'ACTIVE';
  if not found then raise exception 'Ticket state changed unexpectedly'; end if;
  insert into public.scan_logs (ticket_id, scanned_by, result) values (found_ticket.id, scanner_user_id, 'SUCCESS');
  return query select 'SUCCESS'::text, 'Entry allowed'::text, found_ticket.ticket_reference, found_ticket.event_day_id, found_ticket.ticket_type_id;
end;
$$;

revoke all on function public.validate_and_consume_ticket(uuid, uuid) from public, anon, authenticated;
grant execute on function public.validate_and_consume_ticket(uuid, uuid) to service_role;

alter table public.event_days enable row level security;
alter table public.ticket_types enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.tickets enable row level security;
alter table public.scan_logs enable row level security;
