"use client";

import { useId } from "react";
import Image from "next/image";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Clock3, FolderKanban, Search, Wallet } from "lucide-react";
import { balance, daysBetween, deadline, formatDate, money, profitFor, projectStage, type Project } from "@/lib/projects";
import { RollingMoney, RollingNumber } from "./rolling-number";
import { ProjectMark, Status } from "./ui";

function ProfitChart({ projects, today }: { projects: Project[]; today: string }) {
  const gradient = useId();
  const [year, month] = today.split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(year, month - 6 + index, 1)).toISOString().slice(0, 7));
  const values = months.map((monthKey) => profitFor(projects, today, monthKey));
  const high = Math.max(...values, 0);
  const low = Math.min(...values, 0);
  const spread = high - low || 100;
  const points = values.map((value, index) => [28 + index * 100, 96 - (value - low) / spread * 72]);
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const zero = 96 - (0 - low) / spread * 72;
  const last = points.at(-1)!;
  return <div className="chart-plot">
    <svg viewBox="0 0 556 116" preserveAspectRatio="none" role="img" aria-label={months.map((monthKey, index) => `${formatDate(`${monthKey}-01`, { month: "long" })} ${money(values[index])}`).join(", ")}>
      <defs><linearGradient id={gradient} x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stopColor="#c9bdf1" stopOpacity=".62"/><stop offset="1" stopColor="#eee9fb" stopOpacity=".12"/></linearGradient></defs>
      {[24, 48, 72, 96].map((y) => <line key={y} x1="10" x2="546" y1={y} y2={y} stroke="#edeaf1" strokeDasharray="4 4"/>)}
      <g className="chart-series">
        <path d={`${line} L528,${zero} L28,${zero} Z`} fill={`url(#${gradient})`}/>
        <path d={line} stroke="#8f7cdb" strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" fill="none"/>
        {points.map(([x, y], index) => <circle key={x} cx={x} cy={y} r={index === 5 ? 5.5 : 3.5} fill={index === 5 ? "#dff38d" : "#fff"} stroke="#8f7cdb" strokeWidth="2"><title>{formatDate(`${months[index]}-01`, { month: "long" })} · {money(values[index])}</title></circle>)}
        <line x1={last[0]} x2={last[0]} y1={last[1] + 8} y2="107" stroke="#c8bce9" strokeDasharray="3 4" />
      </g>
    </svg>
    <div className="chart-labels">{months.map((monthKey, index) => <span key={monthKey} style={{ left: `${points[index][0] / 556 * 100}%` }}>{formatDate(`${monthKey}-01`, { month: "short" })}</span>)}</div>
  </div>;
}

