import { getTasks } from "@/app/actions/planfact";
import { DashboardClient } from "./dashboard-client";

export const metadata = {
  title: "Delta — Управленческий дашборд план-факта",
};

export default async function DashboardPage() {
  const tasks = await getTasks();
  return <DashboardClient initialTasks={tasks} />;
}
