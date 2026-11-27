"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Clock3, FolderKanban, Search, Wallet } from "lucide-react";
import { balance, daysBetween, deadline, formatDate, money, profitFor, projectStage, type Project } from "@/lib/projects";
import { RollingMoney, RollingNumber } from "./rolling-number";
import { ProjectMark, Status } from "./ui";

function compactMoney(cents: number) {
  const value = cents / 100;
  const abs = Math.abs(value);
  const text = abs >= 1000 ? `${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : abs.toFixed(0);
  return `${value < 0 ? "-" : ""}${text}`;
}

function ProfitChart({ projects, today }: { projects: Project[]; today: string }) {
  const gradient = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [year, month] = today.split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(year, month - 6 + index, 1)).toISOString().slice(0, 7));
  const values = months.map((monthKey) => profitFor(projects, today, monthKey));
  const height = 150, left = 12, right = 12, top = 26, bottom = 24;
  const high = Math.max(...values, 0);
  const low = Math.min(...values, 0);
  const spread = high - low || 100;
  const innerW = width - left - right, innerH = height - top - bottom;
  const x = (index: number) => left + innerW * (0.04 + 0.92 * index / 5);
  const y = (value: number) => top + innerH - (value - low) / spread * innerH;
  const points = values.map((value, index) => [x(index), y(value)] as const);
  const line = points.map(([px, py], index) => `${index === 0 ? "M" : "L"}${px},${py}`).join(" ");
  const zero = y(0);
  const monthName = (index: number, style: "short" | "long") => formatDate(`${months[index]}-01`, { month: style });
  const pick = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const rel = clientX - box.left;
    setActive(points.reduce((best, [px], index) => Math.abs(px - rel) < Math.abs(points[best][0] - rel) ? index : best, 0));
  };
  const tip = active === null ? null : points[active];
  return <div className="chart-plot" ref={wrap} onPointerMove={(event) => pick(event.clientX)} onPointerLeave={() => setActive(null)}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={months.map((_, index) => `${monthName(index, "long")} ${money(values[index])}`).join(", ")}>
      <defs><linearGradient id={gradient} x2="0" y2="1"><stop stopColor="#c9bdf1" stopOpacity=".62"/><stop offset="1" stopColor="#eee9fb" stopOpacity=".12"/></linearGradient></defs>
      {[0, 1, 2, 3].map((step) => <line key={step} x1={left} x2={width - right} y1={top + innerH * step / 3} y2={top + innerH * step / 3} stroke="#edeaf1" strokeDasharray="4 4"/>)}
      <line x1={left} x2={width - right} y1={zero} y2={zero} stroke="#d9d3e6"/>
      <path d={`${line} L${points[5][0]},${zero} L${points[0][0]},${zero} Z`} fill={`url(#${gradient})`}/>
      <path d={line} stroke="#8f7cdb" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
      {active !== null && <line x1={points[active][0]} x2={points[active][0]} y1={top - 6} y2={height - bottom} stroke="#c8bce9" strokeDasharray="3 4"/>}
      {points.map(([px, py], index) => <g key={months[index]}>
        <circle cx={px} cy={py} r={index === 5 || index === active ? 5.5 : 3.5} fill={index === 5 ? "#dff38d" : "#fff"} stroke="#8f7cdb" strokeWidth="2"/>
        <text x={px} y={py - 11} textAnchor="middle" fontSize="10" fontWeight="700" fill={values[index] < 0 ? "#c0504d" : "#4b4458"}>{compactMoney(values[index])}</text>
        <text x={px} y={height - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill="#6b6574">{monthName(index, "short")}</text>
      </g>)}
    </svg>
    {tip && active !== null && <div className="chart-tip" style={{ left: Math.min(Math.max(tip[0], 60), width - 60), top: Math.max(tip[1] - 54, 0) }}><small>{monthName(active, "long")} {months[active].slice(0, 4)}</small><strong>{money(values[active])}</strong></div>}
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
