"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitHubEvent, GitHubEventKind } from "@/lib/github-module/types";
import { isWallpaperMode, type WallpaperMode, type WallpaperSettings } from "@/lib/wallpaper/types";
import {
  type InteractionPrompt,
  launcherSections,
  mockAchievements,
  mockInteractionPrompts,
  mockPinnedApps,
  mockSettings,
} from "./mocks/launcher-data";
import { githubEventsMockData, githubEventsMockMeta } from "./mocks/github-events.generated";

type SectionId = (typeof launcherSections)[number]["id"];
type NonSettingsSectionId = Exclude<SectionId, "settings">;
type EventLineSource = "github" | "launcher";
type EventLine = {
  id: string;
  message: string;
  kind: GitHubEventKind;
  createdAt: string;
  source: EventLineSource;
};
type ActivePrompt = InteractionPrompt & { instanceId: number; selectedOption?: string };
type EventStreamSource = "api" | "mock";

type GitHubEventsApiResponse = {
  username?: unknown;
  events?: unknown;
  pagination?: {
    hasMore?: unknown;
  };
  syncError?: unknown;
};

const EVENT_PAGE_SIZE = 10;
const EVENT_TOP_FETCH_THRESHOLD_PX = 20;
const MAX_LOCAL_EVENT_LINES = 40;
const MAX_PROMPT_CARDS = 3;
const PROMPT_INTERVAL_MS = 3400;

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const formatDateTime = (value: string): string => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "unknown";
  }

  return dateTimeFormatter.format(new Date(parsed));
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isGitHubEventKindValue = (value: unknown): value is GitHubEventKind => {
  return value === "standard" || value === "notification";
};

const isGitHubEventValue = (value: unknown): value is GitHubEvent => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.message === "string" &&
    isGitHubEventKindValue(value.kind) &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt))
  );
};

const toEventLineFromGitHubEvent = (event: GitHubEvent): EventLine => {
  return {
    id: event.id,
    message: event.message,
    kind: event.kind,
    createdAt: event.createdAt,
    source: "github",
  };
};

const buildMockEventPage = (
  page: number,
): {
  events: EventLine[];
  hasMore: boolean;
  username: string;
} => {
  const start = (page - 1) * EVENT_PAGE_SIZE;
  const end = start + EVENT_PAGE_SIZE;
  const pageEvents = githubEventsMockData.slice(start, end).reverse().map(toEventLineFromGitHubEvent);

  return {
    events: pageEvents,
    hasMore: end < githubEventsMockData.length,
    username: githubEventsMockMeta.username,
  };
};

const sectionHeading: Record<SectionId, string> = {
  status: "Status Board",
  "my-apps": "My Applications",
  achievements: "Achievement Vault",
  settings: "Control Center",
};

