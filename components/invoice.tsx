"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Download, FileText, Plus, Trash2 } from "lucide-react";
import { addDays, balance, formatDate, money, type Project } from "@/lib/projects";
import { downloadInvoice, invoiceTotal, type InvoiceDraft, type LineItem } from "@/lib/invoice";

const lineItem = (description = "", rate = ""): LineItem => ({ id: crypto.randomUUID(), description, quantity: "1", rate });

function loadDraft(storageKey: string, today: string): InvoiceDraft {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw);
  } catch {
    // The invoice editor still works if browser storage is unavailable.
  }
  return {
    number: `INV-${today.replaceAll("-", "")}-01`, issued: today, due: addDays(today, 14), sender: "DnishDev",
    senderDetails: "", recipient: "", recipientDetails: "", paid: "0", notes: "", lines: [lineItem()],
  };
}

export function Invoice({ projects, today, owner }: { projects: Project[]; today: string; owner: string }) {
  const storageKey = `dnishdev-invoice-v1-${owner}`;
  const [draft, setDraft] = useState(() => loadDraft(storageKey, today));
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const total = invoiceTotal(draft.lines);
  const paid = Math.round(Number(draft.paid) * 100);
  const selectedProject = projects.find((project) => project.id === projectId);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* Draft can still be downloaded. */ }
  }, [draft, storageKey]);

  function field(name: Exclude<keyof InvoiceDraft, "lines">, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function updateLine(id: string, key: "description" | "quantity" | "rate", value: string) {
    setDraft((current) => ({ ...current, lines: current.lines.map((line) => line.id === id ? { ...line, [key]: value } : line) }));
  }

  function fillFromProject(project: Project) {
    setDraft((current) => ({
      ...current, recipient: project.client, recipientDetails: project.client === current.recipient ? current.recipientDetails : "",
      paid: ((project.price_cents - balance(project)) / 100).toFixed(2),
      lines: [lineItem(`${project.name} · ${project.category}`, (project.price_cents / 100).toFixed(2))],
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = { ...draft, number: draft.number.trim(), sender: draft.sender.trim(), recipient: draft.recipient.trim() };
    if (!trimmed.sender || !trimmed.recipient || !trimmed.number || draft.lines.some((item) => !item.description.trim())) {
      return setError("Enter an invoice number, both company names and a description for each item.");
    }
    if ([draft.senderDetails, draft.recipientDetails].some((details) => details.trim().split("\n").length > 6)) {
      return setError("Use up to six lines for each address and email block.");
    }
    if (paid > total) return setError("Amount already paid can’t exceed the invoice subtotal.");
    setError("");
    setBusy(true);
    try {
      await downloadInvoice(trimmed);
    } catch {
      setError("Couldn’t generate the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="invoice-grid" onSubmit={submit}>
    <section className="card invoice-editor" aria-label="Invoice details">
      <div className="card-heading"><div><h2>Invoice details</h2><p className="muted">Fill in the template or start from an existing project.</p></div></div>
      <div className="invoice-prefill">
        <label className="field">Project<select aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Choose a project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
        <button className="button quiet" type="button" disabled={!selectedProject} onClick={() => selectedProject && fillFromProject(selectedProject)}>Use project details</button>
      </div>
      <div className="form-grid">
        <label className="field full">Invoice number<input value={draft.number} onChange={(event) => field("number", event.target.value)} maxLength={40} required /></label>
        <label className="field">Issue date<input type="date" value={draft.issued} onChange={(event) => field("issued", event.target.value)} required /></label>
        <label className="field">Due date<input type="date" value={draft.due} min={draft.issued} onChange={(event) => field("due", event.target.value)} required /></label>
        <label className="field">Your company<input value={draft.sender} onChange={(event) => field("sender", event.target.value)} maxLength={100} required /></label>
        <label className="field">Client company<input value={draft.recipient} onChange={(event) => field("recipient", event.target.value)} maxLength={100} placeholder="Company name" required /></label>
        <label className="field">Your address and email<textarea rows={3} maxLength={260} value={draft.senderDetails} onChange={(event) => field("senderDetails", event.target.value)} /></label>
        <label className="field">Client address and email<textarea rows={3} maxLength={260} value={draft.recipientDetails} onChange={(event) => field("recipientDetails", event.target.value)} /></label>
      </div>
      <div className="line-items">
        <h3>Line items</h3>
        {draft.lines.map((item) => <div className="line-item" key={item.id}>
          <label className="field">Description<input value={item.description} maxLength={180} placeholder="e.g. Website design" onChange={(event) => updateLine(item.id, "description", event.target.value)} required /></label>
          <label className="field">Qty<input type="number" min="1" max="999" value={item.quantity} onChange={(event) => updateLine(item.id, "quantity", event.target.value)} required /></label>
          <label className="field">Rate (RM)<input type="number" min="0" max="9999999.99" step="0.01" value={item.rate} onChange={(event) => updateLine(item.id, "rate", event.target.value)} required /></label>
          <button className="icon-button" type="button" aria-label="Remove item" disabled={draft.lines.length === 1} onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((line) => line.id !== item.id) }))}><Trash2 size={16} /></button>
        </div>)}
        <button className="text-button" type="button" disabled={draft.lines.length >= 20} onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, lineItem()] }))}><Plus size={16} /> Add line item</button>
      </div>
      <div className="form-grid">
        <label className="field">Amount already paid (RM)<input type="number" min="0" step="0.01" value={draft.paid} onChange={(event) => field("paid", event.target.value)} /></label>
        <label className="field full">Payment details or notes<textarea rows={3} maxLength={500} value={draft.notes} onChange={(event) => field("notes", event.target.value)} placeholder="Bank name, account number or payment instructions" /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="invoice-actions"><button type="submit" className="button primary" disabled={busy}><Download size={17} /> {busy ? "Generating…" : "Download PDF"}</button></div>
    </section>
    <aside className="card invoice-preview">
      <div className="card-heading"><div><h2>Invoice preview</h2><p className="muted">Updates as you edit</p></div><span className="metric-icon lavender"><FileText size={17} /></span></div>
      <div className="preview-sheet">
        <div className="preview-banner"><div><strong>INVOICE</strong><span>{draft.number || "Invoice number"}</span></div><div><small>ISSUED</small><span>{draft.issued ? formatDate(draft.issued) : "—"}</span>{draft.due && <span>Due {formatDate(draft.due)}</span>}</div></div>
        <div className="preview-parties"><div><small>FROM</small><strong>{draft.sender || "Your company"}</strong><span>{draft.senderDetails}</span></div><div><small>BILL TO</small><strong>{draft.recipient || "Client company"}</strong><span>{draft.recipientDetails}</span></div></div>
        <div className="preview-lines"><div><strong>Description</strong><strong>Amount</strong></div>{draft.lines.map((item) => <div key={item.id}><span>{item.description || "Project service"}</span><span>{money(Number(item.quantity) * Math.round(Number(item.rate) * 100))}</span></div>)}</div>
        <div className="preview-totals"><div><span>Subtotal</span><strong>{money(total)}</strong></div><div><span>Paid</span><strong>{money(paid)}</strong></div><div className="preview-balance"><strong>Balance due</strong><strong>{money(total - paid)}</strong></div></div>
        {draft.notes && <p className="preview-notes">{draft.notes}</p>}
      </div>
    </aside>
  </form>;
}
