"use client";

import Image from "next/image";
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { isWallpaperMode, type WallpaperMode, type WallpaperSettings } from "@/lib/wallpaper/types";
import {
  type InteractionPrompt,
  launcherSections,
  mockAchievements,
  mockEvents,
  mockInteractionPrompts,
  mockPinnedApps,
  mockQuests,
  mockSettings,
  mockStatus,
} from "./mocks/launcher-data";

type SectionId = (typeof launcherSections)[number]["id"];
type EventLine = { id: number; text: string };
type ActivePrompt = InteractionPrompt & { instanceId: number; selectedOption?: string };
type DecorImage = { id: number; url: string };

const MAX_EVENT_LINES = 12;
const MAX_PROMPT_CARDS = 3;
const MAX_DECOR_IMAGES = 8;
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
  "my-apps": "My Applications",
  quests: "Quest Tracker",
  achievements: "Achievement Vault",
  settings: "Control Center",
};

export default function HomePage() {
  const [activeSection, setActiveSection] = useState<SectionId>("my-apps");
  const [decorImages, setDecorImages] = useState<DecorImage[]>([]);
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
  const decorImageIdRef = useRef(1);
  const decorImagesRef = useRef<DecorImage[]>([]);
  const sectionCardRef = useRef<HTMLElement | null>(null);

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
    decorImagesRef.current = decorImages;
  }, [decorImages]);

  useEffect(() => {
    sectionCardRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeSection]);

  useEffect(() => {
    return () => {
      delete document.documentElement.dataset.wallpaperMode;
      document.documentElement.style.removeProperty("--wallpaper-image-url");
      for (const image of decorImagesRef.current) {
        if (image.url.startsWith("blob:")) {
          URL.revokeObjectURL(image.url);
        }
      }
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
      setActiveSection(nextSection);
      const sourceLabel = source === "nav" ? "Navigation" : "Prompt";
      pushEventLine(`${sourceLabel} opened ${sectionHeading[nextSection]}.`);
    },
    [pushEventLine],
  );

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

  const handleDecorImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    setDecorImages((previous) => {
      const remainingSlots = Math.max(0, MAX_DECOR_IMAGES - previous.length);
      if (remainingSlots === 0) {
        return previous;
      }

      const acceptedFiles = files.slice(0, remainingSlots);
      const newImages = acceptedFiles.map((file) => ({
        id: decorImageIdRef.current++,
        url: URL.createObjectURL(file),
      }));

      return [...previous, ...newImages];
    });
  };

  const removeLastDecorImage = () => {
    setDecorImages((previous) => {
      if (previous.length === 0) {
        return previous;
      }

      const target = previous[previous.length - 1];
      if (target.url.startsWith("blob:")) {
        URL.revokeObjectURL(target.url);
      }

      return previous.slice(0, -1);
    });
  };

  const clearDecorImages = () => {
    setDecorImages((previous) => {
      for (const image of previous) {
        if (image.url.startsWith("blob:")) {
          URL.revokeObjectURL(image.url);
        }
      }

      return [];
    });
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
          <p className="meta-small">Decoration items: {decorImages.length}</p>
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

        <section className="settings-wallpaper settings-decoration">
          <h3>Decoration Images</h3>
          <p className="meta-small">Manage Decor Wall images from left to right.</p>

          <div className="wallpaper-controls">
            <label className="action-button">
              Add Decor Image
              <input type="file" accept="image/*" multiple onChange={handleDecorImageChange} />
            </label>
            <button
              type="button"
              className="action-button is-secondary"
              onClick={removeLastDecorImage}
              disabled={decorImages.length === 0}
            >
              Remove Last
            </button>
            <button
              type="button"
              className="action-button is-secondary"
              onClick={clearDecorImages}
              disabled={decorImages.length === 0}
            >
              Clear All
            </button>
          </div>
          <p className="meta-small">Current items: {decorImages.length}</p>
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

  const renderActiveSection = () => {
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

    if (activeSection === "quests") {
      return (
        <ul className="list-plain">
          {mockQuests.map((quest) => (
            <li key={quest.title} className="quest-row">
              <div className="quest-head">
                <strong>{quest.title}</strong>
                <span>{quest.reward}</span>
              </div>
              <progress value={quest.progress} max={quest.target} />
              <span className="meta-small">
                {quest.progress}/{quest.target} completed
              </span>
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

    return renderSettingsSection();
  };

  return (
    <main className="launcher-shell">
      <aside className="status-pane">
        <header className="status-header">
          <p className="eyebrow">Earth Online Launcher</p>
          <h1>Status Sidebar</h1>
          <p className="subtitle">Settings include wallpaper and decoration controls.</p>
        </header>

        <nav className="icon-bar" aria-label="Primary sections">
          {launcherSections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`icon-item ${activeSection === section.id ? "active" : ""}`}
              onClick={() => switchSection(section.id)}
              aria-pressed={activeSection === section.id}
            >
              <span aria-hidden>{section.symbol}</span>
              <span>{section.label}</span>
            </button>
          ))}
        </nav>

        <section ref={sectionCardRef} className={`status-card section-card is-${activeSection}`}>
          <h2>{sectionHeading[activeSection]}</h2>
          {renderActiveSection()}
        </section>

        <section className="status-card">
          <h2>Ranger Profile</h2>
          <dl className="metric-grid">
            <div>
              <dt>Name</dt>
              <dd>{mockStatus.playerName}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{mockStatus.region}</dd>
            </div>
            <div>
              <dt>Level</dt>
              <dd>{mockStatus.level}</dd>
            </div>
            <div>
              <dt>Stamina</dt>
              <dd>{mockStatus.stamina}%</dd>
            </div>
            <div>
              <dt>Morale</dt>
              <dd>{mockStatus.morale}%</dd>
            </div>
            <div>
              <dt>Credits</dt>
              <dd>{mockStatus.credits}</dd>
            </div>
            <div>
              <dt>Streak</dt>
              <dd>{mockStatus.streakDays} days</dd>
            </div>
          </dl>
        </section>
      </aside>

      <section className="wall-pane">
        <div className="pane-head">
          <h2>Decor Wall</h2>
          <p>Decor images are arranged from left to right. Manage them in Settings.</p>
        </div>

        <div className="decor-strip" aria-label="Decor image strip from left to right">
          {decorImages.length > 0 ? (
            decorImages.map((image, index) => (
              <figure key={image.id} className="decor-tile">
                <Image
                  src={image.url}
                  alt={`Decor item ${index + 1}`}
                  fill
                  className="decor-image"
                  sizes="180px"
                  unoptimized
                />
                <figcaption>Slot {index + 1}</figcaption>
              </figure>
            ))
          ) : (
            <div className="decor-empty">
              <p>No decor image yet.</p>
              <p>Open Settings to add and manage decoration images.</p>
            </div>
          )}
        </div>
      </section>

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
    </main>
  );
}