export function ProjectList({ projects, today, onProject, search, setSearch, category, setCategory, categories }: {
  projects: Project[]; today: string; onProject: (project: Project) => void;
  search: string; setSearch: (value: string) => void; category: string; setCategory: (value: string) => void; categories: string[];
}) {
  const visible = projects.filter((project) => {
    const query = search.trim().toLowerCase();
    return (!category || project.category === category) && `${project.name} ${project.client} ${project.category}`.toLowerCase().includes(query);
  });

  return <section className="card projects-card" aria-labelledby="project-list-heading">
    <div className="card-heading project-heading">
      <div className="mascot-heading"><div><h2 id="project-list-heading">Projects</h2><p className="muted">{projects.length} {projects.length === 1 ? "project" : "projects"} in your workspace</p></div><Image className="mascot mascot-peeking" src="/mascot/peeking.webp" alt="" width={80} height={53} unoptimized /></div>
      <div className="table-controls">
        <label className="search"><Search size={16} /><input aria-label="Search projects" placeholder="Search projects…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
    </div>
    {visible.length === 0 ? <p className="empty">{projects.length ? "No projects match these filters." : "Add a project to start tracking deadlines and payments."}</p> : <div className="table-scroll">
      <table><thead><tr><th>Project</th><th>Status</th><th>Due date</th><th className="amount-cell">Balance</th><th><span className="sr-only">Open project</span></th></tr></thead>
        <tbody>{visible.map((project) => <tr key={project.id}>
          <td><button className="project-link" onClick={() => onProject(project)}><ProjectMark project={project} /><span><strong>{project.name}</strong><small>{project.category}</small></span></button></td>
          <td><Status project={project} /></td>
          <td>{project.end_date ? <><span className="mobile-cell-label" aria-hidden="true">Due </span><strong>{formatDate(project.end_date)}</strong><small className={projectStage(project) < 2 && daysBetween(today, project.end_date) < 0 ? "overdue" : ""}>{deadline(project, today)}</small></> : <small>{deadline(project, today)}</small>}</td>
          <td className="amount-cell"><span className="mobile-cell-label" aria-hidden="true">Balance </span><strong>{money(balance(project))}</strong></td>
          <td><button className="table-arrow" aria-label={`Open ${project.name}`} onClick={() => onProject(project)}><ArrowUpRight size={16} /></button></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

export function Dashboard({ projects, today, onCalendar, onProjects, onProject, list }: {
  projects: Project[]; today: string; onCalendar: () => void; onProjects: () => void; onProject: (project: Project) => void; list: React.ReactNode;
}) {
  const month = today.slice(0, 7);
  const monthly = profitFor(projects, today, month);
  const allTime = profitFor(projects, today);
  const outstanding = projects.reduce((total, project) => total + balance(project), 0);
  const active = projects.filter((project) => !project.completed_date);
  const upcoming = active.filter((project): project is Project & { end_date: string } => Boolean(project.end_date))
    .sort((a, b) => a.end_date.localeCompare(b.end_date)).slice(0, 4);
  return <>
    <div className="bento">
      <section className="card profit-card">
        <div className="profit-top">
          <div className="profit-label"><span className="metric-icon"><Wallet size={18} /></span><h2>All-time profit</h2></div>
          <button className="icon-button" aria-label="View projects" onClick={onProjects}><ArrowUpRight size={17} /></button>
        </div>
        <div className="profit-value">
          <strong><RollingMoney cents={allTime} /></strong>
          <p>Payments received − project costs</p>
        </div>
        <div className="profit-art">
          <Image className="profit-mascot" src="/mascot/wide-peek.webp" width={900} height={450} alt="" unoptimized />
        </div>
      </section>
      <section className="card metric-card monthly-card">
        <div className="metric-top"><span className="metric-icon green"><Wallet size={17} /></span><span className="period-tag">{formatDate(today, { month: "short" })}</span></div>
        <div className="monthly-summary">
          <div><p>Profit this month</p><strong><RollingMoney cents={monthly} /></strong></div>
          <Image className="monthly-mascot" src="/mascot/coin.webp" width={384} height={395} alt="" unoptimized />
        </div>
        <small>{monthly < 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />} Net cash this month</small>
      </section>
      <section className="card metric-card outstanding-card">
        <div className="metric-top"><span className="metric-icon"><Clock3 size={17} /></span></div>
        <div><p>Outstanding</p><strong><RollingMoney cents={outstanding} /></strong></div>
        <small>Across {projects.filter((project) => balance(project) > 0).length} unpaid projects</small>
      </section>
      <section className="card metric-card active-card">
        <div className="metric-top"><span className="metric-icon lavender"><FolderKanban size={17} /></span></div>
        <div><p>Active projects</p><strong><RollingNumber value={active.length} padStart={2} /></strong></div>
        <small>{projects.length - active.length} delivered</small>
      </section>
      <section className="card chart-card">
        <div className="card-heading"><div><h2>Profit overview</h2><p className="muted">Monthly net cash flow</p></div><span className="period-tag">Last 6 months</span></div>
        <ProfitChart projects={projects} today={today} />
      </section>
    </div>
    <div className="dashboard-bottom">
      {list}
      <section className="card deadlines-card">
        <div className="card-heading"><div><h2>Deadlines</h2><p className="muted">What’s due next</p></div><button className="icon-button" onClick={onCalendar} aria-label="Open calendar"><CalendarDays size={17} /></button></div>
        <ul className="deadline-list">
          {upcoming.map((project) => <li key={project.id}><button onClick={() => onProject(project)}>
            <span className="date-block"><strong>{Number(project.end_date.slice(8))}</strong><small>{formatDate(project.end_date, { month: "short" })}</small></span>
            <span className="deadline-name"><strong>{project.name}</strong><small>{deadline(project, today)}</small></span><ArrowUpRight size={15} />
          </button></li>)}
          {upcoming.length === 0 && <li className="empty">You’re all caught up.</li>}
        </ul>
        <button className="text-button" onClick={onCalendar}>View calendar <ArrowRight size={15} /></button>
      </section>
    </div>
  </>;
}
