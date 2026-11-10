"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { projectStage, stageColors, stages, type Project } from "@/lib/projects";

export function Modal({ title, caption, onClose, children }: { title: string; caption?: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return <dialog ref={dialog} className="modal" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="modal-heading">
      <div><h2 id={titleId}>{title}</h2>{caption && <p className="muted">{caption}</p>}</div>
      <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button>
    </div>
    {children}
  </dialog>;
}

export function Status({ project }: { project: Project }) {
  const stage = projectStage(project);
  return <span className={`status ${stageColors[stage]}`}><i />{stages[stage]}</span>;
}

export function ProjectMark({ project }: { project: Project }) {
  const tone = [...project.category].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
  return <span className={`project-mark tone-${tone}`} aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span>;
}
