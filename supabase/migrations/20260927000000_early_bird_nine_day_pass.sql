-- Add one multi-day pass without changing any existing booking, payment, or ticket.
alter table public.ticket_types drop constraint ticket_types_code_check;
alter table public.ticket_types add constraint ticket_types_code_check check (code in ('SINGLE', 'COUPLE', 'GROUP_OF_4', 'EARLY_BIRD_9_DAY'));

insert into public.ticket_types (code, name, description, capacity, price, currency, active)
values ('EARLY_BIRD_9_DAY', 'Early Bird 9-Day Pass', 'One QR for one entry per event day, 11–19 October 2026.', 1, 1800, 'INR', true)
on conflict (code) do nothing;

alter table public.scan_logs add column event_day_id uuid references public.event_days(id) on delete restrict;
create unique index scan_logs_early_bird_success_once_per_day_idx
  on public.scan_logs (ticket_id, event_day_id)
  where result = 'SUCCESS' and event_day_id is not null;

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
declare selected_day public.event_days%rowtype; selected_type public.ticket_types%rowtype; effective_price numeric(12,2); customer_uuid uuid; existing_booking public.bookings%rowtype; new_reference text;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then raise exception 'Invalid quantity'; end if;
  if p_customer_name is null or btrim(p_customer_name) !~ '^[[:alpha:][:space:].''-]{2,120}$' then raise exception 'Invalid customer name'; end if;
  if p_mobile is null or regexp_replace(btrim(p_mobile), '[ -]', '', 'g') !~ '^(\+91)?[6-9][0-9]{9}$' then raise exception 'Invalid mobile number'; end if;
  if p_email is null or btrim(p_email) = '' or char_length(p_email) > 254 or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email address'; end if;
  select * into existing_booking from public.bookings where idempotency_key = p_idempotency_key;
  if found then return query select existing_booking.booking_reference, existing_booking.amount, existing_booking.currency::text; return; end if;
  select * into selected_type from public.ticket_types where code = p_ticket_type_code and active = true;
  if not found then raise exception 'Selected ticket type is unavailable'; end if;
  if selected_type.code = 'EARLY_BIRD_9_DAY' then
    if p_quantity <> 1 then raise exception 'Early Bird pass quantity must be 1'; end if;
    select * into selected_day from public.event_days where day_number = 1 and active = true;
  else
    select * into selected_day from public.event_days where day_number = p_event_day_number and active = true;
  end if;
  if not found then raise exception 'Selected event day is unavailable'; end if;
  if selected_type.code = 'EARLY_BIRD_9_DAY' then
    effective_price := selected_type.price;
  else
    select price into effective_price from public.event_day_ticket_prices where event_day_id = selected_day.id and ticket_type_id = selected_type.id;
    effective_price := coalesce(effective_price, selected_type.price);
  end if;
  if effective_price <= 0 then raise exception 'Ticket pricing is not configured'; end if;
  insert into public.customers (name, mobile, email) values (btrim(p_customer_name), btrim(p_mobile), btrim(p_email))
  on conflict (mobile) do update set name = excluded.name, email = excluded.email
  returning id into customer_uuid;
  new_reference := 'BOOK-' || upper(encode(extensions.gen_random_bytes(8), 'hex'));
  insert into public.bookings (booking_reference, customer_id, event_day_id, ticket_type_id, quantity, amount, currency, payment_status, idempotency_key)
  values (new_reference, customer_uuid, selected_day.id, selected_type.id, p_quantity, effective_price * p_quantity, selected_type.currency, 'PENDING', p_idempotency_key);
  insert into public.payments (booking_id, provider, amount, currency, status)
  select b.id, 'RAZORPAY', b.amount, b.currency, 'PENDING' from public.bookings b where b.booking_reference = new_reference;
  return query select new_reference, effective_price * p_quantity, selected_type.currency::text;
end;
$$;

