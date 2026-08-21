import { NextRequest, NextResponse } from 'next/server';
import { toSafeExternalUrl } from '@/lib/security/urlGuard';
import { POST as discoverChapters } from '../chapters/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Vercel: extraer todas las imágenes de un capítulo supera el default de 15s.
export const maxDuration = 60;

interface DiscoveryChapter {
  id?: string | number;
  name?: string;
  url?: string;
  images?: unknown;
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  author?: string;
}

interface DiscoveryPayload {
  success?: boolean;
  seriesTitle?: string;
  category?: string;
  mediaType?: 'image' | 'video';
  videoUrl?: string;
  images?: unknown;
  author?: string;
  chapters?: DiscoveryChapter[];
  error?: string;
  details?: string;
}

function toImageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/**
 * POST /api/download
 *
 * El frontend (app/page.tsx) llama a este endpoint para resolver una URL
 * concreta a su lista de imágenes/video descargable. El endpoint no existía en
 * el repo: sólo estaba el handler de descubrimiento de capítulos, así que todas
 * las descargas respondían 404.
 *
 * En vez de duplicar las ~1300 líneas de scraping, se reutiliza el handler de
 * /api/chapters y se normaliza su respuesta al contrato que espera el cliente:
 * { images, chapterName, videoUrl, mediaType, author }.
 */
export async function POST(req: NextRequest) {
  let body: { url?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Valid JSON body is required' }, { status: 400 });
  }

  const safeUrl = toSafeExternalUrl(body.url);
  if (!safeUrl.ok || !safeUrl.url) {
    return NextResponse.json({ error: safeUrl.reason ?? 'Invalid URL' }, { status: 400 });
  }

  const targetUrl = safeUrl.url;

  try {
    // El handler de chapters consume req.json(), por eso se construye una
    // petición nueva con la URL ya normalizada y validada.
    const innerRequest = new NextRequest(new URL(req.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl }),
    });

    const discovery = await discoverChapters(innerRequest);
    const payload = (await discovery.json()) as DiscoveryPayload;

    if (!discovery.ok) {
      return NextResponse.json(
        { error: payload.error ?? 'Download failed', details: payload.details },
        { status: discovery.status },
      );
    }

    const firstChapter = Array.isArray(payload.chapters) ? payload.chapters[0] : undefined;

    // Las imágenes pueden venir en la raíz (Instagram/Facebook) o dentro del
    // primer capítulo (manga y scraping genérico).
    const images = toImageList(payload.images).length
      ? toImageList(payload.images)
      : toImageList(firstChapter?.images);

    const videoUrl = payload.videoUrl ?? firstChapter?.videoUrl;
    const mediaType = payload.mediaType ?? firstChapter?.mediaType ?? 'image';

    return NextResponse.json({
      success: images.length > 0 || Boolean(videoUrl),
      url: targetUrl,
      chapterName: firstChapter?.name ?? payload.seriesTitle ?? 'Capítulo 1',
      images,
      imageCount: images.length,
      videoUrl,
      mediaType,
      author: payload.author ?? firstChapter?.author,
      seriesTitle: payload.seriesTitle,
    });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    console.error('Download API Error:', error);
    return NextResponse.json({ error: 'Failed to resolve download', details }, { status: 500 });
  }
}
