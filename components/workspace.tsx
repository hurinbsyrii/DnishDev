"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, CalendarDays, ChevronRight, Code2, FileText, FolderKanban, LayoutGrid, Plus, ShieldCheck, UserRound } from "lucide-react";
import { categories as projectCategories, formatDate, todayInMalaysia, type Project } from "@/lib/projects";
import { cloudConfigured, getSupabase } from "@/lib/supabase";
import { useProjects } from "@/lib/use-projects";
import { Calendar } from "./calendar";
import { Dashboard, ProjectList } from "./dashboard";
import { Invoice } from "./invoice";
import { ProjectDetails, ProjectEditor } from "./project-editor";
import { Modal } from "./ui";

const pages = [
  { name: "Overview", icon: LayoutGrid, title: "Workspace overview", description: "Track projects, upcoming deadlines and what you’ve earned." },
  { name: "Projects", icon: FolderKanban, title: "Your projects", description: "Manage clients, payments and every milestone from won to published." },
  { name: "Calendar", icon: CalendarDays, title: "Project calendar", description: "See your project schedule by day and ISO week." },
  { name: "Invoices", icon: FileText, title: "Create an invoice", description: "Fill in your company details, adjust the rates and download a PDF." },
] as const;

type Page = typeof pages[number]["name"];
type Dialog = { mode: "new" | "account" } | { mode: "details" | "edit"; id: string };

function Brand() {
  return <div className="brand"><span className="brand-mark"><Code2 size={21} strokeWidth={2.5} /></span><span>Dev<span className="brand-dev">Dash</span><small>FREELANCE STUDIO</small></span></div>;
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
  const { session, authReady, live, projects, loading, loadError, retry, mutate } = useProjects(initialDay);
  const sorted = [...projects].sort((a, b) => {
    return Number(Boolean(a.completed_date)) - Number(Boolean(b.completed_date))
      || Number(!a.end_date) - Number(!b.end_date)
      || (a.end_date ?? "").localeCompare(b.end_date ?? "")
      || a.name.localeCompare(b.name);
  });
  const categories = [...new Set([...projectCategories, ...sorted.map((project) => project.category)])].sort();
  const current = pages.find((item) => item.name === page)!;
  const selected = dialog && "id" in dialog ? projects.find((item) => item.id === dialog.id) : null;

  useEffect(() => {
    const tick = () => setToday(todayInMalaysia());
    const interval = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, []);

  function navigate(next: Page) {
    setPage(next);
    setDialog(null);
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
  const list = <ProjectList projects={sorted} today={today} onProject={open} search={search} setSearch={setSearch} category={categories.includes(category) ? category : ""} setCategory={setCategory} categories={categories} />;

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand-button" aria-label="DevDash overview" onClick={() => navigate("Overview")}><Brand /></button>
      <div className="top-right"><span className="connection"><i className={live || !cloudConfigured ? "online" : ""} />{cloudConfigured ? live ? "Live sync" : "Cloud workspace" : "Demo workspace"}</span><button className="avatar" aria-label="Workspace account" onClick={() => { setAccountError(""); setDialog({ mode: "account" }); }}>{session?.user.email?.slice(0, 2).toUpperCase() || "DD"}</button></div>
    </header>
    <div className="workspace-layout">
      <aside className="rail">
        <nav aria-label="Main navigation">{pages.map(({ name, icon: Icon }) => <button key={name} title={name} aria-label={name} aria-current={page === name ? "page" : undefined} className={page === name ? "selected" : ""} onClick={() => navigate(name)}><Icon size={19} /></button>)}</nav>
        <button className="rail-account" title="Workspace account" aria-label="Workspace settings" onClick={() => setDialog({ mode: "account" })}><UserRound size={18} /></button>
      </aside>
      <main className="main-content">
        <div className="breadcrumb">Workspace <ChevronRight size={13} /> <span>{page}</span></div>
        <div className="page-heading">
          <div><p className="eyebrow"><span /> YOUR FREELANCE STUDIO</p><h1>{current.title}</h1><p className="page-description">{current.description}</p></div>
          <div className="heading-actions">
            <span className="date-pill"><CalendarDays size={16} /> {formatDate(today, { day: "numeric", month: "short", year: "numeric" })}</span>
            {page !== "Invoices" && <button className="button primary new-project" onClick={() => setDialog({ mode: "new" })}><Plus size={18} /> New project</button>}
          </div>
        </div>
        {loadError && <div className="error-banner" role="alert">{loadError}<button className="button quiet" onClick={retry}>Retry</button></div>}
        {loading ? <div className="card empty" role="status">Loading projects…</div> : <>
          {page === "Overview" && <Dashboard projects={sorted} today={today} onCalendar={() => navigate("Calendar")} onProjects={() => navigate("Projects")} onProject={open} list={list} />}
          {page === "Projects" && list}
          {page === "Calendar" && <Calendar projects={sorted} today={today} onProject={open} />}
          {page === "Invoices" && <Invoice key={session?.user.id ?? "demo"} projects={sorted} today={today} owner={session?.user.id ?? "demo"} />}
        </>}
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
