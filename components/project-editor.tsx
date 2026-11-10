"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Clock3, Pencil, Trash2 } from "lucide-react";
import { balance, deadline, formatDate, money, newProject, stages, toCents, type Project, type ProjectChange } from "@/lib/projects";
import { Modal, ProjectMark, Status } from "./ui";

export type SaveProject = (project: Project | null, change: ProjectChange | null) => Promise<void>;

export function ProjectEditor({ project: initialProject, today, categoryOptions, onClose, save }: {
  project: Project | null; today: string; categoryOptions: string[]; onClose: () => void; save: SaveProject;
}) {
  const [project] = useState(initialProject);
  const [data] = useState(() => initialProject ?? newProject(today));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (name: string) => String(form.get(name) ?? "").trim();
    const price = toCents(form.get("price"));
    const deposit = toCents(form.get("deposit"));
    const cost = toCents(form.get("cost"));
    const depositDate = get("deposit_date");
    const costDate = get("cost_date");
    const startDate = get("start_date");
    const endDate = get("end_date") || project?.completed_date || null;
    if (!get("name") || !get("client") || !get("category")) return setError("Enter a project name, client and category.");
    if (deposit > price) return setError("The deposit can’t exceed the project price.");
    if (deposit > 0 && !depositDate) return setError("Enter the date the deposit was received.");
    if (cost > 0 && !costDate) return setError("Enter the date the costs were paid.");
    if (endDate && startDate > endDate) return setError("The end date must be on or after the start date.");
    if (deposit > 0 && project?.paid_date && depositDate > project.paid_date) return setError("The deposit date can’t be after the final payment date.");
    setBusy(true);
    setError("");
    try {
      await save(project, {
        name: get("name"), client: get("client"), category: get("category"),
        price_cents: price, deposit_cents: deposit, deposit_date: deposit > 0 ? depositDate : null,
        cost_cents: cost, cost_date: cost > 0 ? costDate : null,
        start_date: startDate, end_date: endDate,
      });
      onClose();
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }

  return <Modal title={project ? "Edit project" : "New project"} caption="Keep your client, timeline and payments together." onClose={onClose}>
    <form className="form-grid" onSubmit={submit}>
      <label className="field">Project name<input name="name" placeholder="e.g. Studio Forma" defaultValue={data.name} maxLength={120} required autoFocus /></label>
      <label className="field">Client or company<input name="client" placeholder="e.g. Forma Collective" defaultValue={data.client} maxLength={120} required /></label>
      <label className="field full">Category
        <select name="category" defaultValue={data.category} required>
          <option value="" disabled>Select a category</option>
          {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label className="field">Start date<input name="start_date" type="date" defaultValue={data.start_date} required /></label>
      <label className="field">End date (optional)<input name="end_date" type="date" defaultValue={data.end_date ?? ""} /></label>
      <label className="field">Full price (RM)<input name="price" type="number" min="0" max="9999999.99" step="0.01" defaultValue={data.price_cents ? data.price_cents / 100 : ""} placeholder="0.00" required /></label>
      <label className="field">Deposit received (RM)<input name="deposit" type="number" min="0" max="9999999.99" step="0.01" defaultValue={data.deposit_cents ? data.deposit_cents / 100 : ""} placeholder="0.00" /></label>
      <label className="field">Deposit received on<input name="deposit_date" type="date" defaultValue={data.deposit_date ?? today} max={project?.paid_date ?? today} /></label>
      <label className="field">Project costs (RM)<input name="cost" type="number" min="0" max="9999999.99" step="0.01" defaultValue={data.cost_cents ? data.cost_cents / 100 : ""} placeholder="0.00" /></label>
      <label className="field">Costs paid on<input name="cost_date" type="date" defaultValue={data.cost_date ?? today} max={today} /></label>
      {error && <p className="form-error full" role="alert">{error}</p>}
      <div className="modal-actions full"><button type="button" className="button quiet" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : project ? "Save changes" : "Create project"}</button></div>
    </form>
  </Modal>;
}

