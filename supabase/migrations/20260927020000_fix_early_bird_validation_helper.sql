create or replace function public.validate_early_bird_ticket_for_event_date(input_reference text, validation_event_date date, scanner_user_id uuid default null)
returns table (result text, reason text, ticket_reference text, event_day_id uuid, ticket_type_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare found_ticket public.tickets%rowtype; ticket_code text; current_day public.event_days%rowtype;
begin
  select t.* into found_ticket from public.tickets t where t.ticket_reference = input_reference for update;
  if not found then return query select 'INVALID'::text, 'Ticket not found'::text, null::text, null::uuid, null::uuid; return; end if;
  select tt.code into ticket_code from public.bookings b join public.ticket_types tt on tt.id = b.ticket_type_id where b.id = found_ticket.booking_id and b.payment_status = 'PAID';
  if ticket_code is distinct from 'EARLY_BIRD_9_DAY' then return query select 'INVALID'::text, 'Not an Early Bird pass'::text, found_ticket.ticket_reference, found_ticket.event_day_id, found_ticket.ticket_type_id; return; end if;
  select * into current_day from public.event_days where event_date = validation_event_date and day_number between 1 and 9 and active = true;
  if not found then insert into public.scan_logs (ticket_id, scanned_by, result, reason) values (found_ticket.id, scanner_user_id, 'INVALID', 'Early Bird pass is not valid today'); return query select 'PASS_NOT_VALID_TODAY'::text, 'Pass not valid today'::text, found_ticket.ticket_reference, null::uuid, found_ticket.ticket_type_id; return; end if;
  if exists (select 1 from public.scan_logs sl where sl.ticket_id = found_ticket.id and sl.event_day_id = current_day.id and sl.result = 'SUCCESS') then insert into public.scan_logs (ticket_id, scanned_by, event_day_id, result, reason) values (found_ticket.id, scanner_user_id, current_day.id, 'ALREADY_USED', 'Early Bird pass was already used today'); return query select 'ALREADY_USED_TODAY'::text, 'Already used today'::text, found_ticket.ticket_reference, current_day.id, found_ticket.ticket_type_id; return; end if;
  insert into public.scan_logs (ticket_id, scanned_by, event_day_id, result, reason) values (found_ticket.id, scanner_user_id, current_day.id, 'SUCCESS', 'Early Bird entry allowed');
  return query select 'SUCCESS'::text, 'Entry allowed'::text, found_ticket.ticket_reference, current_day.id, found_ticket.ticket_type_id;
end;
$$;
