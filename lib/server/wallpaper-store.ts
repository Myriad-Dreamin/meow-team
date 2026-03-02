import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultWallpaperSettings,
  isWallpaperImageFileName,
  isWallpaperMode,
  type WallpaperSettings,
} from "@/lib/wallpaper/types";

const dataDirectory = path.join(process.cwd(), "data");
const wallpaperDirectory = path.join(dataDirectory, "wallpapers");
const storePath = path.join(dataDirectory, "wallpaper-settings.json");
const supportedWallpaperTypes = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
} as const;
const supportedWallpaperExtensions = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
} as const;

const validateSettings = (value: unknown): WallpaperSettings => {
  if (
    typeof value === "object" &&
    value !== null &&
    "mode" in value &&
    isWallpaperMode((value as { mode?: unknown }).mode) &&
    "imageFileName" in value &&
    isWallpaperImageFileName((value as { imageFileName?: unknown }).imageFileName)
  ) {
    return {
      mode: (value as { mode: WallpaperSettings["mode"] }).mode,
      imageFileName: (value as { imageFileName: WallpaperSettings["imageFileName"] }).imageFileName,
    };
  }

  return defaultWallpaperSettings;
};

export const readWallpaperSettings = async (): Promise<WallpaperSettings> => {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return validateSettings(parsed);
  } catch {
    return defaultWallpaperSettings;
  }
};

export const writeWallpaperSettings = async (
  settings: WallpaperSettings,
): Promise<WallpaperSettings> => {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(storePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return settings;
};

export const isSupportedWallpaperMime = (
  mimeType: string,
): mimeType is keyof typeof supportedWallpaperTypes => {
  return mimeType in supportedWallpaperTypes;
};

const getWallpaperPath = (fileName: string) => {
  return path.join(wallpaperDirectory, fileName);
};

export const saveWallpaperImage = async (
  content: Buffer,
  mimeType: keyof typeof supportedWallpaperTypes,
): Promise<string> => {
  await mkdir(wallpaperDirectory, { recursive: true });
  const extension = supportedWallpaperTypes[mimeType];
  const fileName = `${randomUUID()}.${extension}`;
  await writeFile(getWallpaperPath(fileName), content);
  return fileName;
};

export const readWallpaperImage = async (
  fileName: string,
): Promise<{ content: Buffer; contentType: string } | null> => {
  const extension = path.extname(fileName).slice(1).toLowerCase();
  const contentType =
    supportedWallpaperExtensions[extension as keyof typeof supportedWallpaperExtensions];

  if (!contentType) {
    return null;
  }

  try {
    const content = await readFile(getWallpaperPath(fileName));
    return { content, contentType };
  } catch {
    return null;
  }
};

export const deleteWallpaperImage = async (fileName: string): Promise<void> => {
  try {
    await unlink(getWallpaperPath(fileName));
  } catch {
    // Ignore missing files for idempotent cleanup.
  }
};
