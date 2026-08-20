import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { cloudinaryConfigured, uploadBuffer } from "@/lib/cloudinary";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireAdmin().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  if (!cloudinaryConfigured()) {
    return NextResponse.json({ error: "Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to your environment." }, { status: 501 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const maxBytes = 8 * 1024 * 1024; // 8 MB
  if (buffer.length > maxBytes) return NextResponse.json({ error: "Image exceeds the 8 MB limit." }, { status: 400 });

  try {
    const result = await uploadBuffer(buffer);
    return NextResponse.json({ ok: true, url: result.url, publicId: result.publicId, width: result.width, height: result.height });
  } catch {
    return NextResponse.json({ error: "Upload to Cloudinary failed." }, { status: 502 });
  }
}