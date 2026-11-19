"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import Image from "next/image";
import { ArrowRight, Bell, CalendarDays, ChevronRight, Columns3, Ellipsis, FileText, FolderKanban, LayoutGrid, Wallet, Plus, ShieldCheck, UserRound, X } from "lucide-react";
import { categories as projectCategories, formatDate, todayInMalaysia, type Project } from "@/lib/projects";
import { cloudConfigured, getSupabase } from "@/lib/supabase";
import { useProjects } from "@/lib/use-projects";
import { useTasks } from "@/lib/use-tasks";
import { Calendar } from "./calendar";
import { Dashboard, ProjectList } from "./dashboard";
import { Invoice } from "./invoice";
import { ProjectDetails, ProjectEditor } from "./project-editor";
import { Modal } from "./ui";
import { TodoBoard } from "./todo-board";
import { Reminders } from "./reminders";

import { Expenses } from "./expenses";

const pages = [
  { name: "Overview", icon: LayoutGrid, title: "Workspace overview", description: "Track projects, upcoming deadlines and what you’ve earned." },
  { name: "Projects", icon: FolderKanban, title: "Your projects", description: "Manage clients, payments and every milestone from won to published." },
  { name: "To-do", icon: Columns3, title: "Your to-do board", description: "Make a plan, focus on what’s next and keep work moving." },
  { name: "Calendar", icon: CalendarDays, title: "Project calendar", description: "See your project schedule by day and ISO week." },
  { name: "Reminders", icon: Bell, title: "Your reminders", description: "Choose when to get a nudge, how often it repeats and what to remember." },
  { name: "Expenses", icon: Wallet, title: "Your expenses", description: "Track daily spending and see where your money goes each month." },
  { name: "Invoices", icon: FileText, title: "Create an invoice", description: "Fill in your company details, adjust the rates and download a PDF." },
] as const;

type Page = typeof pages[number]["name"];
// Pages shown directly in the mobile bottom bar; the rest live in the "More" sheet.
const mobilePrimary: readonly Page[] = ["Overview", "Projects", "To-do", "Expenses"];
type Dialog = { mode: "new" | "account" } | { mode: "details" | "edit"; id: string };

function Brand() {
  return <div className="brand"><span className="brand-mark"><Image src="/mascot/logo.webp" width={38} height={38} alt="" unoptimized priority /></span><span>Dev<span className="brand-dev">Dash</span><small>FREELANCE STUDIO</small></span></div>;
}

