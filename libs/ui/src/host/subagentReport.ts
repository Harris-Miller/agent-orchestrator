/**
 * The Subagent report: the message the Harness sends a parent when a background Spawned subagent session ends. One
 * neutral shape for every provider (parents are a mix; it does not imitate Claude's `<task-notification>`).
 */
import type { SubagentOutcome } from './subagentLinks.ts';

/** The task is echoed so the parent knows which of its subagents this is; long ones are cut. */
const MAX_REPORTED_TASK_CHARS = 1000;

const NO_FINAL_MESSAGE = 'The subagent finished without producing a final message.';

export const buildSubagentReport = (report: {
  readonly description: string;
  readonly id: string;
  readonly outcome: SubagentOutcome;
  readonly task: string;
}): string => {
  const { outcome } = report;
  // A turn that ended without any message is a failure to the parent: there is nothing to act on.
  const empty = outcome.status === 'completed' && outcome.text.trim() === '';
  const status = empty ? 'failed' : outcome.status;
  const body = empty ? NO_FINAL_MESSAGE : outcome.text;
  const task =
    report.task.length <= MAX_REPORTED_TASK_CHARS ? report.task : `${report.task.slice(0, MAX_REPORTED_TASK_CHARS)}…`;
  return `<subagent-report id="${report.id}" status="${status}">\nsubagent: ${report.description}\ntask: ${task}\n\n${body}\n</subagent-report>`;
};
