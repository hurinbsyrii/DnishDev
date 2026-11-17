export const categories = [
  "Landing Page",
  "E-commerce",
  "Business Website",
  "Brand Website",
  "Portfolio",
  "Blog / CMS",
  "Web App",
  "Dashboard / Admin Panel",
  "Website Redesign",
  "Maintenance",
  "Other",
];
export const stages = ["Project won", "Payment received", "Project complete", "Paid in full", "Published"] as const;
export const stageColors = ["lilac", "blue", "amber", "mint", "mint"];

export type Payment = { id: string; amount_cents: number; date: string };

export type Project = {
  id: string;
  name: string;
  client: string;
  category: string;
  price_cents: number;
  deposit_cents: number;
  deposit_date: string | null;
  payments: Payment[];
  cost_cents: number;
  cost_date: string | null;
  start_date: string;
  end_date: string | null;
  completed_date: string | null;
  paid_date: string | null;
  published_date: string | null;
  version: number;
};

export type ProjectInput = Omit<Project, "id" | "version">;
export type ProjectChange = Partial<ProjectInput>;

const dayMs = 86400000;
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
});

export function todayInMalaysia() {
  const [day, month, year] = dateFormatter.format(new Date()).split("/");
  return `${year}-${month}-${day}`;
}

export function dateValue(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return dateKey(new Date(dateValue(date).getTime() + days * dayMs));
}

export function daysBetween(start: string, end: string) {
  return Math.round((dateValue(end).getTime() - dateValue(start).getTime()) / dayMs);
}

export function formatDate(date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return dateValue(date).toLocaleDateString("en-GB", { ...options, timeZone: "UTC" });
}

export function isoWeek(key: string) {
  const date = dateValue(key);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const first = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - first) / dayMs + 1) / 7);
}

const currency = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });
export const money = (cents: number) => currency.format(cents / 100);

export function toCents(amount: FormDataEntryValue | null) {
  return Math.round(Number(amount) * 100);
}

export function projectStage(project: Project) {
  if (project.published_date) return 4;
  if (project.paid_date) return 3;
  if (project.completed_date) return 2;
  return amountPaid(project) > 0 ? 1 : 0;
}

export function balance(project: Project) {
  return project.price_cents - amountPaid(project);
}

// Older browser workspaces recorded the final payment only as a date.
export function additionalPayments(project: Project): Payment[] {
  return project.payments ?? (project.paid_date && project.price_cents > project.deposit_cents
    ? [{ id: `legacy-${project.id}`, amount_cents: project.price_cents - project.deposit_cents, date: project.paid_date }]
    : []);
}

