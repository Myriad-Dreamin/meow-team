import { NextResponse } from "next/server";
import {
  isSupportedWallpaperMime,
  readWallpaperImage,
  saveWallpaperImage,
} from "@/lib/server/wallpaper-store";
import { isWallpaperImageFileName } from "@/lib/wallpaper/types";

const MAX_WALLPAPER_UPLOAD_SIZE = 5 * 1024 * 1024;
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fileName = url.searchParams.get("file");

    if (!isWallpaperImageFileName(fileName) || fileName === null) {
      return NextResponse.json({ error: "Invalid wallpaper file." }, { status: 400 });
    }

    const image = await readWallpaperImage(fileName);
    if (!image) {
      return NextResponse.json({ error: "Wallpaper image not found." }, { status: 404 });
    }

    return new Response(new Uint8Array(image.content), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read wallpaper image." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image file uploaded." }, { status: 400 });
    }

    if (!isSupportedWallpaperMime(file.type)) {
      return NextResponse.json({ error: "Unsupported wallpaper image type." }, { status: 400 });
    }

    if (file.size > MAX_WALLPAPER_UPLOAD_SIZE) {
      return NextResponse.json({ error: "Wallpaper image is too large." }, { status: 400 });
    }

    const content = Buffer.from(await file.arrayBuffer());
    const fileName = await saveWallpaperImage(content, file.type);

    return NextResponse.json({
      fileName,
      imageUrl: `/api/wallpaper/image?file=${encodeURIComponent(fileName)}`,
    });
  } catch {
    return NextResponse.json({ error: "Failed to upload wallpaper image." }, { status: 500 });
  }
}
