import { AgentTaskOutputWindow } from "@/components/agent-task-output-window";

type AgentTaskOutputPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

const readOptionalValue = (value: string | string[] | undefined): string | null => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) {
    return null;
  }

  const trimmed = rawValue.trim();
  return trimmed ? trimmed : null;
};

const readOptionalPositiveNumber = (value: string | string[] | undefined): number | null => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue || !/^\d+$/u.test(rawValue)) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export default async function AgentTaskOutputPage({ searchParams }: AgentTaskOutputPageProps) {
  const resolvedSearchParams = await searchParams;
  const threadId = readOptionalValue(resolvedSearchParams.threadId);
  const assignmentNumber = readOptionalPositiveNumber(resolvedSearchParams.assignmentNumber);
  const laneId = readOptionalValue(resolvedSearchParams.laneId);
  const roleId = readOptionalValue(resolvedSearchParams.roleId);

  if (!threadId) {
    return (
      <div className="task-output-window">
        <header className="task-output-window-header">
          <div className="task-output-window-copy">
            <p className="eyebrow">Agent Task Output</p>
            <h1>Invalid task output window request</h1>
            <p>Open this window from a thread log card so the task context is filled in.</p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <AgentTaskOutputWindow
      assignmentNumber={assignmentNumber}
      laneId={laneId}
      roleId={roleId}
      threadId={threadId}
    />
  );
}
