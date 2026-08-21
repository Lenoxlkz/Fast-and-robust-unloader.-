import { NextRequest, NextResponse } from 'next/server';
import { toSafeExternalUrl } from '@/lib/security/urlGuard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Vercel: el scraping de series largas supera el default de 15s.
export const maxDuration = 60;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'no-cache',
};

export interface ChapterItem {
  id: string | number;
  name: string;
  url: string;
  images?: string[];
  imageCount?: number;
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  author?: string;
}

export async function POST(req: NextRequest) {
  try {
    let body: { url?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Valid JSON body is required' }, { status: 400 });
    }

    // Valida y normaliza la URL antes de hacerle fetch desde el servidor:
    // bloquea protocolos raros, credenciales embebidas, loopback, redes
    // privadas y endpoints de metadata (SSRF).
    const safeUrl = toSafeExternalUrl(body.url);
    if (!safeUrl.ok || !safeUrl.url) {
      return NextResponse.json({ error: safeUrl.reason ?? 'Invalid URL' }, { status: 400 });
    }

    const targetUrl = safeUrl.url;

    let seriesTitle = '';
    const chapters: ChapterItem[] = [];

    // 0A. YouTube (Videos, Shorts, Playlists, Timestamps)
    const isYouTube = targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be');
    if (isYouTube) {
      try {
        const playlistMatch = targetUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
        const ytVideoIdMatch = targetUrl.match(/(?:v=|shorts\/|youtu\.be\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/i);
        const ytVideoId = ytVideoIdMatch ? ytVideoIdMatch[1] : '';

        // If playlist provided
        if (playlistMatch && (!ytVideoId || targetUrl.includes('/playlist'))) {
          const playlistId = playlistMatch[1];
          const plRes = await fetch(`https://www.youtube.com/playlist?list=${playlistId}`, {
            headers: BROWSER_HEADERS,
            next: { revalidate: 0 }
          });

          if (plRes.ok) {
            const plHtml = await plRes.text();
            const titleMatch = plHtml.match(/<title[^>]*>(.*?)<\/title>/i);
            if (titleMatch) {
              seriesTitle = titleMatch[1].replace('- YouTube', '').trim();
            }

            // Extract videos from playlist
            const vidMatches = [...plHtml.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})(?:&amp;|&)list=[^"'\s<>&]+/gi)];
            const seenVids = new Set<string>();
            for (const vm of vidMatches) {
              const vId = vm[1];
              if (!seenVids.has(vId)) {
                seenVids.add(vId);
                chapters.push({
                  id: chapters.length + 1,
                  name: `Video ${chapters.length + 1} (${vId})`,
                  url: `https://www.youtube.com/watch?v=${vId}`
                });
              }
            }
          }
        }

        // If single video or short
        if (ytVideoId && chapters.length === 0) {
          let videoTitle = '';
          let author = '';
          try {
            const oeRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytVideoId}&format=json`, {
              headers: BROWSER_HEADERS,
              next: { revalidate: 0 }
            });
            if (oeRes.ok) {
              const oeData = await oeRes.json();
              videoTitle = oeData.title || '';
              author = oeData.author_name || '';
            }
          } catch (oeErr) {
            console.warn('YouTube oEmbed chapter error:', oeErr);
          }

          seriesTitle = videoTitle || (author ? `${author} - YouTube Video` : 'YouTube Video');

          // Check if video page has timestamp chapters in description (e.g. 00:00 Intro, 01:20 Demo)
          try {
            const vidRes = await fetch(`https://www.youtube.com/watch?v=${ytVideoId}`, {
              headers: BROWSER_HEADERS,
              next: { revalidate: 0 }
            });
            if (vidRes.ok) {
              const vidHtml = await vidRes.text();
              const timestampRegex = /(?:(\d{1,2}):)?(\d{2}):(\d{2})\s+[-–—]?\s*([^\n\r<>&]{3,50})/g;
              let tsMatch;
              let chIdx = 1;
              while ((tsMatch = timestampRegex.exec(vidHtml)) !== null) {
                const hours = tsMatch[1] ? parseInt(tsMatch[1], 10) : 0;
                const minutes = parseInt(tsMatch[2], 10);
                const seconds = parseInt(tsMatch[3], 10);
                const totalSec = hours * 3600 + minutes * 60 + seconds;
                const chLabel = tsMatch[4].trim();

                chapters.push({
                  id: chIdx++,
                  name: `${tsMatch[0].split(' ')[0]} - ${chLabel}`,
                  url: `https://www.youtube.com/watch?v=${ytVideoId}&t=${totalSec}s`
                });
              }
            }
          } catch (tsErr) {
            console.warn('YouTube timestamp parse error:', tsErr);
          }

          if (chapters.length === 0) {
            const isShort = targetUrl.includes('/shorts/');
            chapters.push({
              id: '1',
              name: isShort ? 'Short' : (videoTitle || 'Video Completo'),
              url: targetUrl
            });
          }

          return NextResponse.json({
            success: true,
            seriesTitle,
            totalChapters: chapters.length,
            chapters
          });
        }

        if (chapters.length > 0) {
          return NextResponse.json({
            success: true,
            seriesTitle: seriesTitle || 'YouTube Playlist',
            totalChapters: chapters.length,
            chapters
          });
        }
      } catch (yErr) {
        console.warn('YouTube chapter discovery error:', yErr);
      }
    }

    // 0B. TikTok (Videos, Clips, Photo Carousels)
    const isTikTok = targetUrl.includes('tiktok.com') || targetUrl.includes('vm.tiktok.com') || targetUrl.includes('vt.tiktok.com');
    if (isTikTok) {
      try {
        let canonicalUrl = targetUrl;
        let detectedMediaType: 'image' | 'video' = 'video';
        let detectedCat: 'image' | 'video' = 'video';
        let extractedVideoUrl = '';

        // Try TikWM API first
        try {
          const tikWmRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`, {
            headers: BROWSER_HEADERS,
            next: { revalidate: 0 }
          });
          if (tikWmRes.ok) {
            const tkJson = await tikWmRes.json();
            if (tkJson?.code === 0 && tkJson?.data) {
              const tkData = tkJson.data;
              seriesTitle = tkData.title || (tkData.author?.nickname ? `TikTok de ${tkData.author.nickname}` : 'TikTok Media');
              const authorLabel = tkData.author?.unique_id ? `@${tkData.author.unique_id}` : 'TikTok Clip';

              if (tkData.images && Array.isArray(tkData.images) && tkData.images.length > 0) {
                detectedMediaType = 'image';
                detectedCat = 'image';
                const pCount = tkData.images.length;
                for (let i = 1; i <= pCount; i++) {
                  chapters.push({
                    id: String(i),
                    name: `Foto ${i} de ${pCount}`,
                    url: targetUrl
                  });
                }
              } else {
                detectedMediaType = 'video';
                detectedCat = 'video';
                extractedVideoUrl = tkData.play || tkData.wmplay || '';
                chapters.push({
                  id: '1',
                  name: `Clip - ${authorLabel}`,
                  url: targetUrl
                });
              }

              return NextResponse.json({
                success: true,
                seriesTitle,
                category: detectedCat,
                mediaType: detectedMediaType,
                videoUrl: extractedVideoUrl,
                totalChapters: chapters.length,
                chapters
              });
            }
          }
        } catch (tkErr) {
          console.warn('TikWM chapter discovery error:', tkErr);
        }

        // Fallback: follow redirect and oEmbed
        try {
          const followRes = await fetch(targetUrl, {
            headers: BROWSER_HEADERS,
            redirect: 'follow',
            next: { revalidate: 0 }
          });
          if (followRes.ok) {
            canonicalUrl = followRes.url || targetUrl;
          }
        } catch (fErr) {
          console.warn('TikTok follow redirect error:', fErr);
        }

        const isPhoto = canonicalUrl.includes('/photo/');
        detectedMediaType = isPhoto ? 'image' : 'video';
        detectedCat = isPhoto ? 'image' : 'video';

        try {
          const oeRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`, {
            headers: BROWSER_HEADERS,
            next: { revalidate: 0 }
          });
          if (oeRes.ok) {
            const oeData = await oeRes.json();
            seriesTitle = oeData.title || (oeData.author_name ? `TikTok de ${oeData.author_name}` : 'TikTok Video');
            const authorTag = oeData.author_unique_id ? `@${oeData.author_unique_id}` : (oeData.author_name || 'Clip');
            
            chapters.push({
              id: '1',
              name: authorTag,
              url: canonicalUrl
            });

            return NextResponse.json({
              success: true,
              seriesTitle,
              category: detectedCat,
              mediaType: detectedMediaType,
              totalChapters: 1,
              chapters
            });
          }
        } catch (tkOeErr) {
          console.warn('TikTok oEmbed chapter error:', tkOeErr);
        }

        // Final fallback for TikTok
        return NextResponse.json({
          success: true,
          seriesTitle: 'TikTok Media',
          category: detectedCat,
          mediaType: detectedMediaType,
          totalChapters: 1,
          chapters: [{ id: '1', name: 'TikTok Post', url: canonicalUrl }]
        });
      } catch (tkErr) {
        console.warn('TikTok chapter discovery error:', tkErr);
      }
    }

    // 0C. X / Twitter (Posts, Threads, Media sets)
    const isTwitterOrX = targetUrl.includes('x.com') || targetUrl.includes('twitter.com');
    if (isTwitterOrX) {
      try {
        const tweetMatch = targetUrl.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/i) ||
                           targetUrl.match(/status\/(\d+)/i);
        const username = tweetMatch && tweetMatch[1] ? tweetMatch[1] : 'user';
        const tweetId = tweetMatch ? (tweetMatch[2] || tweetMatch[1]) : '';

        if (tweetId) {
          let tweetTitle = '';
          let photoCount = 1;
          let isVideoTweet = false;
          let extractedVideoUrl = '';

          // Try FxTwitter to detect video vs images
          try {
            const fxRes = await fetch(`https://api.fxtwitter.com/${username}/status/${tweetId}`, {
              headers: BROWSER_HEADERS,
              next: { revalidate: 0 }
            });
            if (fxRes.ok) {
              const fxJson = await fxRes.json();
              if (fxJson?.tweet) {
                const tw = fxJson.tweet;
                tweetTitle = tw.text ? tw.text.slice(0, 80) : '';

                if (tw.media?.videos && Array.isArray(tw.media.videos) && tw.media.videos.length > 0) {
                  isVideoTweet = true;
                  const v = tw.media.videos[0];
                  if (v.variants && Array.isArray(v.variants) && v.variants.length > 0) {
                    const sorted = [...v.variants].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                    extractedVideoUrl = sorted[0].url || v.url;
                  } else {
                    extractedVideoUrl = v.url || '';
                  }
                } else if (tw.media?.all) {
                  for (const m of tw.media.all) {
                    if (m.type === 'video' || m.type === 'gif') {
                      isVideoTweet = true;
                      extractedVideoUrl = m.url || '';
                    }
                  }
                }

                if (!isVideoTweet) {
                  const pCount = tw.media?.photos?.length || tw.media?.all?.filter((m: { type?: string }) => m.type === 'photo')?.length || 1;
                  photoCount = Math.max(1, pCount);
                }
              }
            }
          } catch (fxErr) {
            console.warn('FxTwitter chapter discovery error:', fxErr);
          }

          seriesTitle = tweetTitle || `Post de @${username} en X`;

          if (isVideoTweet) {
            chapters.push({
              id: '1',
              name: `Video - @${username}`,
              url: targetUrl
            });
            return NextResponse.json({
              success: true,
              seriesTitle,
              category: 'video',
              mediaType: 'video',
              videoUrl: extractedVideoUrl,
              totalChapters: 1,
              chapters
            });
          }

          if (photoCount > 1) {
            for (let i = 1; i <= photoCount; i++) {
              chapters.push({
                id: String(i),
                name: `Foto ${i} de ${photoCount}`,
                url: targetUrl
              });
            }
          } else {
            chapters.push({
              id: '1',
              name: `@${username} (Tweet ${tweetId})`,
              url: targetUrl
            });
          }

          return NextResponse.json({
            success: true,
            seriesTitle,
            category: 'image',
            mediaType: 'image',
            totalChapters: chapters.length,
            chapters
          });
        }
      } catch (xErr) {
        console.warn('X / Twitter chapter discovery error:', xErr);
      }
    }

    // 0D. Instagram (Posts, Carousels, Reels, TV)
    const isInstagram = targetUrl.includes('instagram.com') || targetUrl.includes('instagr.am');
    if (isInstagram) {
      try {
        const isReelUrl = targetUrl.includes('/reel/') || targetUrl.includes('/reels/') || targetUrl.includes('/tv/');
        const postMatch = targetUrl.match(/\/(?:p|reel|reels|tv)\/([a-zA-Z0-9_-]+)/i);
        const shortcode = postMatch ? postMatch[1] : '';

        let igTitle = '';
        let author = '';
        let igVideoUrl = '';
        let igImages: string[] = [];
        let isDetectedVideo = isReelUrl;

        const cleanLookupUrl = shortcode ? (isReelUrl ? `https://www.instagram.com/reel/${shortcode}/` : `https://www.instagram.com/p/${shortcode}/`) : targetUrl;

        // 1. Fetch crawler metadata with Facebook external hit and standard browser fallback
        try {
          const botRes = await fetch(cleanLookupUrl, {
            headers: {
              'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
              'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
            },
            next: { revalidate: 0 }
          });
          if (botRes.ok) {
            const botHtml = await botRes.text();
            
            // Check OpenGraph title
            const ogTitle = botHtml.match(/<meta[^>]+property=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i);
            if (ogTitle) {
              const t = ogTitle[1].trim().replace(/&amp;/g, '&');
              if (!t.toLowerCase().includes('instagram') && !t.toLowerCase().includes('login') && !t.toLowerCase().includes('iniciar sesión')) {
                igTitle = t;
              }
            }

            const authorMatch = botHtml.match(/content=["']([^"':]+) on Instagram:/i) || botHtml.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"':]+) on Instagram/i);
            if (authorMatch) {
              author = `@${authorMatch[1].trim()}`;
            }

            // Check if it's explicitly typed as a video in metadata
            const ogType = botHtml.match(/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i);
            if (ogType && (ogType[1].includes('video') || ogType[1].includes('player'))) {
              isDetectedVideo = true;
            }

            const ogVideo = botHtml.match(/<meta[^>]+property=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["'][^>]+content=["']([^"']+)["']/i);
            if (ogVideo) {
              igVideoUrl = ogVideo[1].replace(/\\u0026/gi, '&').replace(/&amp;/gi, '&');
              isDetectedVideo = true;
            }

            const ogImage = botHtml.match(/<meta[^>]+property=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/i);
            if (ogImage) {
              const img = ogImage[1].replace(/\\u0026/gi, '&').replace(/&amp;/gi, '&');
              if (img.startsWith('http') && !igImages.includes(img)) {
                igImages.push(img);
              }
            }

            // Look for carousel / multi-image assets inside embedded JSON
            const scontentMatches = botHtml.match(/https:\\\/\\\/[a-zA-Z0-9.-]+\.cdninstagram\.com\\\/[a-zA-Z0-9_.\-%]+/g);
            if (scontentMatches) {
              for (const raw of scontentMatches) {
                const cleaned = raw.replace(/\\\//g, '/').replace(/\\u0026/g, '&');
                if (cleaned.startsWith('http') && !cleaned.includes('150x150') && !cleaned.includes('s150x150') && !igImages.includes(cleaned)) {
                  igImages.push(cleaned);
                }
              }
            }
          }
        } catch (botErr) {
          console.warn('Instagram bot chapter error:', botErr);
        }

        // 2. Fetch oEmbed if title or author missing
        if (!igTitle || !author) {
          try {
            const oeRes = await fetch(`https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(cleanLookupUrl)}`, {
              headers: BROWSER_HEADERS,
              next: { revalidate: 0 }
            });
            if (oeRes.ok) {
              const oeData = await oeRes.json();
              if (oeData.title && !igTitle) igTitle = oeData.title;
              if (oeData.author_name && !author) author = `@${oeData.author_name}`;
              if (oeData.thumbnail_url && !igImages.includes(oeData.thumbnail_url)) {
                igImages.push(oeData.thumbnail_url);
              }
            }
          } catch (igOe) {
            console.warn('Instagram oEmbed chapter error:', igOe);
          }
        }

        // 3. Fallback to captioned embed if needed
        if (!igVideoUrl && isDetectedVideo && shortcode) {
          try {
            const embedRes = await fetch(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
              headers: BROWSER_HEADERS,
              next: { revalidate: 0 }
            });
            if (embedRes.ok) {
              const embedHtml = await embedRes.text();
              const vMatch = embedHtml.match(/<video[^>]+src=["']([^"']+)["']/i) || embedHtml.match(/"video_url":"([^"]+)"/i);
              if (vMatch) {
                igVideoUrl = vMatch[1].replace(/\\u0026/g, '&').replace(/&amp;/g, '&').replace(/\\\//g, '/');
                isDetectedVideo = true;
              }
              const imgMatches = embedHtml.match(/<img[^>]+class=["'][^"']*EmbeddedMediaImage[^"']*["'][^>]+src=["']([^"']+)["']/i);
              if (imgMatches && !igImages.includes(imgMatches[1])) {
                igImages.unshift(imgMatches[1].replace(/&amp;/g, '&'));
              }
            }
          } catch (embedErr) {
            console.warn('Instagram embed scraping error:', embedErr);
          }
        }

        seriesTitle = igTitle ? igTitle.slice(0, 100) : (author ? (isDetectedVideo ? `Reel de ${author}` : `Instagram de ${author}`) : (isDetectedVideo ? 'Instagram Reel' : 'Instagram Post'));

        if (isDetectedVideo || igVideoUrl) {
          chapters.push({
            id: '1',
            name: author ? `${author} - Video` : (shortcode ? `Reel ${shortcode}` : 'Video Instagram'),
            url: targetUrl,
            images: igImages,
            imageCount: igImages.length,
            videoUrl: igVideoUrl,
            mediaType: 'video'
          });

          return NextResponse.json({
            success: true,
            seriesTitle,
            category: 'video',
            mediaType: 'video',
            videoUrl: igVideoUrl,
            images: igImages,
            author,
            totalChapters: 1,
            chapters
          });
        }

        chapters.push({
          id: '1',
          name: author ? `${author} - Post` : (shortcode ? `Post ${shortcode}` : 'Publicación'),
          url: targetUrl,
          images: igImages,
          imageCount: igImages.length,
          mediaType: 'image'
        });

        return NextResponse.json({
          success: true,
          seriesTitle,
          category: 'image',
          mediaType: 'image',
          images: igImages,
          author,
          totalChapters: 1,
          chapters
        });
      } catch (igErr) {
        console.warn('Instagram chapter discovery error:', igErr);
      }
    }

    // 0E. Facebook (Posts, Videos, Photos, Reels)
    const isFacebook = targetUrl.includes('facebook.com') || targetUrl.includes('fb.watch') || targetUrl.includes('fb.com');
    if (isFacebook) {
      try {
        let fbTitle = 'Facebook Post';
        let fbVideoUrl = '';
        let fbImages: string[] = [];
        let isVideo = targetUrl.includes('/video') || targetUrl.includes('/reel') || targetUrl.includes('fb.watch') || targetUrl.includes('/share/r/') || targetUrl.includes('/share/v/');
        let canonicalUrl = targetUrl;

        const cleanFbSrc = (str: string | undefined | null) => {
          if (!str) return '';
          return str
            .replace(/\\\//g, '/')
            .replace(/\\u00252F/gi, '/')
            .replace(/\\u0025/g, '%')
            .replace(/\\u0026/g, '&')
            .replace(/&amp;/g, '&')
            .replace(/&#x27;/g, "'")
            .replace(/&quot;/g, '"');
        };

        const fbHeaders = {
          'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
        };

        try {
          let fbRes = await fetch(targetUrl, {
            headers: fbHeaders,
            redirect: 'follow',
            next: { revalidate: 0 }
          });
          
          let fbHtml = await fbRes.text();
          let finalUrl = fbRes.url;

          const nextMatch = finalUrl.match(/[?&]next=([^&]+)/i) || fbHtml.match(/login\/\?next=([^"'\s&]+)/i);
          if (nextMatch) {
            const decodedNext = decodeURIComponent(nextMatch[1]);
            const storyMatch = decodedNext.match(/story_fbid=([^&]+)/i) || decodedNext.match(/\/posts\/([^/?#]+)/i);
            const idMatch = decodedNext.match(/[?&]id=([^&]+)/i);

            if (storyMatch && idMatch) {
              canonicalUrl = `https://www.facebook.com/${idMatch[1]}/posts/${storyMatch[1]}`;
              const cRes = await fetch(canonicalUrl, {
                headers: fbHeaders,
                redirect: 'follow',
                next: { revalidate: 0 }
              });
              if (cRes.ok) {
                fbHtml = await cRes.text();
                finalUrl = cRes.url;
              }
            }
          }
          
          const ogTitle = fbHtml.match(/<meta[^>]+property=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i);
          if (ogTitle) {
            const t = cleanFbSrc(ogTitle[1]).trim();
            if (t && !t.toLowerCase().includes('log in') && !t.toLowerCase().includes('log into') && !t.toLowerCase().includes('iniciar sesión')) {
              fbTitle = t;
            }
          }

          const ogUrl = fbHtml.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
          if (ogUrl) {
            canonicalUrl = cleanFbSrc(ogUrl[1]);
            if (canonicalUrl.includes('/reel') || canonicalUrl.includes('/video') || canonicalUrl.includes('watch') || canonicalUrl.includes('/share/r/')) {
              isVideo = true;
            }
          }

          const ogVideo = fbHtml.match(/<meta[^>]+property=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["'][^>]+content=["']([^"']+)["']/i);
          if (ogVideo) {
            fbVideoUrl = cleanFbSrc(ogVideo[1]);
            isVideo = true;
          }

          if (!fbVideoUrl) {
            const streamMatches = [
              fbHtml.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/i),
              fbHtml.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/i),
              fbHtml.match(/"playable_url_quality_hd"\s*:\s*"([^"]+)"/i),
              fbHtml.match(/"playable_url"\s*:\s*"([^"]+)"/i),
              fbHtml.match(/"hd_src"\s*:\s*"([^"]+)"/i),
              fbHtml.match(/"sd_src"\s*:\s*"([^"]+)"/i)
            ];
            for (const m of streamMatches) {
              if (m && m[1]) {
                const v = cleanFbSrc(m[1]);
                if (v.startsWith('http')) {
                  fbVideoUrl = v;
                  isVideo = true;
                  break;
                }
              }
            }
          }

          // Extract OpenGraph images
          const ogImageMatches = fbHtml.matchAll(/<meta[^>]+property=["'](?:og:image|og:image:url|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi);
          for (const m of ogImageMatches) {
            const src = cleanFbSrc(m[1]);
            if (src.startsWith('http') && !src.includes('safe_image.php') && !src.includes('rsrc.php') && !fbImages.includes(src)) {
              fbImages.push(src);
            }
          }

          // Extract high resolution photos from Facebook content payloads
          const fbcdnMatches = fbHtml.match(/https:\\\/\\\/scontent[a-zA-Z0-9_.\-%\\\/]+/g) || fbHtml.match(/https:\/\/scontent[a-zA-Z0-9_.\-%/]+/g);
          if (fbcdnMatches) {
            for (const raw of fbcdnMatches) {
              const src = cleanFbSrc(raw);
              if (
                src.startsWith('http') &&
                !src.includes('p50x50') &&
                !src.includes('s50x50') &&
                !src.includes('p100x100') &&
                !src.includes('rsrc.php') &&
                !src.includes('emoji.php') &&
                !fbImages.includes(src)
              ) {
                fbImages.push(src);
              }
            }
          }
        } catch (fbFetchErr) {
          console.warn('Facebook bot fetch error:', fbFetchErr);
        }

        // Try plugin embed fetch if it's a video without explicit stream
        if (isVideo && !fbVideoUrl) {
          try {
            const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(canonicalUrl)}`;
            const embedRes = await fetch(embedUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
              next: { revalidate: 0 }
            });
            if (embedRes.ok) {
              const embedHtml = await embedRes.text();
              const hdMatch = embedHtml.match(/"hd_src"\s*:\s*"([^"]+)"/i);
              const sdMatch = embedHtml.match(/"sd_src"\s*:\s*"([^"]+)"/i);
              
              const hd = hdMatch ? cleanFbSrc(hdMatch[1]) : null;
              const sd = sdMatch ? cleanFbSrc(sdMatch[1]) : null;
              
              if (hd) fbVideoUrl = hd;
              else if (sd) fbVideoUrl = sd;
            }
          } catch (embedErr) {
            console.warn('Facebook plugin embed error:', embedErr);
          }
        }

        seriesTitle = fbTitle;

        if (isVideo || fbVideoUrl) {
          chapters.push({
            id: '1',
            name: fbTitle.slice(0, 40) || 'Video Facebook',
            url: targetUrl,
            images: fbImages,
            imageCount: fbImages.length,
            videoUrl: fbVideoUrl,
            mediaType: 'video'
          });
          return NextResponse.json({
            success: true,
            seriesTitle,
            category: 'video',
            mediaType: 'video',
            videoUrl: fbVideoUrl,
            images: fbImages,
            totalChapters: 1,
            chapters
          });
        }

        chapters.push({
          id: '1',
          name: fbTitle.slice(0, 40) || 'Publicación Facebook',
          url: targetUrl,
          images: fbImages,
          imageCount: fbImages.length,
          mediaType: 'image'
        });

        return NextResponse.json({
          success: true,
          seriesTitle,
          category: 'image',
          mediaType: 'image',
          images: fbImages,
          totalChapters: 1,
          chapters
        });
      } catch (fbErr) {
        console.warn('Facebook chapter discovery error:', fbErr);
      }
    }

    // 1. Check if URL belongs to Olympus (or clones using Olympus panel architecture)
    const isOlympus = targetUrl.includes('olympusxyz') || targetUrl.includes('olympusbiblioteca') || targetUrl.includes('imagesolymp');
    const olympusSlugMatch = targetUrl.match(/\/(?:series|capitulo\/\d+)\/(?:comic-)?([^/?#]+)/i);

    // 2. Check if URL belongs to ManhwaWeb
    const isManhwaWeb = targetUrl.includes('manhwaweb.com') || targetUrl.includes('manhwawebbackend');

    if (isManhwaWeb) {
      try {
        let mangaSlug = '';
        const manhwaMangaMatch = targetUrl.match(/\/manhwa\/([^/?#]+)/i);
        const manhwaLeerMatch = targetUrl.match(/\/leer\/([^/?#]+)/i);

        if (manhwaMangaMatch) {
          mangaSlug = manhwaMangaMatch[1];
        } else if (manhwaLeerMatch) {
          const chapterSlug = manhwaLeerMatch[1];
          // Call chapter endpoint to resolve real_id / manga slug
          try {
            const chCheckRes = await fetch(`https://manhwawebbackend-production.up.railway.app/chapters/see/${chapterSlug}`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://manhwaweb.com/',
                'Origin': 'https://manhwaweb.com'
              },
              next: { revalidate: 0 }
            });
            if (chCheckRes.ok) {
              const chData = await chCheckRes.json();
              mangaSlug = chData.real_id || chData._id || '';
              if (chData.name) {
                seriesTitle = String(chData.name).trim();
              }
            }
          } catch {
            // fallback: strip trailing chapter suffix
            mangaSlug = chapterSlug.replace(/-[0-9]+(?:_[0-9]+)?$/, '');
          }
        }

        if (mangaSlug) {
          const apiRes = await fetch(`https://manhwawebbackend-production.up.railway.app/manhwa/see/${mangaSlug}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://manhwaweb.com/',
              'Origin': 'https://manhwaweb.com'
            },
            next: { revalidate: 0 }
          });

          if (apiRes.ok) {
            const mangaData = await apiRes.json();
            const resolvedTitle = mangaData.the_real_name || mangaData.name_esp || mangaData.name_raw || mangaData._name || mangaData.name || seriesTitle;
            if (resolvedTitle) {
              seriesTitle = String(resolvedTitle).trim();
            }

            const rawChapters = mangaData.chapters || mangaData._chapters || [];
            if (Array.isArray(rawChapters) && rawChapters.length > 0) {
              for (let i = 0; i < rawChapters.length; i++) {
                const ch = rawChapters[i];
                const chNum = ch.chapter ?? (i + 1);
                const chNumFormatted = String(chNum).replace('_', '.');
                const chName = ch.name ? (ch.name.toLowerCase().includes('cap') ? ch.name : `Capítulo ${ch.name}`) : `Capítulo ${chNumFormatted}`;
                const chUrl = ch.link || `https://manhwaweb.com/leer/${mangaSlug}-${chNum}`;
                
                chapters.push({
                  id: chNum,
                  name: chName,
                  url: chUrl
                });
              }
            }
          }
        }

        if (chapters.length > 0) {
          chapters.sort((a, b) => {
            const numA = parseFloat(String(a.id).replace(/[^0-9.]/g, '')) || 0;
            const numB = parseFloat(String(b.id).replace(/[^0-9.]/g, '')) || 0;
            return numA - numB;
          });

          return NextResponse.json({
            success: true,
            seriesTitle: seriesTitle || 'ManhwaWeb',
            totalChapters: chapters.length,
            chapters
          });
        }
      } catch (manhwaErr) {
        console.warn('ManhwaWeb chapter API scraping error:', manhwaErr);
      }
    }

    if (isOlympus && olympusSlugMatch) {
      const slug = olympusSlugMatch[1];
      try {
        // Fetch page 1 from Olympus Panel API
        const panelRes = await fetch(`https://panel.olympusxyz.com/api/series/${slug}/chapters?page=1`, {
          headers: {
            ...BROWSER_HEADERS,
            'Referer': 'https://olympusxyz.com/',
            'Origin': 'https://olympusxyz.com',
          },
          next: { revalidate: 0 }
        });

        if (panelRes.ok) {
          const panelData = await panelRes.json();
          const lastPage = panelData.meta?.last_page || 1;
          const totalChapters = panelData.meta?.total || (panelData.data?.length || 0);

          if (Array.isArray(panelData.data)) {
            for (const ch of panelData.data) {
              chapters.push({
                id: ch.id,
                name: `Capítulo ${ch.name}`,
                url: `https://olympusxyz.com/capitulo/${ch.id}/comic-${slug}`
              });
            }
          }

          // Fetch remaining pages in parallel if multi-page
          if (lastPage > 1) {
            const pagePromises = [];
            for (let p = 2; p <= Math.min(lastPage, 25); p++) {
              pagePromises.push(
                fetch(`https://panel.olympusxyz.com/api/series/${slug}/chapters?page=${p}`, {
                  headers: {
                    ...BROWSER_HEADERS,
                    'Referer': 'https://olympusxyz.com/',
                    'Origin': 'https://olympusxyz.com',
                  },
                  next: { revalidate: 0 }
                }).then(r => r.ok ? r.json() : null).catch(() => null)
              );
            }

            const pageResults = await Promise.all(pagePromises);
            for (const res of pageResults) {
              if (res && Array.isArray(res.data)) {
                for (const ch of res.data) {
                  chapters.push({
                    id: ch.id,
                    name: `Capítulo ${ch.name}`,
                    url: `https://olympusxyz.com/capitulo/${ch.id}/comic-${slug}`
                  });
                }
              }
            }
          }

          // Format title from slug
          seriesTitle = slug.split('-').slice(0, -1).join(' ') || slug;
          seriesTitle = seriesTitle.charAt(0).toUpperCase() + seriesTitle.slice(1);

          // Sort chapters ascending by chapter number
          chapters.sort((a, b) => {
            const numA = parseFloat(a.name.replace(/[^0-9.]/g, '')) || 0;
            const numB = parseFloat(b.name.replace(/[^0-9.]/g, '')) || 0;
            return numA - numB;
          });

          return NextResponse.json({
            success: true,
            seriesTitle,
            totalChapters: chapters.length || totalChapters,
            chapters
          });
        }
      } catch (olympusErr) {
        console.warn('Olympus panel chapters fetch failed, falling back to HTML parse:', olympusErr);
      }
    }

    // 3. CapibaraTraductor Scraper
    if (targetUrl.includes('capibaratraductor.com')) {
      try {
        let mangaPageUrl = targetUrl;
        const capibaraChMatch = targetUrl.match(/^(https?:\/\/capibaratraductor\.com\/[^\/]+\/manga\/[^\/]+)/i);
        if (capibaraChMatch) {
          mangaPageUrl = capibaraChMatch[1];
        }

        const res = await fetch(mangaPageUrl, {
          headers: {
            ...BROWSER_HEADERS,
            'Referer': 'https://capibaratraductor.com/',
          },
          next: { revalidate: 0 }
        });

        if (res.ok) {
          const html = await res.text();
          const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          if (titleMatch) {
            seriesTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s*[-|–—].*$/, '');
          }

          const chMatches = [...html.matchAll(/href=["'](\/(?:senshimanga|[a-zA-Z0-9_\-]+)\/manga\/[^\/]+\/chapters\/([0-9.]+))["']/gi)];
          const chMap = new Map<string, ChapterItem>();
          for (const m of chMatches) {
            const relPath = m[1];
            const num = parseFloat(m[2]);
            const fullUrl = `https://capibaratraductor.com${relPath}`;
            if (!chMap.has(fullUrl)) {
              chMap.set(fullUrl, {
                id: num,
                name: `Capítulo ${num}`,
                url: fullUrl
              });
            }
          }

          if (chMap.size > 0) {
            const sorted = Array.from(chMap.values()).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
            return NextResponse.json({
              success: true,
              seriesTitle: seriesTitle || 'CapibaraTraductor Series',
              totalChapters: sorted.length,
              chapters: sorted
            });
          }
        }
      } catch (capiErr) {
        console.warn('CapibaraTraductor chapter scraping error:', capiErr);
      }
    }

    // 4. ImperioManhua Scraper (WordPress Madara ajax)
    if (targetUrl.includes('imperiomanhua.com')) {
      try {
        const slugMatch = targetUrl.match(/\/manga\/([^/?#]+)/i);
        const slug = slugMatch ? slugMatch[1] : '';
        if (slug) {
          const ajaxRes = await fetch(`https://imperiomanhua.com/manga/${slug}/ajax/chapters/`, {
            method: 'POST',
            headers: {
              ...BROWSER_HEADERS,
              'Referer': `https://imperiomanhua.com/manga/${slug}/`,
              'X-Requested-With': 'XMLHttpRequest'
            },
            next: { revalidate: 0 }
          });

          if (ajaxRes.ok) {
            const ajaxHtml = await ajaxRes.text();
            const chMatches = [...ajaxHtml.matchAll(/href=["'](https?:\/\/imperiomanhua\.com\/manga\/[^\/]+\/([^"'/]+)\/?)["']/gi)];
            const chMap = new Map<string, ChapterItem>();

            for (const m of chMatches) {
              const fullUrl = m[1];
              const chSlug = m[2];
              if (chSlug.includes('capitulo') || chSlug.includes('chapter')) {
                const numMatch = chSlug.match(/(\d+(?:\.\d+)?)/);
                const num = numMatch ? parseFloat(numMatch[1]) : (chMap.size + 1);
                if (!chMap.has(fullUrl)) {
                  chMap.set(fullUrl, {
                    id: num,
                    name: `Capítulo ${num}`,
                    url: fullUrl
                  });
                }
              }
            }

            if (chMap.size > 0) {
              seriesTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
              const sorted = Array.from(chMap.values()).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
              return NextResponse.json({
                success: true,
                seriesTitle,
                totalChapters: sorted.length,
                chapters: sorted
              });
            }
          }
        }
      } catch (impErr) {
        console.warn('ImperioManhua chapter scraping error:', impErr);
      }
    }

    // 5. LeerCapitulo Scraper
    if (targetUrl.includes('leercapitulo.co')) {
      try {
        let mangaUrl = targetUrl;
        const leerMatch = targetUrl.match(/\/leer\/([^\/]+)\/([^\/]+)/i);
        const mangaMatch = targetUrl.match(/\/manga\/([^\/]+)\/([^\/]+)/i);
        let mangaId = '';
        let mangaSlug = '';

        if (leerMatch) {
          mangaId = leerMatch[1];
          mangaSlug = leerMatch[2];
          mangaUrl = `https://www.leercapitulo.co/manga/${mangaId}/${mangaSlug}/`;
        } else if (mangaMatch) {
          mangaId = mangaMatch[1];
          mangaSlug = mangaMatch[2];
          mangaUrl = `https://www.leercapitulo.co/manga/${mangaId}/${mangaSlug}/`;
        }

        const res = await fetch(mangaUrl, {
          headers: {
            ...BROWSER_HEADERS,
            'Referer': 'https://www.leercapitulo.co/',
          },
          next: { revalidate: 0 }
        });

        if (res.ok) {
          const html = await res.text();
          const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          if (titleMatch) {
            seriesTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s*[-|–—].*$/, '');
          }

          const chMatches = [...html.matchAll(/href=["']((?:https?:\/\/www\.leercapitulo\.co)?\/leer\/[^\/]+\/[^\/]+\/([0-9.]+)\/?)["']/gi)];
          const chMap = new Map<string, ChapterItem>();

          for (const m of chMatches) {
            let chUrl = m[1];
            if (!chUrl.startsWith('http')) chUrl = `https://www.leercapitulo.co${chUrl}`;
            const num = parseFloat(m[2]);
            if (!chMap.has(chUrl)) {
              chMap.set(chUrl, {
                id: num,
                name: `Capítulo ${num}`,
                url: chUrl
              });
            }
          }

          if (chMap.size > 0) {
            const sorted = Array.from(chMap.values()).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
            return NextResponse.json({
              success: true,
              seriesTitle: seriesTitle || (mangaSlug ? mangaSlug.replace(/-/g, ' ') : 'LeerCapitulo Series'),
              totalChapters: sorted.length,
              chapters: sorted
            });
          }
        }
      } catch (leerErr) {
        console.warn('LeerCapitulo chapter scraping error:', leerErr);
      }
    }

    // 6. MangaLect Scraper
    if (targetUrl.includes('mangalect.org')) {
      try {
        let infoUrl = targetUrl;
        const lecturaMatch = targetUrl.match(/\/lectura\/([^\/]+)/i);
        const infoMatch = targetUrl.match(/\/info\/([^\/]+)/i);
        let slug = '';

        if (lecturaMatch) {
          slug = lecturaMatch[1];
          infoUrl = `https://mangalect.org/info/${slug}/`;
        } else if (infoMatch) {
          slug = infoMatch[1];
          infoUrl = `https://mangalect.org/info/${slug}/`;
        }

        const res = await fetch(infoUrl, {
          headers: {
            ...BROWSER_HEADERS,
            'Referer': 'https://mangalect.org/',
          },
          next: { revalidate: 0 }
        });

        if (res.ok) {
          const html = await res.text();
          const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          if (titleMatch) {
            seriesTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s*[-|–—].*$/, '');
          }

          const chMatches = [...html.matchAll(/href=["']((?:https?:\/\/mangalect\.org)?\/lectura\/[^\/]+\/([0-9.]+)\/?)["']/gi)];
          const chMap = new Map<string, ChapterItem>();

          for (const m of chMatches) {
            let chUrl = m[1];
            if (!chUrl.startsWith('http')) chUrl = `https://mangalect.org${chUrl}`;
            const num = parseFloat(m[2]);
            if (!chMap.has(chUrl)) {
              chMap.set(chUrl, {
                id: num,
                name: `Capítulo ${num}`,
                url: chUrl
              });
            }
          }

          if (chMap.size > 0) {
            const sorted = Array.from(chMap.values()).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
            return NextResponse.json({
              success: true,
              seriesTitle: seriesTitle || (slug ? slug.replace(/-/g, ' ') : 'MangaLect Series'),
              totalChapters: sorted.length,
              chapters: sorted
            });
          }
        }
      } catch (lectErr) {
        console.warn('MangaLect chapter scraping error:', lectErr);
      }
    }

    // 2. Generic HTML Scraping for any Manga website
    try {
      const parsedUrl = new URL(targetUrl);
      const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;

      const res = await fetch(targetUrl, {
        headers: {
          ...BROWSER_HEADERS,
          'Referer': origin,
          'Origin': origin,
        },
        next: { revalidate: 0 },
      });

      if (res.ok) {
        const html = await res.text();

        // Try extracting series title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) ||
                           html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        if (titleMatch) {
          seriesTitle = titleMatch[1].trim().replace(/\s*[-|–—].*$/, '');
        }

        // Search for all chapter links in HTML
        const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        const seenUrls = new Set<string>();

        while ((match = linkRegex.exec(html)) !== null) {
          const href = match[1];
          const innerText = match[2].replace(/<[^>]+>/g, '').trim();

          const isChapterHref = /[\/-](?:capitulo|chapter|ch|read|episodio)[\/-]?\d+/i.test(href) ||
                                /cap[íi]tulo\s*\d+/i.test(innerText) ||
                                /chapter\s*\d+/i.test(innerText);

          if (isChapterHref) {
            try {
              const fullUrl = new URL(href, targetUrl).href;
              if (!seenUrls.has(fullUrl)) {
                seenUrls.add(fullUrl);
                const name = innerText || `Capítulo ${chapters.length + 1}`;
                chapters.push({
                  id: chapters.length + 1,
                  name,
                  url: fullUrl
                });
              }
            } catch {
              // ignore invalid url
            }
          }
        }

        // Also check <option> elements (dropdown chapter selectors)
        const optionRegex = /<option[^>]+value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi;
        while ((match = optionRegex.exec(html)) !== null) {
          const val = match[1];
          const text = match[2].trim();
          if (/cap[íi]tulo|chapter|\/ch/i.test(val) || /cap[íi]tulo|chapter|\bch\b/i.test(text)) {
            try {
              const fullUrl = new URL(val, targetUrl).href;
              if (!seenUrls.has(fullUrl)) {
                seenUrls.add(fullUrl);
                chapters.push({
                  id: chapters.length + 1,
                  name: text || `Capítulo ${chapters.length + 1}`,
                  url: fullUrl
                });
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch (genericErr) {
      console.warn('Generic HTML chapter scraping error:', genericErr);
    }

    // If chapters were found from HTML
    if (chapters.length > 0) {
      chapters.sort((a, b) => {
        const numA = parseFloat(a.name.replace(/[^0-9.]/g, '')) || 0;
        const numB = parseFloat(b.name.replace(/[^0-9.]/g, '')) || 0;
        return numA - numB;
      });

      return NextResponse.json({
        success: true,
        seriesTitle: seriesTitle || 'Manga Series',
        totalChapters: chapters.length,
        chapters
      });
    }

    // Fallback: If URL is a single chapter or no sub-chapters list found, treat as 1 chapter
    return NextResponse.json({
      success: true,
      seriesTitle: seriesTitle || 'Chapter',
      totalChapters: 1,
      chapters: [
        {
          id: '1',
          name: 'Capítulo 1',
          url: targetUrl
        }
      ]
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Chapters API Error:', error);
    return NextResponse.json({ error: 'Failed to discover chapters', details: errorMessage }, { status: 500 });
  }
}
