# Navrang Garba Ticketing

Local-first ticket booking and one-time QR entry validation for **Navrang Garba**, held 11-19 October 2026. Phases 1-3.5 are complete; payment, ticket issuance, staff access, and scanning UI are intentionally not yet available.

## Local development

Prerequisite: Node.js 20.9+.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Quality checks: `npm run lint` and `npm run build`.

## Routes

| Route | Current purpose |
| --- | --- |
| `/` | Navrang Garba landing page |
| `/tickets` | Mobile-first day, pass, quantity, details, and review flow |
| `/booking/success` | Payment-pending booking confirmation |
| `/api/bookings` | Server-only pending-booking creation endpoint |
| `/scanner` | Future staff scanner placeholder |
| `/admin` | Future admin placeholder |

## Configuration and branding

`src/lib/event-config.ts` is the central source for the nine 2026 dates, verified venue/timing/contact details, ticket types, capacity, placeholder pricing, and asset paths. Ticket pricing remains deliberately unset and types are unavailable until confirmed pricing is entered and activated in both the database and configuration. Place approved logo/background/gallery files in `public/images/`, then set their exact paths in the branding configuration. No external or invented image assets are used.

## Supabase setup

1. Create a Supabase project, or start the Supabase CLI local stack.
2. Copy `.env.example` to `.env.local`; add the project URL and anon key, and keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
3. Install the Supabase CLI, then link/login as needed: `supabase login` and `supabase link --project-ref <project-ref>`.
4. Apply the schema and seed data: `supabase db push` for a linked project, or `supabase start` then `supabase db reset` locally.

Migrations live in `supabase/migrations/`; `supabase/seed.sql` creates the initial rows. The Phase 3 migration activates the ten dates and adds an idempotency key plus a trusted `create_pending_booking` RPC. Set approved positive ticket prices and activate each ticket type before enabling sales; update `event-config.ts` to match the public display.

## Database architecture

- `event_days` and `ticket_types` provide configurable event and pricing data.
- `customers` -> `bookings` -> `tickets`; `payments` belong to bookings and `scan_logs` belong to tickets.
- RLS is enabled on every application table. No browser-access policies are provided, so anonymous/authenticated clients receive no broad data access.
- `public.create_pending_booking` is service-role-only. It validates active inventory and price in PostgreSQL, computes the total, upserts the customer, creates `PENDING` booking/payment records, and creates no ticket.
- `public.validate_and_consume_ticket` is a server-only atomic RPC prepared for Phase 6. It is executable by `service_role` only and conditionally changes `ACTIVE` to `USED` while recording scan outcomes.

## Environment variables

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` may be used in browser code; RLS still protects data. `SUPABASE_SERVICE_ROLE_KEY`, Razorpay secrets, and `AUTH_SECRET` must remain server-only and never be committed. `.env.local` is ignored by Git.

## Razorpay Test Mode

Add these values only to `.env.local` (never commit them): `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. Obtain Test Mode credentials from Razorpay Dashboard → Settings → API Keys. The key ID is passed to Checkout; the two secrets remain server-only.

For a local webhook, expose `/api/payments/webhook` with a temporary HTTPS tunnel such as ngrok or Cloudflare Tunnel, then create a **Test Mode** Razorpay webhook for `payment.captured` and copy its webhook secret into `RAZORPAY_WEBHOOK_SECRET`. Do not hardcode a tunnel URL. Checkout creates an order from the database amount, while `/api/payments/verify` and the webhook independently verify Razorpay signatures before setting payment and booking states to `PAID`.

## Scanner staff provisioning

Create the staff member in Supabase Authentication first, then obtain the user's UUID from the Auth dashboard. An administrator can grant scanner access with the following SQL, replacing the placeholder only:

```sql
insert into public.staff_users (user_id, role, active)
values ('<AUTH_USER_UUID>', 'SCANNER', true);
```

To deactivate that staff member without deleting their Auth account:

```sql
update public.staff_users
set active = false
where user_id = '<AUTH_USER_UUID>';
```

The `/scanner` route permits only signed-in, active `SCANNER` staff. It has no scanning or ticket-consumption capability until Phase 6B.

## Roadmap

1. Foundation - completed
2. Navrang Garba + database - completed
3. Customer booking flow - completed
4. Razorpay test payment
5. Ticket generation and QR tickets
6. Authenticated scanner
7. Authenticated admin dashboard
8. Security and reliability review
9. Full local testing
10. Production deployment preparation
