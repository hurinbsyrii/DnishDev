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

1. Open your Supabase project and run the SQL migrations in order in the SQL Editor. The [projects migration](supabase/migrations/20261110000000_projects.sql) creates the table, owner access rules, and Realtime subscription. The [optional end date migration](supabase/migrations/20261110000001_optional_project_end_date.sql) lets projects be saved with a blank end date. The [instalments migration](supabase/migrations/20261117000000_project_installments.sql) adds payment history and preserves existing final payments. The [synced tasks migration](supabase/migrations/20261118000000_synced_tasks.sql) adds the account-owned Kanban board, Realtime updates, and safe browser-task import. The [synced expenses migration](supabase/migrations/20261120000000_synced_expenses.sql) adds account-owned expenses, monthly budgets, Realtime, and safe import of existing browser expenses and budgets. The [monthly expense plans migration](supabase/migrations/20261121000000_monthly_expense_plans.sql) adds spending limits and category allocations to the existing expense budgets. Apply it after the synced expenses migration before saving a plan in a signed-in workspace. For an existing workspace, run only the migrations you haven’t applied yet.
2. Copy `.env.example` to `.env.local`. In your Supabase project's **Connect** dialog, copy the Project URL and publishable key. Set `NEXT_PUBLIC_SUPABASE_URL` to the base URL (`https://your-project.supabase.co`) and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the publishable key.
3. In Supabase Authentication → Users, create and confirm your email/password user. Restart the dev server and sign in. The cloud workspace starts empty. Demo projects remain in the browser demo.
4. To verify sync, sign in to the same workspace in two browsers, then add or update a project or to-do task in one. The other should reflect the change without a reload. After applying the synced tasks migration, open the original computer/browser once to import its old tasks, then sign in with the same account on your phone. Deploy the updated app before testing on your hosted site.

## Workspace behavior

- In **Expenses**, choose a month and open **Set budget plan**. Enter the total money available and the amount you plan to use that month. Split the budget across custom categories such as food, fuel, fun, or savings. Food defaults to a daily amount, and any category can use a daily or monthly amount. Daily amounts are multiplied by the number of calendar days in the selected month, including leap days. Category totals must fit inside the monthly budget. The page shows how much is allocated, spent, and left per category. Existing starting amounts remain available when you set up a plan. The daily running balance uses the monthly budget once set and includes days without spending. The daily table defaults to the latest seven days through today in Malaysia time, limited to the selected month; past months show their last seven days and future months their first seven. **View all days** expands the month, and **Show fewer days** collapses it. Overspending is shown explicitly; unused balances do not automatically carry over. It records daily spending in MYR with a date, category, and optional notes. Add, edit, or delete entries, view today’s total and a selected month’s total, filter by day/category/search, and review monthly category totals. CSV export downloads the filtered entries. Expenses and monthly budgets for signed-in accounts are saved in Supabase with Realtime, a 30-second polling fallback, and refresh on reconnect or returning to the app. Existing browser entries import when you open Expenses on the original browser while signed in to the same account. Cloud records take precedence over imports; import receipts prevent deleted entries from being restored. Browser originals remain as backups. Concurrent edits are rejected so you can reopen the latest entry. Demo expenses remain in this browser. Expenses do not change project profit calculations.

- The **Reminders** tab combines active project deadlines, to-do due dates, and custom reminders. The page focuses on one combined reminder list, with **Customize** and **New reminder** on the right. Choose **Customize** to open preferences in a dialog; custom reminders are managed directly in the same list. By default, reminders start **3 days before**, at **9:00 AM MYT** for deadlines without a time, and repeat **every 24 hours**. Each account can change the lead time (0–365 days), click a repeat option (**Once only**, **Every hour**, **Daily**, **Every 2 days**, or **Weekly**), and pause reminders. Custom reminders can override the defaults. Dismiss hides the current interval; completing an item stops its reminders.
- Reminder preferences, custom reminders, and dismissed intervals are saved in this browser separately for each account or demo workspace. In-app reminder banners work throughout the workspace. Optional browser notifications require permission and DevDash to stay open; missed reminders appear when you reopen it. Multiple tabs coordinate notification delivery where browser Web Locks are available. Reminders do not send email or run while the app is closed.
- The **To-do** page is a Kanban board with **To do → In progress → Done** columns. Add, edit, delete, search, and filter tasks by priority; drag cards or use their status menus to move them. Tasks can have notes and optional due dates and times (MYT). Each column shows the 10 most recently added or moved tasks first; **See more** reveals 10 more at a time, and **Show fewer** returns to 10. Older tasks without timestamps use their saved creation order. Signed-in boards are saved in Supabase and sync across devices on the same account, using Realtime with a 30-second polling fallback and refresh on reconnect. Existing browser tasks are automatically imported once per saved board snapshot when you open that browser with the same account; the local copy stays untouched as a backup. Imports preserve existing cloud tasks and never restore deleted tasks on retry. Concurrent edits are rejected with a message to reopen the latest task. Demo boards remain in localStorage. Task deadlines in Reminders use the synced board.
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
