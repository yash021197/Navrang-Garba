create or replace function public.validate_and_consume_ticket_reference(input_reference text, scanner_user_id uuid default null)
returns table (result text, reason text, ticket_reference text, event_day_id uuid, ticket_type_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare ticket_token_value uuid;
begin
  select t.ticket_token into ticket_token_value from public.tickets t where t.ticket_reference = input_reference;
  if not found then
    return query select 'INVALID'::text, 'Ticket not found'::text, null::text, null::uuid, null::uuid;
    return;
  end if;
  return query select * from public.validate_and_consume_ticket(ticket_token_value, scanner_user_id);
end;
$$;
