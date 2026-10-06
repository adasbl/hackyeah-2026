# Submission moderation

[Technical documentation](README.md) · [Hackathon demo login](admin-demo-access.md)

The "Panel administratora" link in the footer leads to `/admin`. Anyone without an active
administrator account is redirected to `/admin/login`. Login uses Supabase Auth
(email and password); the app has no sign-up form.

## Setup

1. Run `npm run db:migrate` for the target environment before deploying the code.
   The `0002_contribution_moderation` migration adds two tables and an enum; it does not
   change existing card information.
2. In `.env.local` and in the matching Vercel environment, set
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   Copy them from Supabase → Connect. They must belong to the same project as
   `DATABASE_URL`. Use the publishable key, never `service_role` or a secret key.
   Changing variables on Vercel requires a new build/deployment.
3. In Supabase Auth, enable the Email provider. If accounts are for administrators only,
   turn off "Allow new users to sign up".
4. In Authentication → Users, create an administrator account with an email address
   and a strong password, and confirm the address. Only Supabase Auth stores the password.
5. Copy the new user's UUID and run in the SQL Editor:

   ```sql
   insert into public.admin_users (user_id)
   values ('USER-UUID-FROM-AUTH')
   on conflict (user_id) do update set is_active = true;
   ```

6. Open `/admin`, sign in and check the queue. Keep credentials for non-demo
   environments outside Git or chat. Each additional administrator gets their own account.
   The shared hackathon account is documented in [demo access](admin-demo-access.md).

Revoking access (the decision history is kept):

```sql
update public.admin_users
set is_active = false
where user_id = 'USER-UUID-FROM-AUTH';
```

## Data flow and permissions

- The public form writes only to `card_contributions`, with the default status
  `pending`. It does not update `places`, `place_card_claims` or the cache.
- The panel shows current data next to the proposal, along with the source link.
  The queue and history are paginated at 20 submissions per page.
- Approval updates the card information, the venue's timestamp and the decision
  in a single transaction. Only then is the public cache invalidated.
- Rejection stores only the decision. The history keeps the administrator ID,
  date and previous card information.
- Row locks prevent a second decision on the same submission. On approval, comparing
  the venue timestamp forces a re-check if the data changed after the panel was opened.
- Identity is verified with `auth.getUser()`, and permissions through the protected
  `admin_users` table. Checks run on the page, in the server action and again in the
  decision transaction. Security does not rely on hiding the link.
- Middleware refreshes cookies only under `/admin`. The panel is not indexed
  and is not stored in the shared cache.
- The new tables have RLS enabled with no public policies. Drizzle access requires
  a trusted server-side connection, as before. Do not grant `anon` or `authenticated`
  policies that allow managing administrators.
- Older submissions that were published before the migration remain in public data;
  their previous values cannot be recovered.

## Verification

`npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`.

Integration test against a configured, migrated database (PowerShell):

```powershell
$env:MODERATION_INTEGRATION_TEST = '1'
npm run test
Remove-Item Env:MODERATION_INTEGRATION_TEST
```

The test creates its own data in a transaction and rolls back all writes. It checks
submission isolation, rejection, approval, history, missing permissions,
revoked permissions, repeated decisions, data conflicts and RLS for `anon`.
It does not create Supabase Auth accounts; login with a real account should be checked
after Auth is configured.