create or replace function public.validate_and_consume_ticket_reference(input_reference text, scanner_user_id uuid default null)
returns table (result text, reason text, ticket_reference text, event_day_id uuid, ticket_type_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare found_ticket public.tickets%rowtype; booking_status text; ticket_code text; current_day public.event_days%rowtype;
begin
  select t.* into found_ticket from public.tickets t where t.ticket_reference = input_reference for update;
  if not found then return query select 'INVALID'::text, 'Ticket not found'::text, null::text, null::uuid, null::uuid; return; end if;
  select b.payment_status, tt.code into booking_status, ticket_code from public.bookings b join public.ticket_types tt on tt.id = b.ticket_type_id where b.id = found_ticket.booking_id;
  if booking_status is distinct from 'PAID' then
    insert into public.scan_logs (ticket_id, scanned_by, result, reason) values (found_ticket.id, scanner_user_id, 'PAYMENT_NOT_COMPLETED', 'Booking payment is not completed');
    return query select 'PAYMENT_NOT_COMPLETED'::text, 'Payment not completed'::text, found_ticket.ticket_reference, found_ticket.event_day_id, found_ticket.ticket_type_id; return;
  end if;
  if found_ticket.status = 'CANCELLED' then
    insert into public.scan_logs (ticket_id, scanned_by, result, reason) values (found_ticket.id, scanner_user_id, 'CANCELLED', 'Ticket is cancelled');
    return query select 'CANCELLED'::text, 'Ticket is cancelled'::text, found_ticket.ticket_reference, found_ticket.event_day_id, found_ticket.ticket_type_id; return;
  end if;
  if ticket_code = 'EARLY_BIRD_9_DAY' then
    select * into current_day from public.event_days where event_date = timezone('Asia/Kolkata', now())::date and day_number between 1 and 9 and active = true;
    if not found then
      insert into public.scan_logs (ticket_id, scanned_by, result, reason) values (found_ticket.id, scanner_user_id, 'INVALID', 'Early Bird pass is not valid today');
      return query select 'PASS_NOT_VALID_TODAY'::text, 'Pass not valid today'::text, found_ticket.ticket_reference, null::uuid, found_ticket.ticket_type_id; return;
    end if;
    if exists (select 1 from public.scan_logs where ticket_id = found_ticket.id and event_day_id = current_day.id and result = 'SUCCESS') then
      insert into public.scan_logs (ticket_id, scanned_by, event_day_id, result, reason) values (found_ticket.id, scanner_user_id, current_day.id, 'ALREADY_USED', 'Early Bird pass was already used today');
      return query select 'ALREADY_USED_TODAY'::text, 'Already used today'::text, found_ticket.ticket_reference, current_day.id, found_ticket.ticket_type_id; return;
    end if;
    insert into public.scan_logs (ticket_id, scanned_by, event_day_id, result, reason) values (found_ticket.id, scanner_user_id, current_day.id, 'SUCCESS', 'Early Bird entry allowed');
    return query select 'SUCCESS'::text, 'Entry allowed'::text, found_ticket.ticket_reference, current_day.id, found_ticket.ticket_type_id; return;
  end if;
  if found_ticket.status = 'USED' then
    insert into public.scan_logs (ticket_id, scanned_by, result, reason) values (found_ticket.id, scanner_user_id, 'ALREADY_USED', 'Ticket was already used');
    return query select 'ALREADY_USED'::text, 'Ticket already used'::text, found_ticket.ticket_reference, found_ticket.event_day_id, found_ticket.ticket_type_id; return;
  end if;
  update public.tickets set status = 'USED', scanned_at = now(), scanned_by = scanner_user_id where id = found_ticket.id and status = 'ACTIVE';
  insert into public.scan_logs (ticket_id, scanned_by, event_day_id, result) values (found_ticket.id, scanner_user_id, found_ticket.event_day_id, 'SUCCESS');
  return query select 'SUCCESS'::text, 'Entry allowed'::text, found_ticket.ticket_reference, found_ticket.event_day_id, found_ticket.ticket_type_id;
end;
$$;

revoke all on function public.create_pending_booking(smallint, text, smallint, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_pending_booking(smallint, text, smallint, text, text, text, uuid) to service_role;
revoke all on function public.validate_and_consume_ticket_reference(text, uuid) from public, anon, authenticated;
grant execute on function public.validate_and_consume_ticket_reference(text, uuid) to service_role;
