-- `supabase db push` applies migrations but intentionally does not run seed.sql.
-- Establish the required remote test configuration idempotently.
insert into public.event_days (day_number, name, event_date, active)
values
  (1, 'Day 1', date '2026-10-11', true),
  (2, 'Day 2', date '2026-10-12', true),
  (3, 'Day 3', date '2026-10-13', true),
  (4, 'Day 4', date '2026-10-14', true),
  (5, 'Day 5', date '2026-10-15', true),
  (6, 'Day 6', date '2026-10-16', true),
  (7, 'Day 7', date '2026-10-17', true),
  (8, 'Day 8', date '2026-10-18', true),
  (9, 'Day 9', date '2026-10-19', true)
on conflict (day_number) do update
set name = excluded.name,
    event_date = excluded.event_date,
    active = excluded.active;

-- Preserve a historical day ten record if one exists, but never expose it as active.
update public.event_days
set active = false
where day_number = 10;

insert into public.ticket_types (code, name, description, capacity, price, currency, active)
values
  ('SINGLE', 'Single', 'Entry for one person.', 1, 500, 'INR', true),
  ('COUPLE', 'Couple', 'Entry for two people.', 2, 1000, 'INR', true),
  ('GROUP_OF_4', 'Group of 4', 'Entry for four people.', 4, 2000, 'INR', true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    capacity = excluded.capacity,
    price = excluded.price,
    currency = excluded.currency,
    active = excluded.active;
