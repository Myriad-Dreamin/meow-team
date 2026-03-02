import { NextResponse } from "next/server";
import {
  deleteWallpaperImage,
  readWallpaperSettings,
  writeWallpaperSettings,
} from "@/lib/server/wallpaper-store";
import {
  isWallpaperImageFileName,
  isWallpaperMode,
  type WallpaperSettings,
} from "@/lib/wallpaper/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const settings = await readWallpaperSettings();
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: "Failed to read wallpaper settings." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<WallpaperSettings>;
    if (!isWallpaperMode(body.mode) || !isWallpaperImageFileName(body.imageFileName)) {
      return NextResponse.json({ error: "Invalid wallpaper settings." }, { status: 400 });
    }

    const previous = await readWallpaperSettings();
    const nextSettings: WallpaperSettings = {
      mode: body.mode,
      imageFileName: body.imageFileName,
    };

    if (previous.imageFileName && previous.imageFileName !== nextSettings.imageFileName) {
      await deleteWallpaperImage(previous.imageFileName);
    }

    const saved = await writeWallpaperSettings({
      mode: nextSettings.mode,
      imageFileName: nextSettings.imageFileName,
    });
    return NextResponse.json(saved);
  } catch {
    return NextResponse.json({ error: "Failed to save wallpaper settings." }, { status: 500 });
  }
}
