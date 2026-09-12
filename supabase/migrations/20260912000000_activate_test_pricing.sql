-- Phase 4 preparation only: approved local/test pricing in INR, not paise.
update public.event_days
set active = true
where event_date between date '2026-10-11' and date '2026-10-19';

update public.event_days
set active = false
where day_number = 10;

update public.ticket_types
set price = case code
  when 'SINGLE' then 500
  when 'COUPLE' then 1000
  when 'GROUP_OF_4' then 2000
end,
active = true
where code in ('SINGLE', 'COUPLE', 'GROUP_OF_4');
