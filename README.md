# DnishDev

A freelance workspace built with Next.js, TypeScript, Tailwind CSS and Supabase. Track client projects, payments, deadlines, and invoices in MYR.

## Run locally

Use Node.js 24 and pnpm 11. From this folder, run:

```sh
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000). The app starts in demo mode with sample projects and stores changes in the current browser.

## Connect Supabase

1. Open your Supabase project and run the SQL migrations in order in the SQL Editor. The [projects migration](supabase/migrations/20261110000000_projects.sql) creates the table, owner access rules, and Realtime subscription. The [optional end date migration](supabase/migrations/20261110000001_optional_project_end_date.sql) lets projects be saved with a blank end date. For an existing workspace, run only the migrations you haven’t applied yet.
2. Copy `.env.example` to `.env.local`. In your Supabase project's **Connect** dialog, copy the Project URL and publishable key. Set `NEXT_PUBLIC_SUPABASE_URL` to the base URL (`https://your-project.supabase.co`) and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the publishable key.
3. In Supabase Authentication → Users, create and confirm your email/password user. Restart the dev server and sign in. The cloud workspace starts empty. Demo projects remain in the browser demo.
4. To verify sync, sign in to the same workspace in two browsers, then add or update a project in one. The other should reflect the change without a reload.

## Workspace behavior

- Project milestones are **Project won → Deposit paid → Project complete → Paid in full → Published**. A project with no deposit can move straight to **Project complete**. **Published** records the handoff milestone in DnishDev.
- Profit is recorded cash received minus recorded project costs. The month is based on the actual payment and cost dates in Malaysia time. Each project tracks one deposit, one final payment, and one aggregated cost.
- Projects with no end date appear on their start date in the calendar. Marking one complete sets its end date to the completion date. The calendar uses Monday-based ISO week numbers, and the deadline countdown uses Malaysia dates.
- The invoice editor can prefill a project's client, fee, and payments. It keeps one editable draft per workspace in the current browser and downloads a PDF. The PDF preview and download use the information in the draft.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm build
```
