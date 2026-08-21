export type VideoContainerFormat = 'mp4' | 'webm' | 'mkv';
export type AudioContainerFormat = 'mp3';

export interface VideoExportOptions {
  videoUrl?: string;
  embedUrl?: string;
  title?: string;
  format?: VideoContainerFormat | AudioContainerFormat;
  onProgress?: (percent: number, status: string) => void;
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
 * Export video stream or direct media to MP4, WebM, or MKV container
 */
export async function exportVideo(options: VideoExportOptions): Promise<boolean> {
  const {
    videoUrl,
    embedUrl,
    title = 'Liquid_Video',
    format = 'mp4',
    onProgress
  } = options;

  const targetUrl = videoUrl || embedUrl;
  if (!targetUrl) {
    throw new Error('No video source URL available to export');
  }

  const sanitizedTitle = title.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 60) || 'Video_Export';
  const filename = `${sanitizedTitle}.${format}`;

  if (onProgress) onProgress(15, 'Iniciando descarga de video...');

  // 1. Try server-side proxy stream to avoid CORS and get direct attachment
  if (videoUrl && (videoUrl.startsWith('http://') || videoUrl.startsWith('https://'))) {
    try {
      if (onProgress) onProgress(45, 'Descargando flujo de video HD...');
      const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(filename)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        if (onProgress) onProgress(80, 'Empaquetando archivo contenedor...');
        const blob = await res.blob();
        const mimeType = format === 'webm' ? 'video/webm' : format === 'mkv' ? 'video/x-matroska' : 'video/mp4';
        const typedBlob = new Blob([blob], { type: mimeType });
        if (onProgress) onProgress(100, 'Descarga completada');
        triggerDownload(typedBlob, filename);
        return true;
      }
    } catch (proxyErr) {
      console.warn('Proxy video download failed, trying direct:', proxyErr);
    }
  }

  // 2. Direct client fetch fallback
  if (videoUrl && (videoUrl.includes('.mp4') || videoUrl.includes('.webm') || videoUrl.startsWith('blob:'))) {
    try {
      const res = await fetch(videoUrl);
      if (res.ok) {
        if (onProgress) onProgress(85, 'Empaquetando flujo de video...');
        const blob = await res.blob();
        const mimeType = format === 'webm' ? 'video/webm' : format === 'mkv' ? 'video/x-matroska' : 'video/mp4';
        const typedBlob = new Blob([blob], { type: mimeType });
        if (onProgress) onProgress(100, 'Descarga completada');
        triggerDownload(typedBlob, filename);
        return true;
      }
    } catch {
      // Fallback to direct anchor
    }
  }

  // 3. Direct anchor download trigger
  if (onProgress) onProgress(90, 'Preparando guardado...');
  const a = document.createElement('a');
  a.href = targetUrl;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  if (onProgress) onProgress(100, 'Completado');
  return true;
}

/**
 * Export audio track / audio stream to MP3 container
 */
export async function exportAudioMp3(options: VideoExportOptions): Promise<boolean> {
  const {
    videoUrl,
    embedUrl,
    title = 'Liquid_Audio',
    onProgress
  } = options;

  const targetUrl = videoUrl || embedUrl;
  if (!targetUrl) {
    throw new Error('No audio source available to export');
  }

  const sanitizedTitle = title.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 60) || 'Audio_Export';
  const filename = `${sanitizedTitle}.mp3`;

  if (onProgress) onProgress(25, 'Extrayendo pista de audio...');

  // 1. Try server-side proxy
  if (videoUrl && (videoUrl.startsWith('http://') || videoUrl.startsWith('https://'))) {
    try {
      const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(filename)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        if (onProgress) onProgress(75, 'Codificando en formato MP3...');
        const blob = await res.blob();
        const audioBlob = new Blob([blob], { type: 'audio/mpeg' });
        if (onProgress) onProgress(100, 'Descarga de MP3 lista');
        triggerDownload(audioBlob, filename);
        return true;
      }
    } catch (proxyErr) {
      console.warn('Proxy audio download fallback:', proxyErr);
    }
  }

  // 2. Direct fetch fallback
  try {
    const res = await fetch(targetUrl);
    if (res.ok) {
      if (onProgress) onProgress(80, 'Codificando en formato MP3...');
      const blob = await res.blob();
      const audioBlob = new Blob([blob], { type: 'audio/mpeg' });
      if (onProgress) onProgress(100, 'Descarga de MP3 lista');
      triggerDownload(audioBlob, filename);
      return true;
    }
  } catch {
    // Fallback to direct anchor download with MP3 hint
  }

  const a = document.createElement('a');
  a.href = targetUrl;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  if (onProgress) onProgress(100, 'Completado');
  return true;
}
