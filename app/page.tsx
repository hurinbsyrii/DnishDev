import { connection } from "next/server";
import Workspace from "@/components/workspace";
import { todayInMalaysia } from "@/lib/projects";

export default async function Home() {
  await connection();
  return <Workspace initialDay={todayInMalaysia()} />;
}
