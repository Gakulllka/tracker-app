"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

const DOMAIN = "finance";

function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface SerializedPlanfactTask {
  id: string;
  title: string;
  totalEstimate: number;
  budgetAllocated: number;
  factHours: number;
  priority: number;
  status: string;
  daysInStatus: number;
  isFirstToCut: boolean;
  planfixLink: string | null;
  domain: string;
  monthKey: string;
  createdAt: string;
  updatedAt: string;
}

export async function getTasks(mk?: string): Promise<SerializedPlanfactTask[]> {
  const key = mk ?? monthKey();
  const tasks = await prisma.planfactTask.findMany({
    where: { domain: DOMAIN, monthKey: key },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  return tasks.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

export async function updateTaskStatus(id: string, status: string): Promise<void> {
  await prisma.planfactTask.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/dashboard");
}

export async function updateBudgetAllocated(id: string, budgetAllocated: number): Promise<void> {
  await prisma.planfactTask.update({
    where: { id },
    data: { budgetAllocated: Math.max(0, budgetAllocated) },
  });
  revalidatePath("/dashboard");
}

export async function updatePriority(id: string, priority: number): Promise<void> {
  await prisma.planfactTask.update({
    where: { id },
    data: { priority: Math.min(5, Math.max(1, priority)) },
  });
  revalidatePath("/dashboard");
}

export async function toggleFirstToCut(id: string, value: boolean): Promise<void> {
  await prisma.planfactTask.update({
    where: { id },
    data: { isFirstToCut: value },
  });
  revalidatePath("/dashboard");
}

/** Взять задачи из беклога: обновить статус + budgetAllocated */
export async function takeTasksFromBacklog(
  assignments: Array<{ id: string; budgetAllocated: number }>
): Promise<void> {
  await Promise.all(
    assignments.map(({ id, budgetAllocated }) =>
      prisma.planfactTask.update({
        where: { id },
        data: { status: "В работе", budgetAllocated: Math.max(0, budgetAllocated) },
      })
    )
  );
  revalidatePath("/dashboard");
}

/** Вернуть задачу в беклог (отменить из плана) */
export async function returnToBacklog(id: string): Promise<void> {
  await prisma.planfactTask.update({
    where: { id },
    data: { status: "Новая", budgetAllocated: 0 },
  });
  revalidatePath("/dashboard");
}