export function paymentHistory(project: Project): Payment[] {
  return [
    ...(project.deposit_date ? [{ id: "deposit", amount_cents: project.deposit_cents, date: project.deposit_date }] : []),
    ...additionalPayments(project),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function amountPaid(project: Project) {
  return project.deposit_cents + additionalPayments(project).reduce((total, payment) => total + payment.amount_cents, 0);
}

export function paymentChange(project: Project, change: ProjectChange, today: string): ProjectChange {
  const next = { ...project, payments: additionalPayments(project), ...change };
  const history = paymentHistory(next);
  if (!Number.isInteger(next.price_cents) || next.price_cents < 0 || next.price_cents > 999999999) throw new Error("Enter a valid project price.");
  if (!Number.isInteger(next.deposit_cents) || next.deposit_cents < 0 || Boolean(next.deposit_cents) !== Boolean(next.deposit_date)) throw new Error("Enter a valid deposit and received date.");
  if (history.some((payment) => !Number.isInteger(payment.amount_cents) || payment.amount_cents <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(payment.date) || Number.isNaN(dateValue(payment.date).getTime()) || dateKey(dateValue(payment.date)) !== payment.date || payment.date > today)) throw new Error("Payments need a positive amount and a valid received date no later than today.");
  if (next.payments.some((payment) => !payment.id || payment.id === "deposit") || new Set(next.payments.map((payment) => payment.id)).size !== next.payments.length) throw new Error("Payment records must have unique IDs.");
  const received = amountPaid(next);
  if (received > next.price_cents) throw new Error("Payments received can’t exceed the project price.");
  const paidDate = received === next.price_cents ? history.at(-1)?.date ?? next.paid_date : null;
  if (next.published_date && (!next.completed_date || !paidDate || next.published_date < paidDate || next.published_date < next.completed_date)) throw new Error("A published project must be complete and fully paid on or before its publication date.");
  return { ...change, payments: next.payments, paid_date: paidDate };
}

export function deadline(project: Project, today: string) {
  if (project.completed_date) return "Delivered";
  if (!project.end_date) return "No end date";
  const days = daysBetween(today, project.end_date);
  if (days === 0) return "Due today";
  const count = Math.abs(days);
  return `${count} ${count === 1 ? "day" : "days"} ${days > 0 ? "left" : "overdue"}`;
}

export function projectTransactions(project: Project) {
  return [
    ...paymentHistory(project).map((payment) => ({ date: payment.date, amount: payment.amount_cents })),
    { date: project.cost_date, amount: -project.cost_cents },
  ];
}

export function profitFor(projects: Project[], today: string, month?: string) {
  return projects.flatMap(projectTransactions).reduce((total, item) => {
    if (!item.date || item.date > today || (month && !item.date.startsWith(month))) return total;
    return total + item.amount;
  }, 0);
}

export function newProject(today: string): ProjectInput {
  return {
    name: "", client: "", category: "", price_cents: 0,
    deposit_cents: 0, deposit_date: null, payments: [], cost_cents: 0, cost_date: null,
    start_date: today, end_date: null,
    completed_date: null, paid_date: null, published_date: null,
  };
}

export function demoProjects(today: string): Project[] {
  const sample: ProjectInput[] = [
    { ...newProject(today), name: "Studio Forma", client: "Forma Collective", category: "Brand Website", price_cents: 680000, deposit_cents: 340000, deposit_date: addDays(today, -5), cost_cents: 32000, cost_date: addDays(today, -4), start_date: addDays(today, -5), end_date: addDays(today, 4) },
    { ...newProject(today), name: "Kopi Kecil Store", client: "Kopi Kecil", category: "E-commerce", price_cents: 820000, deposit_cents: 410000, deposit_date: addDays(today, -3), start_date: addDays(today, -3), end_date: addDays(today, 9) },
    { ...newProject(today), name: "Northstar Launch", client: "Northstar Labs", category: "Landing Page", price_cents: 360000, start_date: addDays(today, 2), end_date: addDays(today, 13) },
    { ...newProject(today), name: "The Monday Edit", client: "Monday Studio", category: "Portfolio", price_cents: 580000, deposit_cents: 290000, deposit_date: addDays(today, -32), cost_cents: 37000, cost_date: addDays(today, -30), start_date: addDays(today, -32), end_date: addDays(today, -18), completed_date: addDays(today, -20), paid_date: addDays(today, -19), published_date: addDays(today, -18) },
    { ...newProject(today), name: "Common Ground", client: "Common Ground Studio", category: "Web App", price_cents: 920000, deposit_cents: 460000, deposit_date: addDays(today, -76), cost_cents: 65000, cost_date: addDays(today, -71), start_date: addDays(today, -76), end_date: addDays(today, -46), completed_date: addDays(today, -50), paid_date: addDays(today, -48), published_date: addDays(today, -46) },
  ];
  return sample.map((project, index) => ({ ...project, payments: project.paid_date && project.price_cents > project.deposit_cents ? [{ id: `demo-payment-${index}`, amount_cents: project.price_cents - project.deposit_cents, date: project.paid_date }] : [], id: `demo-${index}`, version: 1 }));
}
