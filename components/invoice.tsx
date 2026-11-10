"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Download, FileText, Plus, Trash2 } from "lucide-react";
import { addDays, balance, money, type Project } from "@/lib/projects";
import { downloadInvoice, formatInvoiceDate, invoiceLineTotal, invoiceNumber, invoiceTotal, type InvoiceDraft, type LineItem } from "@/lib/invoice";
import { Modal } from "./ui";

const lineItem = (description = "", rate = ""): LineItem => ({ id: crypto.randomUUID(), description, quantity: "1", rate });

function newDraft(today: string, sender = "DnishDev", senderDetails = ""): InvoiceDraft {
  return {
    number: invoiceNumber(today), issued: today, due: addDays(today, 14), sender, senderDetails,
    recipient: "", recipientDetails: "", paid: "0", notes: "", lines: [lineItem()],
  };
}

function loadDraft(storageKey: string, today: string): InvoiceDraft {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const saved = JSON.parse(raw) as InvoiceDraft;
      return { ...saved, number: saved.number?.trim() || invoiceNumber(today) };
    }
  } catch {
    // The invoice editor still works if browser storage is unavailable.
  }
  return newDraft(today);
}

export function Invoice({ projects, today, owner }: { projects: Project[]; today: string; owner: string }) {
  const storageKey = `dnishdev-invoice-v1-${owner}`;
  const [draft, setDraft] = useState(() => loadDraft(storageKey, today));
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const total = invoiceTotal(draft.lines);
  const paid = Math.round(Number(draft.paid) * 100);
  const selectedProject = projects.find((project) => project.id === projectId);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* Draft can still be downloaded. */ }
  }, [draft, storageKey]);

  function field(name: Exclude<keyof InvoiceDraft, "lines" | "number">, value: string) {
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

  function startNewInvoice() {
    setDraft(newDraft(today, draft.sender, draft.senderDetails));
    setProjectId("");
    setError("");
    setConfirmNew(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = { ...draft, sender: draft.sender.trim(), recipient: draft.recipient.trim() };
    if (!trimmed.sender || !trimmed.recipient || draft.lines.some((item) => !item.description.trim())) {
      return setError("Enter both company names and a description for each item.");
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

  return <><form className="invoice-grid" onSubmit={submit}>
    <section className="card invoice-editor" aria-label="Invoice details">
      <div className="card-heading invoice-heading">
        <div><h2>Invoice details</h2><p className="muted">Fill in the template or start from an existing project.</p></div>
        <button type="button" className="button quiet" disabled={busy} onClick={() => setConfirmNew(true)}><Plus size={15} /> New invoice</button>
      </div>
      <div className="invoice-prefill">
        <label className="field">Project<select aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Choose a project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
        <button className="button quiet" type="button" disabled={!selectedProject} onClick={() => selectedProject && fillFromProject(selectedProject)}>Use project details</button>
      </div>
      <div className="form-grid">
        <label className="field full">Invoice number<input className="invoice-number" value={draft.number} readOnly /></label>
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
    <aside className="card invoice-preview" aria-label="Invoice preview">
      <div className="card-heading"><div><h2>Invoice preview</h2><p className="muted">Updates as you edit</p></div><span className="metric-icon lavender"><FileText size={17} /></span></div>
      <div className="preview-sheet">
        <header className="preview-banner">
          <div className="preview-brand"><span aria-hidden="true" /><strong>{draft.sender || "Your company"}</strong></div>
          <div className="preview-title"><h3>Invoice</h3><p>Issued {formatInvoiceDate(draft.issued) || "—"}</p></div>
        </header>
        <div className="preview-parties"><div><h4>Invoice to</h4><strong>{draft.recipient || "Client company"}</strong><p>{draft.recipientDetails}</p></div><div><h4>Bill from</h4><strong>{draft.sender || "Your company"}</strong><p>{draft.senderDetails}</p></div></div>
        <div className="preview-meta"><span>Payment due {formatInvoiceDate(draft.due) || "—"}</span><strong>Invoice no. {draft.number}</strong></div>
        <table className="preview-lines">
          <thead><tr><th scope="col">No.</th><th scope="col">Item description</th><th className="preview-detail" scope="col">Price</th><th className="preview-detail" scope="col">Qty</th><th scope="col">Total</th></tr></thead>
          <tbody>{draft.lines.map((item, index) => <tr key={item.id}>
            <td>{index + 1}</td>
            <td>{item.description || "Project service"}<small className="preview-quantity">{item.quantity || "0"} × {money(Math.round(Number(item.rate) * 100))}</small></td>
            <td className="preview-detail">{money(Math.round(Number(item.rate) * 100))}</td><td className="preview-detail">{item.quantity || "0"}</td><td>{money(invoiceLineTotal(item))}</td>
          </tr>)}</tbody>
        </table>
        <div className="preview-summary">
          <dl className="preview-balance"><dt>Total due</dt><dd>{money(total - paid)}</dd></dl>
          <dl className="preview-totals"><div><dt>Subtotal</dt><dd>{money(total)}</dd></div><div><dt>Amount paid</dt><dd>{money(paid)}</dd></div></dl>
        </div>
        {draft.notes.trim() && <div className="preview-notes"><h4>Payment details / notes</h4><p>{draft.notes}</p></div>}
        <footer className="preview-footer"><span>Invoice {draft.number}</span><span>MYR</span></footer>
      </div>
    </aside>
  </form>
  {confirmNew && <Modal title="Start a new invoice" caption="This replaces the current draft and keeps your company details." onClose={() => setConfirmNew(false)}>
    <div className="modal-actions"><button type="button" className="button quiet" onClick={() => setConfirmNew(false)}>Cancel</button><button type="button" className="button primary" onClick={startNewInvoice}>Start new invoice</button></div>
  </Modal>}
  </>;
}
