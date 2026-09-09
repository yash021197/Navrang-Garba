update public.event_days set active = false where day_number = 10;
delete from public.event_days where day_number = 10 and not exists (select 1 from public.bookings where event_day_id = public.event_days.id);
