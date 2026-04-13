const vscode = acquireVsCodeApi();

const state = {
  server: null,
  form: {
    input: "",
    title: "",
    threadId: "",
    repositoryId: "",
    reset: false,
    deleteExistingBranches: false,
  },
  feedbackDrafts: {},
};

const root = document.getElementById("app");

const statusLabels = {
  planning: "Planning",
  running: "Running",
  awaiting_human_approval: "Awaiting Approval",
  completed: "Completed",
  approved: "Approved",
  needs_revision: "Needs Revision",
  failed: "Failed",
  queued: "Queued",
  coding: "Coding",
  reviewing: "Reviewing",
  idle: "Idle",
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatDateTime = (value) => {
  if (!value) {
    return "Not available";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const formatStatus = (value) => statusLabels[value] ?? value ?? "Unknown";

const buildFeedbackKey = (threadId, assignmentNumber, scope, laneId) =>
  `${threadId}:${assignmentNumber}:${scope}:${laneId ?? "request-group"}`;

const getLatestAssignment = (detail) => {
  if (
    !detail ||
    !Array.isArray(detail.dispatchAssignments) ||
    detail.dispatchAssignments.length === 0
  ) {
    return null;
  }

  return detail.dispatchAssignments[detail.dispatchAssignments.length - 1];
};

const getApprovalAction = (lane) => {
  if (!lane) {
    return null;
  }

  if (lane.status === "awaiting_human_approval") {
    return {
      target: "proposal",
      label: "Approve proposal",
    };
  }

  if (
    lane.pullRequest &&
    lane.pullRequest.status === "awaiting_human_approval" &&
    !lane.pullRequest.humanApprovedAt
  ) {
    return {
      target: "pull_request",
      label: "Approve final PR",
    };
  }

  return null;
};

const getConnectionClassName = (connection) => {
  if (!connection || connection.status === "idle") {
    return "pending";
  }

  if (connection.status === "connected") {
    return "connected";
  }

  if (connection.status === "error") {
    return "error";
  }

  return "pending";
};

const postMessage = (type, payload = {}) => {
  vscode.postMessage({
    type,
    payload,
  });
};

const syncFormWithWorkspace = () => {
  const repositories = state.server?.workspace?.repositoryPicker?.orderedRepositories ?? [];
  if (
    state.form.repositoryId &&
    !repositories.some((repository) => repository.id === state.form.repositoryId)
  ) {
    state.form.repositoryId = "";
  }
};

const renderRepositoryOptions = () => {
  const repositories = state.server?.workspace?.repositoryPicker?.orderedRepositories ?? [];

  return [
    '<option value="">No repository preference</option>',
    ...repositories.map((repository) => {
      const label =
        repository.relativePath === "."
          ? `${repository.rootLabel} / ${repository.name}`
          : `${repository.rootLabel} / ${repository.relativePath}`;

      return `<option value="${escapeHtml(repository.id)}" ${
        repository.id === state.form.repositoryId ? "selected" : ""
      }>${escapeHtml(label)}</option>`;
    }),
  ].join("");
};

const renderThreadButton = (thread, selectedThreadId) => {
  const repositoryLabel = thread.repository
    ? thread.repository.relativePath === "."
      ? `${thread.repository.rootLabel} / ${thread.repository.name}`
      : `${thread.repository.rootLabel} / ${thread.repository.relativePath}`
    : "No repository";

  return `
    <button
      class="thread-button ${thread.threadId === selectedThreadId ? "active" : ""}"
      data-action="select-thread"
      data-thread-id="${escapeHtml(thread.threadId)}"
      type="button"
    >
      <div class="thread-header">
        <h4>${escapeHtml(thread.requestTitle || thread.threadId)}</h4>
        <span class="status-pill">${escapeHtml(formatStatus(thread.status))}</span>
      </div>
      <div class="thread-meta">
        <span>Thread: <code>${escapeHtml(thread.threadId)}</code></span>
        <span>${escapeHtml(repositoryLabel)}</span>
        <span>Updated ${escapeHtml(formatDateTime(thread.updatedAt))}</span>
      </div>
    </button>
  `;
};

const renderThreadGroup = (title, threads, selectedThreadId) => {
  return `
    <section class="thread-group">
      <div class="section-header">
        <h3>${escapeHtml(title)}</h3>
        <span class="muted">${threads.length}</span>
      </div>
      ${
        threads.length > 0
          ? `<div class="thread-list">${threads
              .map((thread) => renderThreadButton(thread, selectedThreadId))
              .join("")}</div>`
          : '<p class="empty-state">Nothing to show yet.</p>'
      }
    </section>
  `;
};

const renderFeedbackArea = ({ threadId, assignmentNumber, scope, laneId, buttonLabel }) => {
  const key = buildFeedbackKey(threadId, assignmentNumber, scope, laneId);

  return `
    <div class="feedback-area">
      <label class="field">
        <span>${escapeHtml(scope === "proposal" ? "Proposal feedback" : "Request-group feedback")}</span>
        <textarea
          data-action="feedback-input"
          data-feedback-key="${escapeHtml(key)}"
          placeholder="Explain what should change before the planner retries."
        >${escapeHtml(state.feedbackDrafts[key] ?? "")}</textarea>
      </label>
      <div class="feedback-actions">
        <button
          class="secondary"
          data-action="send-feedback"
          data-thread-id="${escapeHtml(threadId)}"
          data-assignment-number="${escapeHtml(String(assignmentNumber))}"
          data-scope="${escapeHtml(scope)}"
          data-lane-id="${escapeHtml(laneId ?? "")}"
          type="button"
        >
          ${escapeHtml(buttonLabel)}
        </button>
      </div>
    </div>
  `;
};

const renderLane = (threadId, assignmentNumber, lane) => {
  const approvalAction = getApprovalAction(lane);

  return `
    <article class="lane">
      <div class="lane-header">
        <div class="lane-title">
          <h4>Proposal ${escapeHtml(String(lane.laneIndex))}</h4>
          <span>${escapeHtml(lane.taskTitle || lane.taskObjective || "No task title yet.")}</span>
        </div>
        <span class="status-pill">${escapeHtml(formatStatus(lane.status))}</span>
      </div>
      <div class="lane-meta">
        <span>Lane ID: <code>${escapeHtml(lane.laneId)}</code></span>
        <span>Phase: ${escapeHtml(lane.executionPhase || "implementation")}</span>
        ${lane.branchName ? `<span>Branch: <code>${escapeHtml(lane.branchName)}</code></span>` : ""}
        ${lane.latestActivity ? `<span>${escapeHtml(lane.latestActivity)}</span>` : ""}
        ${lane.lastError ? `<span>Error: ${escapeHtml(lane.lastError)}</span>` : ""}
      </div>
      ${
        approvalAction
          ? `<div class="lane-actions">
              <button
                data-action="approve"
                data-thread-id="${escapeHtml(threadId)}"
                data-assignment-number="${escapeHtml(String(assignmentNumber))}"
                data-lane-id="${escapeHtml(lane.laneId)}"
                data-target="${escapeHtml(approvalAction.target)}"
                type="button"
              >
                ${escapeHtml(approvalAction.label)}
              </button>
            </div>`
          : ""
      }
      ${renderFeedbackArea({
        threadId,
        assignmentNumber,
        scope: "proposal",
        laneId: lane.laneId,
        buttonLabel: "Send proposal feedback",
      })}
    </article>
  `;
};

const renderNotes = (items, emptyCopy) => {
  if (!items || items.length === 0) {
    return `<p class="empty-state">${escapeHtml(emptyCopy)}</p>`;
  }

  return `
    <div class="${items[0]?.summary ? "handoff-list" : items[0]?.text ? "step-list" : "note-list"}">
      ${items
        .map((item) => {
          if (item.summary) {
            return `
              <article class="handoff">
                <div class="section-header">
                  <strong>${escapeHtml(item.roleName)}</strong>
                  <span class="status-pill">${escapeHtml(formatStatus(item.decision))}</span>
                </div>
                <p>${escapeHtml(item.summary)}</p>
                ${
                  item.deliverable
                    ? `<pre class="text-block">${escapeHtml(item.deliverable)}</pre>`
                    : ""
                }
              </article>
            `;
          }

          if (item.text) {
            return `
              <article class="step">
                <strong>${escapeHtml(item.agentName)}</strong>
                <p class="muted">${escapeHtml(formatDateTime(item.createdAt))}</p>
                <pre class="text-block">${escapeHtml(item.text)}</pre>
              </article>
            `;
          }

          return `
            <article class="note">
              <p>${escapeHtml(item.message)}</p>
              <p class="muted">${escapeHtml(formatDateTime(item.createdAt))}</p>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
};

const renderDetail = () => {
  const detail = state.server?.selectedThread;

  if (!detail) {
    return `
      <div class="card">
        <div class="card-header">
          <h2>Thread detail</h2>
        </div>
        <p class="empty-state">
          Pick a living or archived thread to inspect its lanes, approvals, and feedback history.
        </p>
      </div>
    `;
  }

  const latestAssignment = getLatestAssignment(detail);
  const thread = detail.summary;

  return `
    <div class="card">
      <div class="card-header">
        <div>
          <p class="eyebrow">Thread detail</p>
          <h2>${escapeHtml(thread.requestTitle || thread.threadId)}</h2>
        </div>
        <span class="status-pill">${escapeHtml(formatStatus(thread.status))}</span>
      </div>
      <div class="details-grid">
        <div>
          <strong>Thread ID</strong>
          <code>${escapeHtml(thread.threadId)}</code>
        </div>
        <div>
          <strong>Updated</strong>
          <span>${escapeHtml(formatDateTime(thread.updatedAt))}</span>
        </div>
        <div>
          <strong>Repository</strong>
          <span>${escapeHtml(
            thread.repository
              ? thread.repository.relativePath === "."
                ? `${thread.repository.rootLabel} / ${thread.repository.name}`
                : `${thread.repository.rootLabel} / ${thread.repository.relativePath}`
              : "No repository",
          )}</span>
        </div>
        <div>
          <strong>Workflow</strong>
          <span>${escapeHtml((thread.workflow || []).join(" -> ") || "No workflow recorded")}</span>
        </div>
      </div>
      ${
        thread.requestText
          ? `<div class="callout notice"><p>${escapeHtml(thread.requestText)}</p></div>`
          : ""
      }
      <section>
        <div class="card-header">
          <h3>Current lanes</h3>
        </div>
        ${
          latestAssignment?.lanes?.length
            ? `<div class="lane-list">${latestAssignment.lanes
                .map((lane) => renderLane(thread.threadId, latestAssignment.assignmentNumber, lane))
                .join("")}</div>`
            : '<p class="empty-state">No proposal lanes are attached to this thread yet.</p>'
        }
      </section>
      ${
        latestAssignment
          ? `<section>
              <div class="card-header">
                <h3>Request-group feedback</h3>
              </div>
              ${renderFeedbackArea({
                threadId: thread.threadId,
                assignmentNumber: latestAssignment.assignmentNumber,
                scope: "assignment",
                laneId: null,
                buttonLabel: "Restart planning with feedback",
              })}
            </section>`
          : ""
      }
      <section>
        <div class="card-header">
          <h3>Planner notes and feedback</h3>
        </div>
        ${renderNotes(
          [
            ...(latestAssignment?.plannerNotes ?? []),
            ...(latestAssignment?.humanFeedback ?? []),
          ].sort((left, right) => (left.createdAt || "").localeCompare(right.createdAt || "")),
          "Planner notes and human feedback will appear here.",
        )}
      </section>
      <section>
        <div class="card-header">
          <h3>Role handoffs</h3>
        </div>
        ${renderNotes(detail.handoffs, "No role handoffs recorded yet.")}
      </section>
      <section>
        <div class="card-header">
          <h3>Execution log excerpts</h3>
        </div>
        ${renderNotes(detail.steps, "No persisted execution steps recorded yet.")}
      </section>
    </div>
  `;
};

const render = () => {
  syncFormWithWorkspace();

  const server = state.server;
  const connection = server?.connection ?? {
    status: "idle",
    message: "Waiting for the extension host to connect.",
    guidance: "",
  };
  const workspace = server?.workspace ?? {
    threads: [],
    archivedThreads: [],
    repositoryPicker: {
      orderedRepositories: [],
    },
  };
  const actionLabel = server?.action?.label ?? "Idle";
  const actionDetail = server?.action?.detail ?? "";

  root.innerHTML = `
    <div class="app">
      <section class="hero">
        <div class="hero-top">
          <div class="hero-copy">
            <p class="eyebrow">VS Code Workspace</p>
            <h1>Meow Team</h1>
            <p class="connection-copy">
              Connected backend: <code>${escapeHtml(server?.backendBaseUrl ?? "Resolving...")}</code>
            </p>
          </div>
          <span class="status-pill ${escapeHtml(getConnectionClassName(connection))}">
            ${escapeHtml(formatStatus(connection.status))}
          </span>
        </div>
        <p class="connection-copy">${escapeHtml(connection.message || "Waiting for connection state.")}</p>
        ${
          connection.guidance
            ? `<p class="connection-copy">${escapeHtml(connection.guidance)}</p>`
            : ""
        }
        <div class="toolbar">
          <button data-action="refresh" type="button">Refresh workspace</button>
          <button class="secondary" data-action="open-settings" type="button">Open backend settings</button>
          <span class="muted">${escapeHtml(actionLabel)}${actionDetail ? `: ${escapeHtml(actionDetail)}` : ""}</span>
        </div>
      </section>

      ${
        server?.notice
          ? `<section class="callout notice"><p>${escapeHtml(server.notice)}</p></section>`
          : ""
      }
      ${
        server?.error
          ? `<section class="callout error"><p>${escapeHtml(server.error)}</p></section>`
          : ""
      }

      <div class="layout">
        <div class="column">
          <section class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">Run Team</p>
                <h2>Start or reset a request</h2>
              </div>
            </div>
            <form id="run-form" class="column">
              <label class="field">
                <span>Canonical title override</span>
                <input id="run-title" name="title" placeholder="Optional request title" value="${escapeHtml(
                  state.form.title,
                )}" />
              </label>
              <label class="field">
                <span>Prompt</span>
                <textarea id="run-input" name="input" placeholder="Describe the planning request or implementation change.">${escapeHtml(
                  state.form.input,
                )}</textarea>
              </label>
              <div class="form-row">
                <label class="field">
                  <span>Thread ID</span>
                  <input id="run-thread-id" name="threadId" placeholder="Optional existing thread" value="${escapeHtml(
                    state.form.threadId,
                  )}" />
                </label>
                <label class="field">
                  <span>Repository</span>
                  <select id="run-repository" name="repositoryId">
                    ${renderRepositoryOptions()}
                  </select>
                </label>
              </div>
              <div class="button-row">
                <label class="field">
                  <span>
                    <input id="run-reset" name="reset" type="checkbox" ${
                      state.form.reset ? "checked" : ""
                    } />
                    Reset the active assignment before rerunning
                  </span>
                </label>
                <label class="field">
                  <span>
                    <input
                      id="run-delete-branches"
                      name="deleteExistingBranches"
                      type="checkbox"
                      ${state.form.deleteExistingBranches ? "checked" : ""}
                    />
                    Delete existing branches if the backend requires it
                  </span>
                </label>
              </div>
              <div class="button-row">
                <button type="submit">Run meow-team</button>
              </div>
            </form>
          </section>

          <section class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">Threads</p>
                <h2>Workspace state</h2>
              </div>
            </div>
            ${renderThreadGroup("Living threads", workspace.threads || [], server?.selectedThreadId || null)}
            ${renderThreadGroup(
              "Archived threads",
              workspace.archivedThreads || [],
              server?.selectedThreadId || null,
            )}
          </section>
        </div>

        <div class="column">
          ${renderDetail()}
        </div>
      </div>
    </div>
  `;

  root.querySelectorAll("[data-action='refresh']").forEach((element) => {
    element.addEventListener("click", () => postMessage("refresh"));
  });

  root.querySelectorAll("[data-action='open-settings']").forEach((element) => {
    element.addEventListener("click", () => postMessage("open-settings"));
  });

  root.querySelectorAll("[data-action='select-thread']").forEach((element) => {
    element.addEventListener("click", () =>
      postMessage("select-thread", {
        threadId: element.dataset.threadId,
      }),
    );
  });

  root.querySelectorAll("[data-action='approve']").forEach((element) => {
    element.addEventListener("click", () =>
      postMessage("approve", {
        threadId: element.dataset.threadId,
        assignmentNumber: Number(element.dataset.assignmentNumber),
        laneId: element.dataset.laneId,
        target: element.dataset.target,
      }),
    );
  });

  root.querySelectorAll("[data-action='feedback-input']").forEach((element) => {
    element.addEventListener("input", (event) => {
      state.feedbackDrafts[element.dataset.feedbackKey] = event.target.value;
    });
  });

  root.querySelectorAll("[data-action='send-feedback']").forEach((element) => {
    element.addEventListener("click", () => {
      const scope = element.dataset.scope;
      const laneId = element.dataset.laneId || undefined;
      const key = buildFeedbackKey(
        element.dataset.threadId,
        Number(element.dataset.assignmentNumber),
        scope,
        laneId,
      );

      postMessage("feedback", {
        threadId: element.dataset.threadId,
        assignmentNumber: Number(element.dataset.assignmentNumber),
        scope,
        laneId,
        suggestion: state.feedbackDrafts[key] ?? "",
      });
    });
  });

  const runForm = root.querySelector("#run-form");
  runForm?.addEventListener("submit", (event) => {
    event.preventDefault();

    state.form.title = root.querySelector("#run-title").value;
    state.form.input = root.querySelector("#run-input").value;
    state.form.threadId = root.querySelector("#run-thread-id").value;
    state.form.repositoryId = root.querySelector("#run-repository").value;
    state.form.reset = root.querySelector("#run-reset").checked;
    state.form.deleteExistingBranches = root.querySelector("#run-delete-branches").checked;

    postMessage("run", {
      ...state.form,
    });
  });
};

window.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "state") {
    return;
  }

  state.server = event.data.state;
  render();
});

postMessage("ready");
render();
