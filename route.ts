import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'no-cache',
};

export async function POST(req: NextRequest) {
  try {
    let body: { url?: string; mode?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Valid JSON body is required' }, { status: 400 });
    }

    let targetUrl = (body.url || '').trim();
    if (!targetUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    const images: string[] = [];
    let chapterName = '';
    let mediaType: 'image' | 'video' = 'image';
    let videoUrl = '';
    let videoEmbedUrl = '';
    let author = '';

    // 1. YouTube
    if (targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be')) {
      mediaType = 'video';
      const ytVideoIdMatch = targetUrl.match(/(?:v=|shorts\/|youtu\.be\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/i);
      const videoId = ytVideoIdMatch ? ytVideoIdMatch[1] : '';
      if (videoId) {
        videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        videoEmbedUrl = `https://www.youtube.com/embed/${videoId}`;
        chapterName = `YouTube Video (${videoId})`;
        images.push(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
      }
      return NextResponse.json({
        success: true,
        chapterName,
        mediaType,
        videoUrl,
        videoEmbedUrl,
        images
      });
    }

    // 2. TikTok
    if (targetUrl.includes('tiktok.com') || targetUrl.includes('vm.tiktok.com')) {
      try {
        const tkRes = await fetch('https://www.tikwm.com/api/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `url=${encodeURIComponent(targetUrl)}&hd=1`,
          next: { revalidate: 0 }
        });
        if (tkRes.ok) {
          const tkJson = await tkRes.json();
          if (tkJson.code === 0 && tkJson.data) {
            const d = tkJson.data;
            author = d.author?.unique_id ? `@${d.author.unique_id}` : (d.author?.nickname || '');
            chapterName = d.title || `TikTok post ${author ? `de ${author}` : ''}`;
            if (d.images && Array.isArray(d.images) && d.images.length > 0) {
              mediaType = 'image';
              images.push(...d.images);
            } else if (d.play || d.hdplay || d.wmplay) {
              mediaType = 'video';
              videoUrl = d.play || d.hdplay || d.wmplay;
              if (d.cover) images.push(d.cover);
            }
            return NextResponse.json({
              success: true,
              chapterName,
              mediaType,
              videoUrl,
              author,
              images
            });
          }
        }
      } catch (tkErr) {
        console.warn('TikTok download extractor warning:', tkErr);
      }
    }

    // 3. Instagram
    if (targetUrl.includes('instagram.com') || targetUrl.includes('instagr.am')) {
      try {
        const shortcodeMatch = targetUrl.match(/\/(?:p|reel|tv|reels)\/([a-zA-Z0-9_-]+)/i);
        const shortcode = shortcodeMatch ? shortcodeMatch[1] : '';
        const botRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          },
          next: { revalidate: 0 }
        });
        if (botRes.ok) {
          const botHtml = await botRes.text();
          const ogVideo = botHtml.match(/<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i);
          const ogImage = botHtml.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i);
          const ogTitle = botHtml.match(/<meta[^>]+property=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i);
          
          if (ogTitle) chapterName = ogTitle[1].replace(/&amp;/g, '&');
          if (ogVideo) {
            mediaType = 'video';
            videoUrl = ogVideo[1].replace(/\\u0026/gi, '&').replace(/&amp;/gi, '&');
          }
          if (ogImage) {
            images.push(ogImage[1].replace(/\\u0026/gi, '&').replace(/&amp;/gi, '&'));
          }
          if (videoUrl || images.length > 0) {
            return NextResponse.json({
              success: true,
              chapterName: chapterName || (shortcode ? `Instagram ${shortcode}` : 'Instagram Post'),
              mediaType,
              videoUrl,
              images
            });
          }
        }
      } catch (igErr) {
        console.warn('Instagram extractor warning:', igErr);
      }
    }

    // 4. ManhwaWeb
    if (targetUrl.includes('manhwaweb.com') || targetUrl.includes('manhwawebbackend')) {
      const manhwaLeerMatch = targetUrl.match(/\/leer\/([^/?#]+)/i);
      if (manhwaLeerMatch) {
        const chapterSlug = manhwaLeerMatch[1];
        try {
          const chRes = await fetch(`https://manhwawebbackend-production.up.railway.app/chapters/see/${chapterSlug}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://manhwaweb.com/',
              'Origin': 'https://manhwaweb.com'
            },
            next: { revalidate: 0 }
          });
          if (chRes.ok) {
            const chData = await chRes.json();
            chapterName = chData.name ? (chData.name.toLowerCase().includes('cap') ? chData.name : `Capítulo ${chData.name}`) : `Capítulo ${chapterSlug}`;
            const chImgs = chData.images || chData.pages || chData.chapter_images || [];
            if (Array.isArray(chImgs)) {
              for (const img of chImgs) {
                const src = typeof img === 'string' ? img : (img?.url || img?.src || '');
                if (src && src.startsWith('http')) images.push(src);
              }
            }
            if (images.length > 0) {
              return NextResponse.json({
                success: true,
                chapterName,
                mediaType: 'image',
                images
              });
            }
          }
        } catch (mwErr) {
          console.warn('ManhwaWeb download error:', mwErr);
        }
      }
    }

    // 5. Olympus Scanlation / Olympus Biblioteca
    if (targetUrl.includes('olympusxyz') || targetUrl.includes('olympusbiblioteca') || targetUrl.includes('imagesolymp')) {
      const chMatch = targetUrl.match(/capitulo\/([0-9]+)/i);
      if (chMatch) {
        const chId = chMatch[1];
        try {
          const chRes = await fetch(`https://panel.olympusxyz.com/api/chapter/${chId}`, {
            headers: {
              ...BROWSER_HEADERS,
              'Referer': 'https://olympusxyz.com/',
              'Origin': 'https://olympusxyz.com',
            },
            next: { revalidate: 0 }
          });
          if (chRes.ok) {
            const chJson = await chRes.json();
            const chData = chJson.data || chJson.chapter || chJson;
            chapterName = chData.name ? `Capítulo ${chData.name}` : `Capítulo ${chId}`;
            const rawPages = chData.pages || chData.images || chData.chapter_images || [];
            if (Array.isArray(rawPages)) {
              for (const page of rawPages) {
                const src = typeof page === 'string' ? page : (page?.url || page?.src || page?.page_url || '');
                if (src && src.startsWith('http')) {
                  images.push(src);
                }
              }
            }
            if (images.length > 0) {
              return NextResponse.json({
                success: true,
                chapterName,
                mediaType: 'image',
                images
              });
            }
          }
        } catch (olympErr) {
          console.warn('Olympus chapter download error:', olympErr);
        }
      }
    }

    // 6. Generic HTML page scraping (Capibara, ImperioManhua, Webtoons, MangaDex, etc.)
    try {
      const htmlRes = await fetch(targetUrl, {
        headers: BROWSER_HEADERS,
        next: { revalidate: 0 }
      });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        
        // Extract Title / Chapter Heading
        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch) {
          chapterName = titleMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s*[-|–—].*$/, '');
        }

        // Look for Manga reader image containers (data-src, data-lazy-src, src, srcset)
        const imgTagRegex = /<img[^>]+(?:data-src|data-lazy-src|data-original|data-url|src)=["']([^"'\s>]+)["'][^>]*>/gi;
        let match;
        const seenUrls = new Set<string>();

        while ((match = imgTagRegex.exec(html)) !== null) {
          let src = match[1].trim();
          if (src.startsWith('//')) src = `https:${src}`;
          else if (src.startsWith('/')) {
            const urlObj = new URL(targetUrl);
            src = `${urlObj.origin}${src}`;
          }

          // Filter out tracking pixels, icons, ads, logos
          const lower = src.toLowerCase();
          const isJunk = 
            lower.includes('avatar') || 
            lower.includes('logo') || 
            lower.includes('icon') || 
            lower.includes('banner') || 
            lower.includes('advert') || 
            lower.includes('widget') ||
            lower.includes('emoji') ||
            lower.includes('tracker') ||
            lower.endsWith('.svg') ||
            lower.endsWith('.gif');

          if (src.startsWith('http') && !isJunk && !seenUrls.has(src)) {
            seenUrls.add(src);
            images.push(src);
          }
        }

        // Also check for JSON image arrays in scripts
        const scriptJsonMatches = [...html.matchAll(/(\[[\s\S]*?https?:\/\/[^"'\s\]]+\.(?:webp|jpg|jpeg|png)[\s\S]*?\])/gi)];
        for (const sjm of scriptJsonMatches) {
          try {
            const parsed = JSON.parse(sjm[1]);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                const s = typeof item === 'string' ? item : (item?.src || item?.url || '');
                if (typeof s === 'string' && s.startsWith('http') && !seenUrls.has(s)) {
                  seenUrls.add(s);
                  images.push(s);
                }
              }
            }
          } catch {
            // Not valid JSON array, continue
          }
        }
      }
    } catch (scrapeErr) {
      console.warn('Generic chapter scraper warning:', scrapeErr);
    }

    return NextResponse.json({
      success: true,
      chapterName: chapterName || 'Capítulo',
      mediaType: mediaType || 'image',
      videoUrl,
      videoEmbedUrl,
      author,
      images
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Download API Error:', error);
    return NextResponse.json({ error: 'Failed to process chapter download', details: errorMessage }, { status: 500 });
  }
}