export function ProjectDetails({ project, today, onClose, onEdit, save }: {
  project: Project; today: string; onClose: () => void; onEdit: () => void; save: SaveProject;
}) {
  const [mode, setMode] = useState<"deposit" | "complete" | "paid" | "publish" | "delete" | null>(null);
  const [actionProject, setActionProject] = useState(project);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dates = [project.start_date, project.deposit_date, project.completed_date, project.paid_date, project.published_date];
  const nextMode = project.paid_date ? "publish" : project.completed_date ? "paid" : project.deposit_date ? "complete" : "deposit";
  const actions = { deposit: "Record deposit", complete: "Mark project complete", paid: "Record full payment", publish: "Mark published", delete: "Delete project" };
  const minimum = mode === "paid"
    ? [actionProject.completed_date ?? "", actionProject.deposit_date ?? ""].sort().at(-1)
    : mode === "complete" && !actionProject.end_date ? actionProject.start_date
    : mode === "publish" ? actionProject.paid_date ?? undefined : undefined;

  function choose(next: typeof mode) {
    setError("");
    setMode(next);
    setActionProject(project);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get("date") ?? "");
    let change: ProjectChange | null = null;
    if (mode === "deposit") {
      const cents = toCents(form.get("amount"));
      if (cents <= 0 || cents > actionProject.price_cents) return setError("Enter a deposit between RM0.01 and the full price.");
      change = { deposit_cents: cents, deposit_date: date };
    }
    if (mode === "complete") change = { completed_date: date, end_date: actionProject.end_date ?? date };
    if (mode === "paid") change = { paid_date: date };
    if (mode === "publish") change = { published_date: date };
    setBusy(true);
    setError("");
    try {
      await save(actionProject, change);
      choose(null);
      if (mode === "delete") onClose();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={project.name} caption={`${project.client} · ${project.category}`} onClose={onClose}>
    <div className="detail-summary"><ProjectMark project={project} /><Status project={project} /><span className="muted detail-due"><Clock3 size={15} />{deadline(project, today)}</span></div>
    <div className="detail-money">
      <div><span>Full price</span><strong>{money(project.price_cents)}</strong></div>
      <div><span>Deposit</span><strong>{money(project.deposit_cents)}</strong></div>
      <div><span>Remaining</span><strong>{money(balance(project))}</strong></div>
    </div>
    <p className="detail-dates">{formatDate(project.start_date, { day: "numeric", month: "short", year: "numeric" })} – {project.end_date ? formatDate(project.end_date, { day: "numeric", month: "short", year: "numeric" }) : "No end date"}</p>
    <ol className="milestones">{stages.map((stage, index) => {
      const done = index === 0 || Boolean(dates[index]);
      return <li key={stage} className={done ? "done" : ""}><span className="step-icon">{done ? <Check size={13} /> : index + 1}</span><span>{stage}</span>{index > 0 && dates[index] && <small>{formatDate(dates[index])}</small>}{index === 1 && !done && project.completed_date && <small>No deposit</small>}</li>;
    })}</ol>
    {mode ? <form className="form-grid action-form" onSubmit={submit} key={mode}>
      <strong className="full">{actions[mode]}</strong>
      {mode === "delete" ? <p className="muted full">This removes the project and its payment and cost records from your totals.</p> : <>
        {mode === "deposit" && <label className="field">Amount (RM)<input name="amount" type="number" step="0.01" min="0.01" max={actionProject.price_cents / 100} required autoFocus /></label>}
        <label className="field">Date<input type="date" name="date" defaultValue={today} min={minimum} max={today} required /></label>
        {mode === "complete" && !actionProject.end_date && <p className="muted full">This date will also be saved as the project’s end date.</p>}
        {mode === "paid" && <p className="muted full">Final amount received · {money(balance(actionProject))}</p>}
      </>}
      {error && <p className="form-error full" role="alert">{error}</p>}
      <div className="modal-actions full"><button className="button quiet" type="button" onClick={() => choose(null)} disabled={busy}>Cancel</button><button className={`button ${mode === "delete" ? "danger" : "primary"}`} disabled={busy}>{busy ? "Saving…" : actions[mode]}</button></div>
    </form> : <div className="modal-actions detail-actions">
      <button type="button" className="icon-button delete-button" title="Delete project" aria-label="Delete project" onClick={() => choose("delete")}><Trash2 size={16} /></button>
      <button type="button" className="button quiet" onClick={onEdit}><Pencil size={15} /> Edit</button>
      {!project.published_date && <>
        {nextMode === "deposit" && <button type="button" className="button quiet" onClick={() => choose("complete")}>Mark complete</button>}
        {(nextMode !== "deposit" || project.price_cents > 0) && <button type="button" className="button primary" onClick={() => choose(nextMode)}>{actions[nextMode]} <ArrowRight size={15} /></button>}
      </>}
    </div>}
  </Modal>;
}
