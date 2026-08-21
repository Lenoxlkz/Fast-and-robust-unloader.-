import JSZip from 'jszip';

export interface ImageExportOptions {
  images: string[];
  title?: string;
  format?: 'original' | 'webp' | 'png' | 'jpg';
  archiveType?: 'zip' | 'cbz';
  quality?: number;
  onProgress?: (percent: number, current: number, total: number) => void;
}

// Convert image buffer / blob to target format (WebP, PNG, JPG) using browser canvas
async function convertImageFormat(blob: Blob, targetFormat: 'webp' | 'png' | 'jpg', quality = 0.92): Promise<Blob> {
  if (typeof window === 'undefined') return blob;
  
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve(blob);
        return;
      }
      
      // If JPG, fill white background for transparent PNGs
      if (targetFormat === 'jpg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      ctx.drawImage(img, 0, 0);
      
      const mimeType = targetFormat === 'webp' ? 'image/webp' : targetFormat === 'png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob((convertedBlob) => {
        resolve(convertedBlob || blob);
      }, mimeType, quality);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    
    img.src = url;
  });
}

// Fetch single image through proxy
async function fetchImageBlob(imgUrl: string): Promise<{ blob: Blob; ext: string } | null> {
  const fetchUrl = imgUrl.startsWith('/api/proxy-image')
    ? imgUrl
    : (imgUrl.startsWith('http://') || imgUrl.startsWith('https://'))
      ? `/api/proxy-image?url=${encodeURIComponent(imgUrl)}`
      : imgUrl;

  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      // Direct fallback if original was full URL
      if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
        const direct = await fetch(imgUrl);
        if (direct.ok) {
          const b = await direct.blob();
          const ext = inferExtension(b.type, imgUrl);
          return { blob: b, ext };
        }
      }
      return null;
    }
    const blob = await res.blob();
    const ext = inferExtension(blob.type, imgUrl);
    return { blob, ext };
  } catch {
    return null;
  }
}

function inferExtension(mimeType: string, url: string): string {
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('avif')) return 'avif';
  
  const match = url.match(/\.(webp|png|jpe?g|gif|avif)/i);
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Package images into a high-speed ZIP or CBZ bundle with optional format conversion (WebP, JPG, PNG)
 */
export async function exportImagesPackage(options: ImageExportOptions): Promise<boolean> {
  const {
    images,
    title = 'Liquid_Images',
    format = 'original',
    archiveType = 'zip',
    quality = 0.92,
    onProgress
  } = options;

  if (!images || images.length === 0) {
    throw new Error('No images to export');
  }

  const zip = new JSZip();
  const total = images.length;
  let completed = 0;

  // Process in batches of 4 for maximum browser throughput without network saturation
  const batchSize = 4;
  for (let i = 0; i < images.length; i += batchSize) {
    const chunk = images.slice(i, i + batchSize);
    
    await Promise.all(
      chunk.map(async (imgUrl, chunkIndex) => {
        const globalIndex = i + chunkIndex;
        const result = await fetchImageBlob(imgUrl);
        
        if (result) {
          let finalBlob = result.blob;
          let finalExt = result.ext;
          
          if (format !== 'original') {
            finalBlob = await convertImageFormat(result.blob, format, quality);
            finalExt = format;
          }
          
          const padLength = Math.max(3, String(total).length);
          const filename = `image_${String(globalIndex + 1).padStart(padLength, '0')}.${finalExt}`;
          
          const arrayBuffer = await finalBlob.arrayBuffer();
          zip.file(filename, arrayBuffer);
        }
        
        completed++;
        if (onProgress) {
          const percent = Math.round((completed / total) * 100);
          onProgress(percent, completed, total);
        }
      })
    );
  }

  // Generate metadata info file in zip
  zip.file('info.json', JSON.stringify({
    title,
    totalImages: completed,
    exportedAt: new Date().toISOString(),
    generator: 'Liquid Fast Download - Image Engine'
  }, null, 2));

  // Generate archive blob
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const sanitizedTitle = title.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 60) || 'Images_Package';
  const fileExt = archiveType === 'cbz' ? 'cbz' : 'zip';
  const finalFilename = `${sanitizedTitle}.${fileExt}`;

  triggerDownload(zipBlob, finalFilename);
  return true;
}
