"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, dateKey, dateValue, formatDate, isoWeek, type Project } from "@/lib/projects";
import { ProjectMark } from "./ui";

function overlaps(project: Project, first: string, last = first) {
  return project.start_date <= last && (project.end_date ?? project.start_date) >= first;
}

export function Calendar({ projects, today, onProject }: { projects: Project[]; today: string; onProject: (project: Project) => void }) {
  const [selected, setSelected] = useState(today);
  const month = selected.slice(0, 7);
  const first = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const last = dateKey(new Date(Date.UTC(year, monthNumber, 0)));
  const start = addDays(first, -((dateValue(first).getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  const selectedProjects = projects.filter((project) => overlaps(project, selected));

  function move(offset: number) {
    setSelected(dateKey(new Date(Date.UTC(year, monthNumber - 1 + offset, 1))));
  }

  return <section className="card calendar-card" aria-label="Project calendar">
    <div className="card-heading">
      <div className="mascot-heading"><div className="calendar-month" key={month}><h2>{formatDate(first, { month: "long", year: "numeric" })}</h2><p className="muted">{projects.filter((project) => overlaps(project, first, last)).length} scheduled projects</p></div><Image className="mascot mascot-waving" src="/mascot/waving.webp" alt="" width={62} height={57} unoptimized /></div>
      <div className="calendar-controls">
        <button className="button quiet" onClick={() => setSelected(today)}>Today</button>
        <button className="icon-button" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft size={19} /></button>
        <button className="icon-button" aria-label="Next month" onClick={() => move(1)}><ChevronRight size={19} /></button>
      </div>
    </div>
    <div className="calendar-scroll">
      <table className="month-grid">
        <thead><tr>{["Week", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <th key={day}>{day}</th>)}</tr></thead>
        <tbody>{Array.from({ length: 6 }, (_, week) => <tr key={days[week * 7]}>
          <th scope="row">W{isoWeek(days[week * 7])}</th>
          {days.slice(week * 7, week * 7 + 7).map((day) => {
            const scheduled = projects.filter((project) => overlaps(project, day));
            return <td key={day} className={day.startsWith(month) ? "" : "outside-month"}>
              <button className={`calendar-day ${day === selected ? "selected" : ""}`} onClick={() => setSelected(day)} aria-pressed={day === selected} aria-label={`${formatDate(day, { day: "numeric", month: "long", year: "numeric" })}, ${scheduled.length} projects`}>
                <span className={`day-number ${day === today ? "is-today" : ""}`}>{Number(day.slice(8))}</span>
                {scheduled.slice(0, 2).map((project, index) => <span key={project.id} className={`calendar-event tone-${index}`}>{project.name}{project.end_date === day ? " · Due" : ""}</span>)}
                {scheduled.length > 2 && <span className="more-events">+{scheduled.length - 2} more</span>}
              </button>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="calendar-agenda" key={selected}>
      <h3>{formatDate(selected, { weekday: "long", day: "numeric", month: "long" })} <span>· Week {isoWeek(selected)}</span></h3>
      {selectedProjects.length === 0 && <p className="muted">No projects scheduled for this day.</p>}
      {selectedProjects.map((project) => <button className="agenda-row" key={project.id} onClick={() => onProject(project)}><ProjectMark project={project} /><span><strong>{project.name}</strong><small>{formatDate(project.start_date)} – {project.end_date ? formatDate(project.end_date) : "No end date"}</small></span><ArrowUpRight size={16} /></button>)}
    </div>
  </section>;
}
