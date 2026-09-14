alter table public.tickets
  add column if not exists ticket_email_status text check (ticket_email_status in ('SENDING', 'SENT', 'FAILED')),
  add column if not exists ticket_email_attempted_at timestamptz,
  add column if not exists ticket_email_sent_at timestamptz,
  add column if not exists ticket_email_provider_id text,
  add column if not exists ticket_email_error text;

create index if not exists tickets_ticket_email_status_idx
  on public.tickets (ticket_email_status)
  where ticket_email_status is not null;
