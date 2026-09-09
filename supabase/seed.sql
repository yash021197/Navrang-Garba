insert into public.event_days (day_number, name, event_date, active)
values
  (1, 'Day 1', null, false), (2, 'Day 2', null, false), (3, 'Day 3', null, false), (4, 'Day 4', null, false), (5, 'Day 5', null, false),
  (6, 'Day 6', null, false), (7, 'Day 7', null, false), (8, 'Day 8', null, false), (9, 'Day 9', null, false), (10, 'Day 10', null, false)
on conflict (day_number) do update set name = excluded.name;

insert into public.ticket_types (code, name, description, capacity, price, active)
values
  ('SINGLE', 'Single', 'Entry for one person.', 1, 0, false),
  ('COUPLE', 'Couple', 'Entry for two people.', 2, 0, false),
  ('GROUP_OF_4', 'Group of 4', 'Entry for four people.', 4, 0, false)
on conflict (code) do update set name = excluded.name, description = excluded.description, capacity = excluded.capacity;