export default function HomePage() {
  const [activeSection, setActiveSection] = useState<SectionId>("status");
  const [lastNonSettingsSection, setLastNonSettingsSection] =
    useState<NonSettingsSectionId>("status");
  const [wallpaperMode, setWallpaperMode] = useState<WallpaperMode>("default");
  const [wallpaperImageFileName, setWallpaperImageFileName] = useState<string | null>(null);
  const [wallpaperSaveState, setWallpaperSaveState] = useState<
    "idle" | "uploading" | "saving" | "saved" | "error"
  >("idle");
  const [githubEventLines, setGithubEventLines] = useState<EventLine[]>([]);
  const [localEventLines, setLocalEventLines] = useState<EventLine[]>([]);
  const [eventStreamStatus, setEventStreamStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [eventStreamSource, setEventStreamSource] = useState<EventStreamSource>("api");
  const [eventStreamUsername, setEventStreamUsername] = useState<string | null>(null);
  const [eventStreamErrorMessage, setEventStreamErrorMessage] = useState<string | null>(null);
  const [eventStreamSyncError, setEventStreamSyncError] = useState<string | null>(null);
  const [loadedEventPage, setLoadedEventPage] = useState(1);
  const [hasOlderEventPage, setHasOlderEventPage] = useState(false);
  const [isLoadingOlderEvents, setIsLoadingOlderEvents] = useState(false);
  const [promptCards, setPromptCards] = useState<ActivePrompt[]>([
    { ...mockInteractionPrompts[0], instanceId: 0 },
  ]);

  const eventIdRef = useRef(1);
  const promptCursorRef = useRef(1);
  const promptIdRef = useRef(1);
  const contentPaneRef = useRef<HTMLDivElement | null>(null);
  const settingsPaneRef = useRef<HTMLDivElement | null>(null);
  const eventStreamRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToEventBottomRef = useRef(false);
  const prependScrollPositionRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const isLoadingOlderEventsRef = useRef(false);

  const currentWallpaperImageUrl = wallpaperImageFileName
    ? `/api/wallpaper/image?file=${encodeURIComponent(wallpaperImageFileName)}`
    : null;

  const eventLines = useMemo(() => {
    return [...githubEventLines, ...localEventLines].sort(
      (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
    );
  }, [githubEventLines, localEventLines]);

  const fetchGitHubEventsPage = useCallback(
    async (
      page: number,
    ): Promise<{
      events: EventLine[];
      hasMore: boolean;
      username: string | null;
      syncError: string | null;
    }> => {
      const response = await fetch(`/api/github/events?page=${page}&limit=${EVENT_PAGE_SIZE}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Failed to load GitHub events.");
      }

      const payload = (await response.json()) as GitHubEventsApiResponse;
      const events = Array.isArray(payload.events) ? payload.events.filter(isGitHubEventValue) : [];
      const hasMore =
        isRecord(payload.pagination) && typeof payload.pagination.hasMore === "boolean"
          ? payload.pagination.hasMore
          : events.length === EVENT_PAGE_SIZE;

      return {
        events: events.map(toEventLineFromGitHubEvent).reverse(),
        hasMore,
        username: typeof payload.username === "string" ? payload.username : null,
        syncError: typeof payload.syncError === "string" ? payload.syncError : null,
      };
    },
    [],
  );

  const loadMockEventPage = useCallback(
    (
      page: number,
    ): {
      events: EventLine[];
      hasMore: boolean;
      username: string;
      syncError: string | null;
    } => {
      const pageResult = buildMockEventPage(page);

      return {
        events: pageResult.events,
        hasMore: pageResult.hasMore,
        username: pageResult.username,
        syncError: null,
      };
    },
    [],
  );

  useEffect(() => {
    const loadWallpaperSettings = async () => {
      try {
        const response = await fetch("/api/wallpaper", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as Partial<WallpaperSettings>;
        if (isWallpaperMode(data.mode)) {
          setWallpaperMode(data.mode);
        }

        if (typeof data.imageFileName === "string" || data.imageFileName === null) {
          setWallpaperImageFileName(data.imageFileName);
        }
      } catch {
        setWallpaperSaveState("error");
      }
    };

    void loadWallpaperSettings();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.wallpaperMode = wallpaperMode;

    if (currentWallpaperImageUrl) {
      root.style.setProperty("--wallpaper-image-url", `url("${currentWallpaperImageUrl}")`);
    } else {
      root.style.removeProperty("--wallpaper-image-url");
    }
  }, [wallpaperMode, currentWallpaperImageUrl]);

  useEffect(() => {
    contentPaneRef.current?.scrollTo({ top: 0, behavior: "auto" });
    settingsPaneRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeSection]);

  useEffect(() => {
    return () => {
      delete document.documentElement.dataset.wallpaperMode;
      document.documentElement.style.removeProperty("--wallpaper-image-url");
    };
  }, []);

  useEffect(() => {
    let isDisposed = false;

    const loadInitialEventPage = async () => {
      setEventStreamStatus("loading");
      setEventStreamErrorMessage(null);
      setEventStreamSyncError(null);

      try {
        const pageResult = await fetchGitHubEventsPage(1);
        if (isDisposed) {
          return;
        }

        if (pageResult.events.length === 0 && githubEventsMockData.length > 0) {
          const mockPageResult = loadMockEventPage(1);
          shouldScrollToEventBottomRef.current = true;
          setEventStreamSource("mock");
          setEventStreamUsername(mockPageResult.username);
          setGithubEventLines(mockPageResult.events);
          setLoadedEventPage(1);
          setHasOlderEventPage(mockPageResult.hasMore);
          setEventStreamErrorMessage("GitHub storage is empty. Displaying local mock snapshot.");
          setEventStreamStatus("ready");
          return;
        }

        shouldScrollToEventBottomRef.current = true;
        setEventStreamSource("api");
        setEventStreamUsername(pageResult.username);
        setGithubEventLines(pageResult.events);
        setLoadedEventPage(1);
        setHasOlderEventPage(pageResult.hasMore);
        setEventStreamSyncError(pageResult.syncError);
        setEventStreamStatus("ready");
      } catch {
        if (isDisposed) {
          return;
        }

        if (githubEventsMockData.length > 0) {
          const mockPageResult = loadMockEventPage(1);
          shouldScrollToEventBottomRef.current = true;
          setEventStreamSource("mock");
          setEventStreamUsername(mockPageResult.username);
          setGithubEventLines(mockPageResult.events);
          setLoadedEventPage(1);
          setHasOlderEventPage(mockPageResult.hasMore);
          setEventStreamErrorMessage("Failed to load GitHub events. Displaying local mock snapshot.");
          setEventStreamStatus("ready");
          return;
        }

        setEventStreamStatus("error");
        setEventStreamErrorMessage("Failed to load event stream.");
      }
    };

    void loadInitialEventPage();

    return () => {
      isDisposed = true;
    };
  }, [fetchGitHubEventsPage, loadMockEventPage]);

  useEffect(() => {
    const container = eventStreamRef.current;
    if (!container) {
      return;
    }

    if (shouldScrollToEventBottomRef.current) {
      container.scrollTop = container.scrollHeight;
      shouldScrollToEventBottomRef.current = false;
      return;
    }

    const restorePosition = prependScrollPositionRef.current;
    if (!restorePosition) {
      return;
    }

    container.scrollTop = container.scrollHeight - restorePosition.scrollHeight + restorePosition.scrollTop;
    prependScrollPositionRef.current = null;
  }, [eventLines]);

  const pushEventLine = useCallback((message: string) => {
    const nextLine: EventLine = {
      id: `local-${eventIdRef.current}`,
      message,
      kind: "standard",
      createdAt: new Date().toISOString(),
      source: "launcher",
    };
    eventIdRef.current += 1;
    shouldScrollToEventBottomRef.current = true;
    setLocalEventLines((previous) => [...previous, nextLine].slice(-MAX_LOCAL_EVENT_LINES));
  }, []);

  const loadOlderEventPage = useCallback(async () => {
    if (isLoadingOlderEventsRef.current || !hasOlderEventPage) {
      return;
    }

    const container = eventStreamRef.current;
    if (!container) {
      return;
    }

    isLoadingOlderEventsRef.current = true;
    setIsLoadingOlderEvents(true);
    setEventStreamErrorMessage(null);

    const nextPage = loadedEventPage + 1;
    const previousScrollHeight = container.scrollHeight;
    const previousScrollTop = container.scrollTop;

    try {
      const pageResult =
        eventStreamSource === "mock" ? loadMockEventPage(nextPage) : await fetchGitHubEventsPage(nextPage);

      if (eventStreamSource === "api") {
        setEventStreamSyncError(pageResult.syncError);
        if (pageResult.username) {
          setEventStreamUsername(pageResult.username);
        }
      }

      if (pageResult.events.length > 0) {
        prependScrollPositionRef.current = {
          scrollHeight: previousScrollHeight,
          scrollTop: previousScrollTop,
        };
        setGithubEventLines((previous) => {
          const existingIds = new Set(previous.map((line) => line.id));
          const uniqueOlderEvents = pageResult.events.filter((line) => !existingIds.has(line.id));
          return uniqueOlderEvents.length > 0 ? [...uniqueOlderEvents, ...previous] : previous;
        });
      }

      setLoadedEventPage(nextPage);
      setHasOlderEventPage(pageResult.hasMore);
    } catch {
      setEventStreamErrorMessage("Failed to load previous event page.");
    } finally {
      isLoadingOlderEventsRef.current = false;
      setIsLoadingOlderEvents(false);
    }
  }, [
    eventStreamSource,
    fetchGitHubEventsPage,
    hasOlderEventPage,
    loadMockEventPage,
    loadedEventPage,
  ]);

  const handleEventStreamScroll = useCallback(() => {
    const container = eventStreamRef.current;
    if (!container) {
      return;
    }

    if (container.scrollTop > EVENT_TOP_FETCH_THRESHOLD_PX) {
      return;
    }

    if (eventStreamStatus !== "ready" || isLoadingOlderEvents || !hasOlderEventPage) {
      return;
    }

    void loadOlderEventPage();
  }, [eventStreamStatus, hasOlderEventPage, isLoadingOlderEvents, loadOlderEventPage]);

  const switchSection = useCallback(
    (nextSection: SectionId, source: "nav" | "prompt" = "nav") => {
      if (nextSection !== "settings") {
        setLastNonSettingsSection(nextSection);
      }
      setActiveSection(nextSection);
      const sourceLabel = source === "nav" ? "Navigation" : "Prompt";
      pushEventLine(`${sourceLabel} opened ${sectionHeading[nextSection]}.`);
    },
    [pushEventLine],
  );

  const handleBackFromSettings = useCallback(() => {
    switchSection(lastNonSettingsSection);
  }, [lastNonSettingsSection, switchSection]);

  const persistWallpaperSettings = async (nextSettings: WallpaperSettings) => {
    setWallpaperSaveState("saving");

    try {
      const response = await fetch("/api/wallpaper", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextSettings),
      });

      if (!response.ok) {
        throw new Error("Unable to persist wallpaper settings.");
      }

      setWallpaperSaveState("saved");
      window.setTimeout(() => {
        setWallpaperSaveState((current) => (current === "saved" ? "idle" : current));
      }, 1800);
    } catch {
      setWallpaperSaveState("error");
    }
  };

  const updateWallpaperMode = (nextMode: WallpaperMode) => {
    setWallpaperMode(nextMode);
    void persistWallpaperSettings({ mode: nextMode, imageFileName: wallpaperImageFileName });
  };

  const handleWallpaperImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setWallpaperSaveState("uploading");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch("/api/wallpaper/image", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload wallpaper image.");
      }

      const uploadData = (await uploadResponse.json()) as { fileName?: unknown };
      if (typeof uploadData.fileName !== "string") {
        throw new Error("Invalid wallpaper upload response.");
      }

      setWallpaperImageFileName(uploadData.fileName);
      await persistWallpaperSettings({
        mode: wallpaperMode,
        imageFileName: uploadData.fileName,
      });
    } catch {
      setWallpaperSaveState("error");
    }
  };

  const clearWallpaperImage = () => {
    setWallpaperImageFileName(null);
    void persistWallpaperSettings({ mode: wallpaperMode, imageFileName: null });
  };

  const wallpaperSaveMessage =
    wallpaperSaveState === "uploading"
      ? "Uploading..."
      : wallpaperSaveState === "saving"
        ? "Saving..."
        : wallpaperSaveState === "saved"
          ? "Saved"
          : wallpaperSaveState === "error"
            ? "Save failed"
            : "";

  const wallpaperStatusText = wallpaperSaveMessage
    ? `Wallpaper ${wallpaperSaveMessage}`
    : wallpaperSaveMessage;

  useEffect(() => {
    const timerId = window.setInterval(() => {
      const nextPrompt =
        mockInteractionPrompts[promptCursorRef.current % mockInteractionPrompts.length];
      promptCursorRef.current += 1;

      const nextCard: ActivePrompt = {
        ...nextPrompt,
        instanceId: promptIdRef.current,
      };
      promptIdRef.current += 1;

      setPromptCards((previous) => [...previous, nextCard].slice(-MAX_PROMPT_CARDS));
    }, PROMPT_INTERVAL_MS);

    return () => window.clearInterval(timerId);
  }, []);

  const handlePromptSelect = (instanceId: number, option: string) => {
    setPromptCards((previous) =>
      previous.map((card) =>
        card.instanceId === instanceId ? { ...card, selectedOption: option } : card,
      ),
    );

    pushEventLine(`Response chosen: ${option}`);
    if (/settings/i.test(option)) {
      switchSection("settings", "prompt");
    }
  };

  const renderSettingsSection = () => {
    return (
      <div className="settings-stack">
        <section className="settings-wallpaper settings-summary">
          <h3>Settings Status</h3>
          <p className="meta-small">Current wallpaper mode: {wallpaperMode}</p>
          <p className="meta-small">
            Wallpaper image: {wallpaperImageFileName ? "Configured" : "Not configured"}
          </p>
        </section>

        <section className="settings-wallpaper">
          <h3>Wallpaper</h3>
          <p className="meta-small">Wallpaper is the global background for the whole launcher.</p>

          <div className="wall-style-controls" role="group" aria-label="Wallpaper styles">
            <button
              type="button"
              className={`style-chip ${wallpaperMode === "default" ? "active" : ""}`}
              onClick={() => updateWallpaperMode("default")}
            >
              Default
            </button>
            <button
              type="button"
              className={`style-chip ${wallpaperMode === "glass" ? "active" : ""}`}
              onClick={() => updateWallpaperMode("glass")}
            >
              Glass Mask
            </button>
            <span className={`save-state ${wallpaperSaveState}`}>{wallpaperStatusText}</span>
          </div>

          <div className="wallpaper-controls">
            <label className="action-button">
              Choose Wallpaper Image
              <input type="file" accept="image/*" onChange={handleWallpaperImageChange} />
            </label>
            <button
              type="button"
              className="action-button is-secondary"
              onClick={clearWallpaperImage}
              disabled={!wallpaperImageFileName}
            >
              Clear Wallpaper
            </button>
          </div>
        </section>

        <section className="settings-wallpaper">
          <h3>General</h3>
          <ul className="list-plain">
            {mockSettings.map((setting) => (
              <li key={setting.key} className="item-row">
                <strong>{setting.key}</strong>
                <span>{setting.value}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  };

  const renderContentSection = () => {
    if (activeSection === "my-apps") {
      return (
        <ul className="list-plain">
          {mockPinnedApps.map((app) => (
            <li key={app.name} className="item-row">
              <strong>{app.name}</strong>
              <span>{app.type}</span>
            </li>
          ))}
        </ul>
      );
    }

    if (activeSection === "achievements") {
      return (
        <ul className="list-plain">
          {mockAchievements.map((achievement) => (
            <li
              key={achievement.title}
              className={`item-row ${achievement.unlocked ? "is-unlocked" : "is-locked"}`}
            >
              <strong>{achievement.title}</strong>
              <span>{achievement.detail}</span>
            </li>
          ))}
        </ul>
      );
    }

    return null;
  };

  const eventPaneDescription =
    eventStreamStatus === "loading"
      ? "Loading event pages..."
      : eventStreamStatus === "error"
        ? "Event stream failed to initialize."
        : `Source: ${eventStreamSource === "api" ? "GitHub SQLite" : "Local snapshot"}${eventStreamUsername ? ` / ${eventStreamUsername}` : ""}. Page size: ${EVENT_PAGE_SIZE}. Pull to top to load previous page.`;

  const eventTopHint =
    eventStreamStatus === "loading"
      ? "Loading..."
      : isLoadingOlderEvents
        ? "Loading previous page..."
        : hasOlderEventPage
          ? "Pull to top to load previous page."
          : "Reached the beginning of the stream.";

  return (
    <main className="launcher-shell">
      <section className="launcher-left-column">
        <aside className="status-pane">
          <nav className="icon-bar" aria-label="Primary sections">
            {launcherSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`icon-item ${activeSection === section.id ? "active" : ""}`}
                onClick={() => switchSection(section.id)}
                aria-pressed={activeSection === section.id}
                title={section.label}
              >
                <span className="icon-symbol" aria-hidden>
                  {section.symbol}
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="event-pane">
          <div className="pane-head">
            <h2>Event Stream</h2>
            <p>{eventPaneDescription}</p>
          </div>

          <div
            ref={eventStreamRef}
            className="event-stream"
            aria-live="polite"
            onScroll={handleEventStreamScroll}
          >
            <p className="event-stream-state">{eventTopHint}</p>
            {eventStreamErrorMessage ? <p className="event-stream-error">{eventStreamErrorMessage}</p> : null}
            {eventStreamSyncError ? <p className="event-stream-warning">{eventStreamSyncError}</p> : null}

            <div className="event-waterfall">
              {eventLines.map((line) => (
                <article
                  key={line.id}
                  className={`event-card ${line.kind === "notification" ? "is-notification" : "is-standard"} ${line.source === "launcher" ? "is-launcher" : "is-github"}`}
                >
                  <div className="event-card-head">
                    <span className="event-kind">
                      {line.kind === "notification"
                        ? "Notify"
                        : line.source === "launcher"
                          ? "Launcher"
                          : "Event"}
                    </span>
                    <time dateTime={line.createdAt}>{formatDateTime(line.createdAt)}</time>
                  </div>
                  <p className="event-card-message">{line.message}</p>
                </article>
              ))}

              {eventStreamStatus !== "loading" && eventLines.length === 0 ? (
                <p className="event-stream-empty">No events available.</p>
              ) : null}
            </div>
          </div>
        </section>
      </section>

      <section className="launcher-right-column">
        {activeSection === "settings" ? (
          <section className="settings-pane">
            <div className="pane-head settings-pane-head">
              <div>
                <h2>Control Center</h2>
                <p>Adjust wallpaper assets here.</p>
              </div>
              <button
                type="button"
                className="action-button is-secondary"
                onClick={handleBackFromSettings}
              >
                Back
              </button>
            </div>
            <div ref={settingsPaneRef} className="settings-pane-scroll">
              {renderSettingsSection()}
            </div>
          </section>
        ) : activeSection === "status" ? (
          <section className="interaction-pane">
            <div className="pane-head">
              <h2>Interaction Zone</h2>
              <p>Prompt cards keep popping up with options that users can choose.</p>
            </div>

            <div className="interaction-stack">
              {promptCards.map((card) => (
                <article key={card.instanceId} className="prompt-card">
                  <p className="prompt-title">{card.title}</p>
                  <p className="prompt-hint">{card.hint}</p>
                  <div className="prompt-options">
                    {card.options.map((option) => (
                      <button
                        key={`${card.instanceId}-${option}`}
                        type="button"
                        className={`choice-button ${card.selectedOption === option ? "selected" : ""}`}
                        onClick={() => handlePromptSelect(card.instanceId, option)}
                        disabled={Boolean(card.selectedOption)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  {card.selectedOption ? (
                    <p className="selection-state">Selected: {card.selectedOption}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className="content-pane">
            <div className="pane-head">
              <h2>{sectionHeading[activeSection]}</h2>
              <p>This section is focused on navigation data only.</p>
            </div>
            <div ref={contentPaneRef} className="content-pane-scroll">
              {renderContentSection()}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
