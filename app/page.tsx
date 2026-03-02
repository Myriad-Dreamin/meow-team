"use client";

import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { isWallpaperMode, type WallpaperMode, type WallpaperSettings } from "@/lib/wallpaper/types";
import {
  type InteractionPrompt,
  launcherSections,
  mockAchievements,
  mockEvents,
  mockInteractionPrompts,
  mockPinnedApps,
  mockSettings,
} from "./mocks/launcher-data";

type SectionId = (typeof launcherSections)[number]["id"];
type NonSettingsSectionId = Exclude<SectionId, "settings">;
type EventLine = { id: number; text: string };
type ActivePrompt = InteractionPrompt & { instanceId: number; selectedOption?: string };

const MAX_EVENT_LINES = 12;
const MAX_PROMPT_CARDS = 3;
const EVENT_INTERVAL_MS = 1600;
const PROMPT_INTERVAL_MS = 3400;

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const createClockTag = () => clockFormatter.format(new Date());

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
  const [eventLines, setEventLines] = useState<EventLine[]>([
    { id: 0, text: `[${createClockTag()}] Launcher booted in local mock mode.` },
  ]);
  const [promptCards, setPromptCards] = useState<ActivePrompt[]>([
    { ...mockInteractionPrompts[0], instanceId: 0 },
  ]);

  const eventCursorRef = useRef(0);
  const eventIdRef = useRef(1);
  const promptCursorRef = useRef(1);
  const promptIdRef = useRef(1);
  const contentPaneRef = useRef<HTMLDivElement | null>(null);
  const settingsPaneRef = useRef<HTMLDivElement | null>(null);

  const currentWallpaperImageUrl = wallpaperImageFileName
    ? `/api/wallpaper/image?file=${encodeURIComponent(wallpaperImageFileName)}`
    : null;

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

  const pushEventLine = useCallback((message: string) => {
    const nextLine: EventLine = {
      id: eventIdRef.current,
      text: `[${createClockTag()}] ${message}`,
    };
    eventIdRef.current += 1;
    setEventLines((previous) => [...previous, nextLine].slice(-MAX_EVENT_LINES));
  }, []);

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
      const nextEvent = mockEvents[eventCursorRef.current % mockEvents.length];
      eventCursorRef.current += 1;
      pushEventLine(nextEvent);
    }, EVENT_INTERVAL_MS);

    return () => window.clearInterval(timerId);
  }, [pushEventLine]);

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
            <p>A single rolling div where new event lines continuously appear.</p>
          </div>

          <div className="event-stream" aria-live="polite">
            {eventLines.map((line) => (
              <p key={line.id} className="event-line">
                {line.text}
              </p>
            ))}
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
