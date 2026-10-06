# Administrator demo access

[Technical documentation](README.md) · [Account setup and permissions](admin-moderation.md)

These are the demo credentials previously listed in the project README for the
hackathon presentation. They apply to the account in the original demo Supabase project;
they are not a built-in login for every installation.

| Field | Value |
|---|---|
| Login page | `/admin/login` on the application host |
| Administrator panel | `/admin` |
| Email / login | `test@test.com` |
| Password | `test123` |

Sign in to inspect the submission queue and decision history. Approving a submission
changes the public card information in the connected database; rejecting it records
the decision without changing the venue's card claims.

## Prerequisites

- The application must have `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configured for the same project as `DATABASE_URL`.
- The account must exist in Supabase Auth with a confirmed email address.
- Its Supabase Auth user UUID must have an active entry in `public.admin_users`.

`npm run db:seed` creates only demo venue data. It does not create this account or
set its password. For a new environment, follow the [administrator setup guide](admin-moderation.md)
to create your own account and grant access.

The credentials are documented as demo values; their current validity has not been
verified. Keep this shared account limited to a demo environment. Store credentials
for other environments outside Git.
