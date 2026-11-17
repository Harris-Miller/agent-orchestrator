/**
 * The Subagent report: the message the Harness sends a parent when a background Spawned subagent session ends. One
 * neutral shape for every provider (parents are a mix; it does not imitate Claude's `<task-notification>`).
 */
import { outcomeForAgent } from './subagentLinks.ts';
import type { SubagentOutcome } from './subagentLinks.ts';

/** The task is echoed so the parent knows which of its subagents this is; long ones are cut. */
const MAX_REPORTED_TASK_CHARS = 1000;

export const buildSubagentReport = (report: {
  readonly description: string;
  readonly id: string;
  readonly outcome: SubagentOutcome;
  readonly task: string;
}): string => {
  const { status, text: body } = outcomeForAgent(report.outcome);
  const task =
    report.task.length <= MAX_REPORTED_TASK_CHARS ? report.task : `${report.task.slice(0, MAX_REPORTED_TASK_CHARS)}…`;
  return `<subagent-report id="${report.id}" status="${status}">\nsubagent: ${report.description}\ntask: ${task}\n\n${body}\n</subagent-report>`;
};
