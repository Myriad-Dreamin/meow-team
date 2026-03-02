export const wallpaperModes = ["default", "glass"] as const;

export type WallpaperMode = (typeof wallpaperModes)[number];

export type WallpaperSettings = {
  mode: WallpaperMode;
  imageFileName: string | null;
};

export const defaultWallpaperSettings: WallpaperSettings = {
  mode: "default",
  imageFileName: null,
};

export const isWallpaperMode = (value: unknown): value is WallpaperMode => {
  return typeof value === "string" && wallpaperModes.includes(value as WallpaperMode);
};

const wallpaperFileNamePattern = /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif|avif)$/;

export const isWallpaperImageFileName = (value: unknown): value is string | null => {
  return value === null || (typeof value === "string" && wallpaperFileNamePattern.test(value));
};
