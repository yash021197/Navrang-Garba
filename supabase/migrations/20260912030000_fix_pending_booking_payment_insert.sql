-- Qualify booking columns in the payment insert. The function's output column
-- named `amount` otherwise conflicts with the unqualified SQL column.
create or replace function public.create_pending_booking(
  p_event_day_number smallint,
  p_ticket_type_code text,
  p_quantity smallint,
  p_customer_name text,
  p_mobile text,
  p_email text,
  p_idempotency_key uuid
)
returns table (booking_reference text, amount numeric, currency text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare selected_day public.event_days%rowtype; selected_type public.ticket_types%rowtype; customer_uuid uuid; existing_booking public.bookings%rowtype; new_reference text;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then raise exception 'Invalid quantity'; end if;
  if p_customer_name is null or btrim(p_customer_name) !~ '^[[:alpha:][:space:].''-]{2,120}$' then raise exception 'Invalid customer name'; end if;
  if p_mobile is null or regexp_replace(btrim(p_mobile), '[ -]', '', 'g') !~ '^(\+91)?[6-9][0-9]{9}$' then raise exception 'Invalid mobile number'; end if;
  if p_email is not null and (char_length(p_email) > 254 or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid email address'; end if;
  select * into existing_booking from public.bookings where idempotency_key = p_idempotency_key;
  if found then return query select existing_booking.booking_reference, existing_booking.amount, existing_booking.currency::text; return; end if;
  select * into selected_day from public.event_days where day_number = p_event_day_number and active = true;
  if not found then raise exception 'Selected event day is unavailable'; end if;
  select * into selected_type from public.ticket_types where code = p_ticket_type_code and active = true;
  if not found then raise exception 'Selected ticket type is unavailable'; end if;
  if selected_type.price <= 0 then raise exception 'Ticket pricing is not configured'; end if;
  insert into public.customers (name, mobile, email) values (btrim(p_customer_name), btrim(p_mobile), nullif(btrim(p_email), ''))
  on conflict (mobile) do update set name = excluded.name, email = coalesce(excluded.email, public.customers.email)
  returning id into customer_uuid;
  new_reference := 'BOOK-' || upper(encode(extensions.gen_random_bytes(8), 'hex'));
  insert into public.bookings (booking_reference, customer_id, event_day_id, ticket_type_id, quantity, amount, currency, payment_status, idempotency_key)
  values (new_reference, customer_uuid, selected_day.id, selected_type.id, p_quantity, selected_type.price * p_quantity, selected_type.currency, 'PENDING', p_idempotency_key);
  insert into public.payments (booking_id, provider, amount, currency, status)
  select b.id, 'RAZORPAY', b.amount, b.currency, 'PENDING'
  from public.bookings b
  where b.booking_reference = new_reference;
  return query select new_reference, selected_type.price * p_quantity, selected_type.currency::text;
end;
$$;

revoke all on function public.create_pending_booking(smallint, text, smallint, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_pending_booking(smallint, text, smallint, text, text, text, uuid) to service_role;
