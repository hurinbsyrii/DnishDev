"use client";

import dynamic from "next/dynamic";
import { todayInMalaysia } from "@/lib/projects";

const Workspace = dynamic(() => import("@/components/workspace"), {
  ssr: false,
  loading: () => <div className="login-screen"><p className="muted" role="status">Loading DevDash…</p></div>,
});

export default function Home() {
  return <Workspace initialDay={todayInMalaysia()} />;
}