function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const { error } = await getSupabase()!.auth.signInWithPassword({ email: String(data.get("email")).trim(), password: String(data.get("password")) });
      if (error) setError(error.message);
    } catch {
      setError("Couldn’t connect to Supabase. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="login-screen"><div className="card login-card">
    <Brand />
    <div><p className="eyebrow"><span /> PRIVATE WORKSPACE</p><h1>Welcome back</h1><p className="muted">Sign in to access your DevDash projects.</p></div>
    <form onSubmit={signIn} className="form-grid">
      <label className="field full">Email<input type="email" name="email" autoComplete="username" required /></label>
      <label className="field full">Password<input type="password" name="password" autoComplete="current-password" required /></label>
      {error && <p className="form-error full" role="alert">{error}</p>}
      <button className="button primary full" disabled={busy}>{busy ? "Signing in…" : "Sign in"} <ArrowRight size={16} /></button>
    </form>
  </div></div>;
}

export default function Workspace({ initialDay }: { initialDay: string }) {
  const [page, setPage] = useState<Page>("Overview");
  const [today, setToday] = useState(initialDay);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [accountError, setAccountError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const { session, authReady, live, projects, loading, loadError, retry, mutate } = useProjects(initialDay);
  const board = useTasks(cloudConfigured ? session?.user.id ?? null : "demo");
  const sorted = [...projects].sort((a, b) => {
    return Number(Boolean(a.completed_date)) - Number(Boolean(b.completed_date))
      || Number(!a.end_date) - Number(!b.end_date)
      || (a.end_date ?? "").localeCompare(b.end_date ?? "")
      || a.name.localeCompare(b.name);
  });
  const categories = [...new Set([...projectCategories, ...sorted.map((project) => project.category)])].sort();
  const pageIndex = pages.findIndex((item) => item.name === page);
  const current = pages[pageIndex];
  const selected = dialog && "id" in dialog ? projects.find((item) => item.id === dialog.id) : null;

  useEffect(() => {
    const tick = () => setToday(todayInMalaysia());
    const interval = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMoreOpen(false); };
    const mq = window.matchMedia("(min-width: 811px)");
    const onResize = () => { if (mq.matches) setMoreOpen(false); };
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onResize);
    return () => { document.removeEventListener("keydown", onKey); mq.removeEventListener("change", onResize); };
  }, [moreOpen]);

  function navigate(next: Page) {
    setMoreOpen(false);
    setDialog(null);
    setPage(next);
    setSearch("");
    setCategory("");
  }

  async function signOut() {
    setAccountError("");
    try {
      const { error } = await getSupabase()!.auth.signOut();
      if (error) throw error;
      navigate("Overview");
    } catch {
      setAccountError("Couldn’t sign out. Try again.");
    }
  }

  if (!authReady) return <div className="login-screen"><div className="card login-card"><Brand /><p className="muted" role="status">Loading workspace…</p></div></div>;
  if (cloudConfigured && !session) return <Login />;

  const open = (project: Project) => setDialog({ mode: "details", id: project.id });
  const close = () => setDialog(null);
  const renderList = () => (
    <ProjectList
      projects={sorted}
      today={today}
      onProject={open}
      search={search}
      setSearch={setSearch}
      category={categories.includes(category) ? category : ""}
      setCategory={setCategory}
      categories={categories}
    />
  );

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand-button" aria-label="DevDash overview" onClick={() => navigate("Overview")}><Brand /></button>
      <div className="top-right"><span className="connection"><i className={live || !cloudConfigured ? "online" : ""} />{cloudConfigured ? live ? "Live sync" : "Cloud workspace" : "Demo workspace"}</span><button className="avatar" aria-label="Workspace account" onClick={() => { setAccountError(""); setDialog({ mode: "account" }); }}>{session?.user.email?.slice(0, 2).toUpperCase() || "DD"}</button></div>
    </header>
    <div className="workspace-layout">
      <aside className="rail">
        <nav aria-label="Main navigation" style={{ "--active-page": pageIndex } as CSSProperties}>
          <span className="rail-indicator" aria-hidden="true" />
          {pages.map(({ name, icon: Icon }) => (
            <button
              key={name}
              title={name}
              aria-label={name}
              aria-current={page === name ? "page" : undefined}
              className={[page === name ? "selected" : "", mobilePrimary.includes(name) ? "" : "mobile-secondary"].filter(Boolean).join(" ")}
              onClick={() => navigate(name)}
            >
              <Icon size={19} aria-hidden="true" />
              <span className="rail-label">{name}</span>
            </button>
          ))}
          <button
            className={`mobile-more ${moreOpen || !mobilePrimary.includes(page) ? "selected" : ""}`}
            aria-label="More pages"
            aria-expanded={moreOpen}
            aria-controls="more-sheet"
            onClick={() => setMoreOpen((open) => !open)}
          >
            <Ellipsis size={19} aria-hidden="true" />
            <span className="rail-label">More</span>
          </button>
        </nav>
        <button
          className={`rail-account ${dialog?.mode === "account" ? "selected" : ""}`}
          title="Workspace account"
          aria-label="Workspace settings"
          aria-current={dialog?.mode === "account" ? "page" : undefined}
          onClick={() => {
            setAccountError("");
            setDialog((prev) => (prev?.mode === "account" ? null : { mode: "account" }));
          }}
        >
          <UserRound size={18} />
        </button>
      </aside>
      {/* Always mounted so the sheet can morph both open and closed; `inert` keeps it out of focus/AT when closed. */}
      <div className={`more-backdrop ${moreOpen ? "open" : ""}`} aria-hidden="true" onClick={() => setMoreOpen(false)} />
      <div className={`more-sheet ${moreOpen ? "open" : ""}`} id="more-sheet" role="dialog" aria-modal="true" aria-label="More pages" inert={!moreOpen}>
          <div className="more-sheet-heading"><strong>More</strong><button className="icon-button" aria-label="Close" onClick={() => setMoreOpen(false)}><X size={16} /></button></div>
          <ul>
            {pages.filter(({ name }) => !mobilePrimary.includes(name)).map(({ name, icon: Icon, description }, index) => (
              <li key={name} style={{ "--i": index } as CSSProperties}>
                <button className={page === name ? "selected" : ""} aria-current={page === name ? "page" : undefined} onClick={() => navigate(name)}>
                  <span className="metric-icon"><Icon size={18} aria-hidden="true" /></span>
                  <span><strong>{name}</strong><small>{description}</small></span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
            <li style={{ "--i": pages.length - mobilePrimary.length } as CSSProperties}>
              <button onClick={() => { setMoreOpen(false); setAccountError(""); setDialog({ mode: "account" }); }}>
                <span className="metric-icon"><UserRound size={18} aria-hidden="true" /></span>
                <span><strong>Account</strong><small>Workspace settings and sign out.</small></span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </li>
          </ul>
        </div>
      <main className="main-content">
        <div className="breadcrumb">Workspace <ChevronRight size={13} /> <span>{page}</span></div>
        <div className="page-heading">
          <div className="heading-copy" key={page}><p className="eyebrow"><span /> YOUR FREELANCE STUDIO</p><h1>{current.title}</h1><p className="page-description">{current.description}</p></div>
          <div className="heading-actions">
            <span className="date-pill"><CalendarDays size={16} /> {formatDate(today, { day: "numeric", month: "short", year: "numeric" })}</span>
            {page !== "Expenses" && page !== "Invoices" && page !== "To-do" && page !== "Reminders" && <button className="button primary new-project" onClick={() => setDialog({ mode: "new" })}><Plus size={18} /> New project</button>}
          </div>
        </div>
        {loadError && <div className="error-banner" role="alert">{loadError}<button className="button quiet" onClick={retry}>Retry</button></div>}
        <Reminders key={session?.user.id ?? "demo"} owner={session?.user.id ?? "demo"} tasks={board.tasks} taskError={board.error} projects={sorted} active={page === "Reminders"} today={today} onOpen={open} onTasks={() => navigate("To-do")} onReminders={() => navigate("Reminders")} />
        {loading ? <div className="card empty" role="status">Loading projects…</div> :
          <div className="page-view" key={page}>
            {page === "Overview" && <Dashboard projects={sorted} today={today} onCalendar={() => navigate("Calendar")} onProjects={() => navigate("Projects")} onProject={open} list={renderList()} />}
            {page === "Projects" && renderList()}
            {page === "To-do" && <TodoBoard key={session?.user.id ?? "demo"} board={board} today={today} />}
            {page === "Calendar" && <Calendar projects={sorted} today={today} onProject={open} />}
            {page === "Expenses" && <Expenses key={session?.user.id ?? "demo"} owner={session?.user.id ?? "demo"} today={today} />}
            {page === "Invoices" && <Invoice key={session?.user.id ?? "demo"} projects={sorted} today={today} owner={session?.user.id ?? "demo"} />}
          </div>}
        <footer className="workspace-footer"><span>DevDash Workspace</span><span>MYR <i /> Asia/Kuala_Lumpur</span></footer>
      </main>
    </div>
    {dialog?.mode === "new" && <ProjectEditor project={null} today={today} categoryOptions={categories} onClose={close} save={mutate} />}
    {dialog?.mode === "edit" && selected && <ProjectEditor key={selected.id} project={selected} today={today} categoryOptions={categories} onClose={() => open(selected)} save={mutate} />}
    {dialog?.mode === "details" && selected && <ProjectDetails key={selected.id} project={selected} today={today} onClose={close} onEdit={() => setDialog({ mode: "edit", id: selected.id })} save={mutate} />}
    {dialog && "id" in dialog && !selected && <Modal title="Project unavailable" caption="The project may have been removed in another tab." onClose={close}><div className="modal-actions"><button className="button quiet" onClick={close}>Close</button></div></Modal>}
    {dialog?.mode === "account" && <Modal title="Workspace account" onClose={close}>
      <div className="account-info"><span className="metric-icon lavender"><ShieldCheck size={19} /></span><div><strong>{session?.user.email ?? "Demo workspace"}</strong><p className="muted">{session ? "Projects are saved in your Supabase workspace." : "Sample projects and edits are saved in this browser."}</p></div></div>
      {accountError && <p className="form-error" role="alert">{accountError}</p>}
      <div className="modal-actions"><button className="button quiet" onClick={close}>Close</button>{session && <button className="button primary" onClick={signOut}>Sign out</button>}</div>
    </Modal>}
  </div>;
}
