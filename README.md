# DevDash

A freelance workspace built with Next.js, TypeScript, Tailwind CSS and Supabase. Track client projects, payments, deadlines, and invoices in MYR.

## Run locally

Use Node.js 24 and pnpm 11. From this folder, run:

```sh
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000). The app starts in demo mode with sample projects and stores changes in the current browser.

## Connect Supabase

1. Open your Supabase project and run the SQL migrations in order in the SQL Editor. The [projects migration](supabase/migrations/20261110000000_projects.sql) creates the table, owner access rules, and Realtime subscription. The [optional end date migration](supabase/migrations/20261110000001_optional_project_end_date.sql) lets projects be saved with a blank end date. The [instalments migration](supabase/migrations/20261117000000_project_installments.sql) adds payment history and preserves existing final payments. For an existing workspace, run only the migrations you haven’t applied yet.
2. Copy `.env.example` to `.env.local`. In your Supabase project's **Connect** dialog, copy the Project URL and publishable key. Set `NEXT_PUBLIC_SUPABASE_URL` to the base URL (`https://your-project.supabase.co`) and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the publishable key.
3. In Supabase Authentication → Users, create and confirm your email/password user. Restart the dev server and sign in. The cloud workspace starts empty. Demo projects remain in the browser demo.
4. To verify sync, sign in to the same workspace in two browsers, then add or update a project in one. The other should reflect the change without a reload.

## Workspace behavior

- The **To-do** page is a Kanban board with **To do → In progress → Done** columns. Add, edit, delete, search, and filter tasks by priority; drag cards or use their status menus to move them. Tasks can have notes and optional due dates and times (MYT). Each column shows the 10 most recently added or moved tasks first; **See more** reveals 10 more at a time, and **Show fewer** returns to 10. Older tasks without timestamps use their saved creation order. Boards are saved in the current browser separately for each signed-in account (or demo workspace), and do not sync through Supabase.
- Projects track **Project won**, **Payment received**, **Project complete**, **Paid in full**, and **Published**. Completion and payments can be recorded independently, including full payment before completion. **Published** records the handoff milestone after completion and full payment.
- Open a project and choose **Record payment** to record any amount up to its remaining balance. Customers can pay in as many instalments as needed. Payment history shows each amount and received date, and the project automatically becomes paid in full when the balance reaches zero. The deposit can still be set in the project editor.
- Profit is recorded cash received minus recorded project costs. Each deposit and instalment counts in the month of its actual received date in Malaysia time. Remaining balances, dashboard totals, and invoice prefills include all payments. Each project tracks one aggregated cost.
- Projects with no end date appear on their start date in the calendar. Marking one complete sets its end date to the completion date. The calendar uses Monday-based ISO week numbers, and the deadline countdown uses Malaysia dates.
- The invoice editor can prefill a project's client, fee, and payments. It keeps one editable draft per workspace in the current browser. Each new draft gets its own invoice number, which stays the same when you edit it or download the PDF again. Choose **New invoice** to start a fresh draft with your company details filled in.

## Checks

```sh
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

## Deploy to Cloudflare Pages

The production build exports the app to `out/`. Supabase authentication, project storage, and live updates run from the browser.

1. Push your changes to the connected GitHub repository.
2. In Cloudflare Workers & Pages, choose **Create application → Pages → Import an existing Git repository**.
3. Use project name **devdash**, production branch **main**, framework preset **Next.js (Static HTML Export)**, build command **pnpm run build**, output directory **out**, and root directory **/**.
4. Add these build environment variables for Production and Preview:
   - `NODE_VERSION=24`
   - `NEXT_PUBLIC_SUPABASE_URL` using your Supabase project base URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using your publishable key.
5. Deploy and sign in with your existing Supabase user. Rebuild the site after changing either Supabase variable because these values are embedded at build time.

To preview the exported production build locally, run `pnpm build` then `pnpm start`.

## Deploy the static build through Cloudflare Workers

For the Workers Git setup screen, use build command `pnpm run build`, deploy command `npx wrangler deploy`, and preview command `npx wrangler versions upload`. The committed `wrangler.jsonc` sets the Worker name, compatibility date, and `out/` assets directory. Use the same build environment variables listed above.
