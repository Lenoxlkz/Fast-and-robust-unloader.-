"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  Trash2, 
  Plus, 
  ArrowDownToLine, 
  Zap, 
  List, 
  RotateCw, 
  LayoutGrid, 
  Maximize2, 
  FileText,
  Layers,
  Sparkles,
  BookOpen,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Check,
  DownloadCloud,
  Download,
  SlidersHorizontal,
  FolderDown,
  X,
  Clipboard,
  Flame,
  Video,
  Film,
  Music,
  Archive,
  ExternalLink,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Tracker, TrackingMode, ChapterInfo, SearchCategory } from '@/lib/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import Image from 'next/image';
import { useI18n } from '@/components/I18nProvider';
import { TerminalTitle } from '@/components/TerminalTitle';
import { exportWithPdfLib, exportWithImg2Pdf } from '@/lib/exporters/pdfExporter';
import { exportImagesPackage } from '@/lib/exporters/imageExporter';
import { exportVideo, exportAudioMp3 } from '@/lib/exporters/videoExporter';

interface TaskControl {
  isPaused: boolean;
  isStopped: boolean;
  resumeResolver?: () => void;
}

export default function Dashboard() {
  const { t, language } = useI18n();
  const [trackers, setTrackers] = useState<Tracker[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('liquid_trackers');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showNewModal, setShowNewModal] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState<SearchCategory>('manga');
  const [newMode, setNewMode] = useState<TrackingMode>('single');
  const inputRef = useRef<HTMLInputElement>(null);
  const [expandedViews, setExpandedViews] = useState<Record<string, 'preview' | 'full'>>({});
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});
  const [openCustomPanels, setOpenCustomPanels] = useState<Record<string, boolean>>({});
  const [selectedChapters, setSelectedChapters] = useState<Record<string, Record<string | number, boolean>>>({});
  const [customQty, setCustomQty] = useState<Record<string, string>>({});
  const [customDir, setCustomDir] = useState<Record<string, 'first' | 'last'>>({});
  const [isBatchDownloading, setIsBatchDownloading] = useState<Record<string, boolean>>({});
  const [generatingPdf, setGeneratingPdf] = useState<{ id: string; chapterId?: string | number; engine: 'pdflib' | 'img2pdf' } | null>(null);
  const [generatingExport, setGeneratingExport] = useState<{ id: string; chapterId?: string | number; type: string } | null>(null);

  // Active tracking controllers for pausing / stopping / resuming
  const controlsRef = useRef<Record<string, TaskControl>>({});

  const cleanInputUrl = (input: string) => {
    let cleaned = input.trim();
    // Strip any leading https://, http://, //, https:/, http:/
    cleaned = cleaned.replace(/^(?:https?:\/\/|\/\/|https?:\/|https?:)+/i, '');
    return cleaned;
  };

  const autoDetectCategory = (url: string) => {
    const lower = url.toLowerCase();
    if (
      lower.includes('instagram.com/reel') ||
      lower.includes('instagr.am/reel') ||
      lower.includes('/reel/') ||
      lower.includes('/reels/') ||
      lower.includes('/tv/') ||
      lower.includes('youtube.com') || 
      lower.includes('youtu.be') || 
      (lower.includes('tiktok.com') && !lower.includes('/photo/')) || 
      lower.includes('vm.tiktok.com') || 
      lower.includes('vt.tiktok.com') ||
      lower.includes('vimeo.com') ||
      lower.includes('twitch.tv') ||
      lower.includes('fb.watch') ||
      (lower.includes('facebook.com') && (lower.includes('/video') || lower.includes('/reel') || lower.includes('/share/r/') || lower.includes('/share/v/')))
    ) {
      setNewCategory('video');
    } else if (
      lower.includes('x.com') || 
      lower.includes('twitter.com') || 
      lower.includes('t.co') ||
      lower.includes('instagram.com') || 
      lower.includes('instagr.am') ||
      lower.includes('facebook.com') ||
      lower.includes('fb.com') ||
      lower.includes('pinterest') || 
      lower.includes('imgur') ||
      lower.includes('/photo/')
    ) {
      setNewCategory('image');
    } else if (
      lower.includes('olympus') || 
      lower.includes('manhwaweb') || 
      lower.includes('capibara') || 
      lower.includes('imperio') || 
      lower.includes('leercapitulo') || 
      lower.includes('mangalect') ||
      lower.includes('manga') ||
      lower.includes('manhua')
    ) {
      setNewCategory('manga');
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = cleanInputUrl(e.target.value);
    setNewUrl(sanitized);
    autoDetectCategory(sanitized);
  };

  const handlePasteUrl = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const sanitized = cleanInputUrl(text);
          setNewUrl(sanitized);
          autoDetectCategory(sanitized);
          inputRef.current?.focus();
        }
      }
    } catch (err) {
      console.warn('Clipboard read error:', err);
    }
  };

  const handleClearUrl = () => {
    setNewUrl('');
    inputRef.current?.focus();
  };

  const openNewTaskModal = () => {
    setNewUrl('');
    setShowNewModal(true);
  };

  const toggleCustomPanel = (trackerId: string) => {
    setOpenCustomPanels(prev => ({
      ...prev,
      [trackerId]: !prev[trackerId]
    }));
  };

  const toggleView = (id: string, view: 'preview' | 'full') => {
    setExpandedViews(prev => {
      if (prev[id] === view) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: view };
    });
  };

  const toggleChapterCollapse = (trackerId: string, chapterId: string | number) => {
    const key = `${trackerId}_${chapterId}`;
    setCollapsedChapters(prev => {
      // By default chapters are collapsed (true), so if undefined or true, new value is false
      const current = prev[key] ?? true;
      return {
        ...prev,
        [key]: !current
      };
    });
  };

  const toggleCollapseAll = (tracker: Tracker, collapse: boolean) => {
    if (!tracker.chapters) return;
    setCollapsedChapters(prev => {
      const next = { ...prev };
      tracker.chapters?.forEach(ch => {
        next[`${tracker.id}_${ch.id}`] = collapse;
      });
      return next;
    });
  };

  // Checkbox & Custom Selection Logic
  const toggleChapterSelect = (trackerId: string, chapterId: string | number) => {
    setSelectedChapters(prev => {
      const trackerSel = prev[trackerId] || {};
      const currentVal = !!trackerSel[chapterId];
      return {
        ...prev,
        [trackerId]: {
          ...trackerSel,
          [chapterId]: !currentVal
        }
      };
    });
  };

  const selectFirstNChapters = (tracker: Tracker, count: number) => {
    if (!tracker.chapters) return;
    const newSel: Record<string | number, boolean> = {};
    const limit = Math.min(count, tracker.chapters.length);
    for (let i = 0; i < tracker.chapters.length; i++) {
      const chId = tracker.chapters[i].id;
      newSel[chId] = i < limit;
    }
    setSelectedChapters(prev => ({
      ...prev,
      [tracker.id]: newSel
    }));
  };

  const selectLastNChapters = (tracker: Tracker, count: number) => {
    if (!tracker.chapters) return;
    const newSel: Record<string | number, boolean> = {};
    const total = tracker.chapters.length;
    const startIdx = Math.max(0, total - count);
    for (let i = 0; i < total; i++) {
      const chId = tracker.chapters[i].id;
      newSel[chId] = i >= startIdx;
    }
    setSelectedChapters(prev => ({
      ...prev,
      [tracker.id]: newSel
    }));
  };

  const selectAllInTracker = (tracker: Tracker) => {
    if (!tracker.chapters) return;
    const newSel: Record<string | number, boolean> = {};
    tracker.chapters.forEach(ch => {
      newSel[ch.id] = true;
    });
    setSelectedChapters(prev => ({
      ...prev,
      [tracker.id]: newSel
    }));
  };

  const deselectAllInTracker = (tracker: Tracker) => {
    setSelectedChapters(prev => ({
      ...prev,
      [tracker.id]: {}
    }));
  };

  const invertSelectionInTracker = (tracker: Tracker) => {
    if (!tracker.chapters) return;
    setSelectedChapters(prev => {
      const currentSel = prev[tracker.id] || {};
      const newSel: Record<string | number, boolean> = {};
      tracker.chapters?.forEach(ch => {
        newSel[ch.id] = !currentSel[ch.id];
      });
      return {
        ...prev,
        [tracker.id]: newSel
      };
    });
  };

  // Download specific selected chapters (batch / custom)
  const handleDownloadSelectedChapters = async (tracker: Tracker) => {
    const trackerSel = selectedChapters[tracker.id] || {};
    const selectedChapterList = (tracker.chapters || []).filter(ch => trackerSel[ch.id]);
    if (selectedChapterList.length === 0) return;

    setIsBatchDownloading(prev => ({ ...prev, [tracker.id]: true }));
    const CONCURRENCY = 5;
    let curIdx = 0;
    const updatedChapters = [...(tracker.chapters || [])];

    const worker = async () => {
      while (curIdx < selectedChapterList.length) {
        const targetCh = selectedChapterList[curIdx++];
        if (!targetCh) break;

        const chIdx = updatedChapters.findIndex(c => c.id === targetCh.id);
        if (chIdx === -1) continue;

        updatedChapters[chIdx] = { ...updatedChapters[chIdx], status: 'downloading' };
        setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, chapters: [...updatedChapters] } : item));

        try {
          const res = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: targetCh.url, mode: 'single' })
          });
          if (res.ok) {
            const data = await res.json();
            const imgs = data.images || [];
            updatedChapters[chIdx] = {
              ...updatedChapters[chIdx],
              status: imgs.length > 0 ? 'completed' : 'error',
              images: imgs,
              imageCount: imgs.length
            };
          }
        } catch (e) {
          console.error("Error downloading chapter:", e);
          updatedChapters[chIdx] = { ...updatedChapters[chIdx], status: 'error' };
        }

        setTrackers(prev => prev.map(item => item.id === tracker.id ? { ...item, chapters: [...updatedChapters] } : item));
      }
    };

    const workers = [];
    for (let w = 0; w < Math.min(CONCURRENCY, selectedChapterList.length); w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    // Re-aggregate ordered images
    const finalImgs: string[] = [];
    updatedChapters.forEach(c => {
      if (c.images) finalImgs.push(...c.images);
    });

    setTrackers(prev => prev.map(item => item.id === tracker.id ? {
      ...item,
      chapters: updatedChapters,
      images: finalImgs,
      imageCount: finalImgs.length,
      status: updatedChapters.every(c => c.status === 'completed') ? 'completed' : item.status
    } : item));

    setIsBatchDownloading(prev => ({ ...prev, [tracker.id]: false }));
  };

  // Export all selected chapters into 1 combined PDF
  const handleExportSelectedCombined = async (tracker: Tracker, engine: 'pdflib' | 'img2pdf') => {
    const trackerSel = selectedChapters[tracker.id] || {};
    const selectedChapterList = (tracker.chapters || []).filter(ch => trackerSel[ch.id]);
    const combinedImages: string[] = [];
    selectedChapterList.forEach(ch => {
      if (ch.images && ch.images.length > 0) {
        combinedImages.push(...ch.images);
      }
    });

    if (combinedImages.length === 0) return;
    const title = `${tracker.title || 'manga'}_${selectedChapterList.length}_capitulos`;
    await handleExportPdf(tracker, engine, combinedImages, title);
  };

  // Export each selected chapter as an individual separate PDF file
  const handleExportSelectedIndividual = async (tracker: Tracker, engine: 'pdflib' | 'img2pdf') => {
    const trackerSel = selectedChapters[tracker.id] || {};
    const selectedChapterList = (tracker.chapters || []).filter(ch => trackerSel[ch.id] && ch.images && ch.images.length > 0);
    if (selectedChapterList.length === 0) return;

    for (const ch of selectedChapterList) {
      if (ch.images && ch.images.length > 0) {
        const title = `${tracker.title || 'manga'}_${ch.name}`;
        await handleExportPdf(tracker, engine, ch.images, title, ch.id);
        // Small delay between automatic downloads so browser processes each file cleanly
        await new Promise(r => setTimeout(r, 400));
      }
    }
  };

  // Persist to local storage
  useEffect(() => {
    try {
      localStorage.setItem('liquid_trackers', JSON.stringify(trackers));
    } catch (e) {
      console.error("Failed to save trackers", e);
    }
  }, [trackers]);

  const handleExportPdf = async (
    tracker: Tracker, 
    engine: 'pdflib' | 'img2pdf', 
    customImages?: string[], 
    customTitle?: string,
    chapterId?: string | number
  ) => {
    const imagesToExport = customImages && customImages.length > 0 ? customImages : tracker.images;
    if (!imagesToExport || imagesToExport.length === 0) return;
    setGeneratingPdf({ id: tracker.id, chapterId, engine });

    try {
      if (engine === 'pdflib') {
        await exportWithPdfLib(tracker, imagesToExport, customTitle);
      } else {
        await exportWithImg2Pdf(tracker, imagesToExport, customTitle);
      }
    } catch (err) {
      console.error(`Export failed with engine ${engine}:`, err);
    } finally {
      setGeneratingPdf(null);
    }
  };

  // Dedicated Exporter for Image Category (ZIP / CBZ / WebP / JPG / PNG)
  const handleExportImagePackage = async (
    tracker: Tracker,
    format: 'original' | 'webp' | 'png' | 'jpg' = 'original',
    archiveType: 'zip' | 'cbz' = 'zip',
    customImages?: string[],
    customTitle?: string,
    chapterId?: string | number
  ) => {
    const imagesToExport = customImages && customImages.length > 0 ? customImages : tracker.images;
    if (!imagesToExport || imagesToExport.length === 0) return;
    const typeKey = `${archiveType}_${format}`;
    setGeneratingExport({ id: tracker.id, chapterId, type: typeKey });

    try {
      const defaultTitle = tracker.title || 'Liquid_Images';
      const title = customTitle || defaultTitle;
      await exportImagesPackage({
        images: imagesToExport,
        title,
        format,
        archiveType
      });
    } catch (err) {
      console.error('Image export failed:', err);
    } finally {
      setGeneratingExport(null);
    }
  };

  // Dedicated Exporters for Video Category (MP4 / WebM / MKV & Audio MP3)
  const handleExportVideoMedia = async (
    tracker: Tracker,
    format: 'mp4' | 'webm' | 'mkv' = 'mp4',
    chapterId?: string | number,
    customUrl?: string,
    customTitle?: string
  ) => {
    const videoSource = customUrl || tracker.videoUrl || tracker.url;
    setGeneratingExport({ id: tracker.id, chapterId, type: format });

    try {
      const title = customTitle || tracker.title || 'Video_Export';
      await exportVideo({
        videoUrl: videoSource,
        embedUrl: tracker.videoEmbedUrl,
        title,
        format
      });
    } catch (err) {
      console.error('Video export failed:', err);
    } finally {
      setGeneratingExport(null);
    }
  };

  const handleExportAudioMedia = async (
    tracker: Tracker,
    chapterId?: string | number,
    customUrl?: string,
    customTitle?: string
  ) => {
    const audioSource = customUrl || tracker.videoUrl || tracker.url;
    setGeneratingExport({ id: tracker.id, chapterId, type: 'mp3' });

    try {
      const title = customTitle || tracker.title || 'Audio_Export';
      await exportAudioMp3({
        videoUrl: audioSource,
        embedUrl: tracker.videoEmbedUrl,
        title
      });
    } catch (err) {
      console.error('Audio export failed:', err);
    } finally {
      setGeneratingExport(null);
    }
  };

  // Helper to wait while paused
  const checkPauseOrStop = async (trackerId: string): Promise<boolean> => {
    const ctrl = controlsRef.current[trackerId];
    if (!ctrl) return false; // stop if deleted
    if (ctrl.isStopped) return false;

    if (ctrl.isPaused) {
      await new Promise<void>((resolve) => {
        ctrl.resumeResolver = resolve;
      });
      if (ctrl.isStopped) return false;
    }
    return true;
  };

  // Core execution routine for a Tracker
  const executeTracker = useCallback(async (trackerId: string, url: string, mode: TrackingMode) => {
    controlsRef.current[trackerId] = { isPaused: false, isStopped: false };

    // Update status to running
    setTrackers(prev => prev.map(item => {
      if (item.id === trackerId) {
        return {
          ...item,
          status: 'running',
          progress: 5,
          downloadSpeed: t('calculating'),
          currentChapter: mode === 'single' ? undefined : t('discoveringChapters')
        };
      }
      return item;
    }));

    const startTime = Date.now();
    let totalBytesEstimated = 0;

    // 1. Single Chapter Mode
    if (mode === 'single') {
      try {
        const res = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, mode: 'single' })
        });

        if (!res.ok) throw new Error('Download failed');
        const data = await res.json();
        const images: string[] = data.images || [];

        const elapsedSec = Math.max((Date.now() - startTime) / 1000, 0.5);
        totalBytesEstimated = images.length * 180 * 1024; // ~180KB per webp
        const speedMb = ((totalBytesEstimated / (1024 * 1024)) / elapsedSec).toFixed(1);

        const singleChapterName = data.chapterName || (t('chapter') + ' 1');
        const singleChapter: ChapterInfo = {
          id: 1,
          name: singleChapterName,
          url,
          images,
          imageCount: images.length,
          status: 'completed',
          mediaType: data.mediaType,
          videoUrl: data.videoUrl,
          videoEmbedUrl: data.videoEmbedUrl,
          author: data.author,
          authorUrl: data.authorUrl
        };

        setTrackers(prev => prev.map(item => {
          if (item.id === trackerId) {
            const updatedTitle = data.seriesTitle 
              ? (data.chapterName ? `${data.seriesTitle} - ${data.chapterName}` : data.seriesTitle)
              : item.title;
            const updatedCategory = data.category || (data.mediaType === 'video' ? 'video' : data.mediaType === 'image' && item.category === 'video' ? 'image' : item.category);
            return {
              ...item,
              title: updatedTitle,
              category: updatedCategory,
              status: 'completed',
              progress: 100,
              imageCount: images.length,
              images,
              chapters: [singleChapter],
              downloadSpeed: `${speedMb} MB/s`,
              totalChapters: 1,
              completedChapters: 1,
              mediaType: data.mediaType,
              videoUrl: data.videoUrl,
              videoEmbedUrl: data.videoEmbedUrl,
              author: data.author,
              authorUrl: data.authorUrl
            };
          }
          return item;
        }));
      } catch (err) {
        console.error('Single chapter scraping failed:', err);
        setTrackers(prev => prev.map(item => item.id === trackerId ? { ...item, status: 'error', downloadSpeed: '0 MB/s' } : item));
      }
      return;
    }

    // 2. Sequential & Continuous: First discover all chapters
    let chapters: ChapterInfo[] = [];
    let seriesTitle = '';
    let discoveredCategory: SearchCategory | undefined;
    let discoveredMediaType: 'image' | 'video' | undefined;
    let discoveredVideoUrl: string | undefined;
    let discoveredAuthor: string | undefined;

    try {
      const chapterRes = await fetch('/api/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (chapterRes.ok) {
        const chData = await chapterRes.json();
        chapters = chData.chapters || [];
        seriesTitle = chData.seriesTitle || '';
        discoveredCategory = chData.category;
        discoveredMediaType = chData.mediaType;
        discoveredVideoUrl = chData.videoUrl;
        discoveredAuthor = chData.author;
      }
    } catch (chErr) {
      console.warn('Chapters discovery failed, will fallback to single URL:', chErr);
    }

    if (!chapters || chapters.length === 0) {
      chapters = [{ id: 1, name: 'Capítulo 1', url }];
    }

    const initialChapters: ChapterInfo[] = chapters.map((c, idx) => ({
      id: c.id || (idx + 1),
      name: c.name || `${t('chapter')} ${idx + 1}`,
      url: c.url,
      status: (c.images && c.images.length > 0) || c.videoUrl ? 'completed' : 'pending',
      images: c.images || [],
      imageCount: c.images?.length || 0,
      mediaType: c.mediaType || discoveredMediaType,
      videoUrl: c.videoUrl || discoveredVideoUrl,
      author: c.author || discoveredAuthor
    }));

    const currentChaptersState: ChapterInfo[] = [...initialChapters];

    setTrackers(prev => prev.map(item => {
      if (item.id === trackerId) {
        return {
          ...item,
          title: seriesTitle || item.title,
          category: discoveredCategory || item.category,
          mediaType: discoveredMediaType || item.mediaType,
          videoUrl: discoveredVideoUrl || item.videoUrl,
          author: discoveredAuthor || item.author,
          totalChapters: chapters.length,
          completedChapters: 0,
          progress: 8,
          chapters: [...currentChaptersState],
          currentChapter: `0 / ${chapters.length} ${t('chapters')}`
        };
      }
      return item;
    }));

    // 2A. SEQUENTIAL MODE (Track one chapter after another in order)
    if (mode === 'sequential') {
      const allImages: string[] = [];
      let completedCount = 0;

      for (let i = 0; i < chapters.length; i++) {
        const canContinue = await checkPauseOrStop(trackerId);
        if (!canContinue) return;

        const chapter = currentChaptersState[i];
        currentChaptersState[i] = {
          ...currentChaptersState[i],
          status: 'downloading'
        };

        setTrackers(prev => prev.map(item => {
          if (item.id === trackerId) {
            return {
              ...item,
              currentChapter: `${chapter.name} (${i + 1}/${chapters.length})`,
              chapters: [...currentChaptersState]
            };
          }
          return item;
        }));

        let chImages: string[] = [];
        try {
          const res = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: chapter.url, mode: 'single' })
          });

          if (res.ok) {
            const data = await res.json();
            chImages = data.images || [];
            allImages.push(...chImages);
            completedCount++;
            totalBytesEstimated += chImages.length * 180 * 1024;
          }
        } catch (e) {
          console.warn(`Error on chapter ${chapter.name}:`, e);
        }

        currentChaptersState[i] = {
          ...currentChaptersState[i],
          status: chImages.length > 0 ? 'completed' : 'error',
          images: chImages,
          imageCount: chImages.length
        };

        const elapsedSec = Math.max((Date.now() - startTime) / 1000, 1);
        const speedMb = ((totalBytesEstimated / (1024 * 1024)) / elapsedSec).toFixed(1);
        const progressPct = Math.min(Math.round(((i + 1) / chapters.length) * 100), 99);

        setTrackers(prev => prev.map(item => {
          if (item.id === trackerId) {
            return {
              ...item,
              progress: progressPct,
              imageCount: allImages.length,
              images: [...allImages],
              chapters: [...currentChaptersState],
              completedChapters: completedCount,
              downloadSpeed: `${speedMb} MB/s`
            };
          }
          return item;
        }));
      }

      setTrackers(prev => prev.map(item => {
        if (item.id === trackerId) {
          return {
            ...item,
            status: 'completed',
            progress: 100,
            imageCount: allImages.length,
            images: allImages,
            chapters: [...currentChaptersState],
            completedChapters: completedCount,
            currentChapter: `${completedCount} / ${chapters.length} ${t('chapters')}`,
            downloadSpeed: '0 MB/s'
          };
        }
        return item;
      }));
      return;
    }

    // 2B. CONTINUOUS MODE (Simultaneous parallel streams)
    if (mode === 'continuous') {
      let completedCount = 0;
      const CONCURRENCY = 6; // 6 simultaneous workers
      let currentIndex = 0;

      const worker = async () => {
        while (currentIndex < chapters.length) {
          const idx = currentIndex++;
          if (idx >= chapters.length) break;

          const canContinue = await checkPauseOrStop(trackerId);
          if (!canContinue) break;

          const chapter = currentChaptersState[idx];
          currentChaptersState[idx] = {
            ...currentChaptersState[idx],
            status: 'downloading'
          };

          setTrackers(prev => prev.map(item => {
            if (item.id === trackerId) {
              return {
                ...item,
                chapters: [...currentChaptersState]
              };
            }
            return item;
          }));

          let chImages: string[] = [];
          try {
            const res = await fetch('/api/download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: chapter.url, mode: 'single' })
            });

            if (res.ok) {
              const data = await res.json();
              chImages = data.images || [];
              totalBytesEstimated += chImages.length * 180 * 1024;
            }
          } catch (e) {
            console.warn(`Parallel worker error on chapter ${idx}:`, e);
          }

          currentChaptersState[idx] = {
            ...currentChaptersState[idx],
            status: chImages.length > 0 ? 'completed' : 'error',
            images: chImages,
            imageCount: chImages.length
          };

          completedCount++;
          const elapsedSec = Math.max((Date.now() - startTime) / 1000, 0.8);
          const speedMb = ((totalBytesEstimated / (1024 * 1024)) / elapsedSec).toFixed(1);
          const progressPct = Math.min(Math.round((completedCount / chapters.length) * 100), 99);

          // Collect sorted images so far in exact chapter sequence
          const currentOrderedImages: string[] = [];
          for (let k = 0; k < currentChaptersState.length; k++) {
            if (currentChaptersState[k].images && currentChaptersState[k].images!.length > 0) {
              currentOrderedImages.push(...currentChaptersState[k].images!);
            }
          }

          setTrackers(prev => prev.map(item => {
            if (item.id === trackerId) {
              return {
                ...item,
                progress: progressPct,
                completedChapters: completedCount,
                imageCount: currentOrderedImages.length,
                images: currentOrderedImages,
                chapters: [...currentChaptersState],
                downloadSpeed: `${speedMb} MB/s`,
                currentChapter: `${completedCount} / ${chapters.length} ${t('chapters')}`
              };
            }
            return item;
          }));
        }
      };

      const workers = [];
      for (let w = 0; w < Math.min(CONCURRENCY, chapters.length); w++) {
        workers.push(worker());
      }

      await Promise.all(workers);

      // Final aggregation in exact chapter sequence
      const finalOrderedImages: string[] = [];
      for (let k = 0; k < currentChaptersState.length; k++) {
        if (currentChaptersState[k].images && currentChaptersState[k].images!.length > 0) {
          finalOrderedImages.push(...currentChaptersState[k].images!);
        }
      }

      setTrackers(prev => prev.map(item => {
        if (item.id === trackerId) {
          return {
            ...item,
            status: 'completed',
            progress: 100,
            imageCount: finalOrderedImages.length,
            images: finalOrderedImages,
            chapters: [...currentChaptersState],
            completedChapters: completedCount,
            currentChapter: `${completedCount} / ${chapters.length} ${t('chapters')}`,
            downloadSpeed: '0 MB/s'
          };
        }
        return item;
      }));
    }
  }, [t]);

  const addTracker = async () => {
    const cleanUrl = cleanInputUrl(newUrl);
    if (!cleanUrl) return;
    
    const fullUrl = `https://${cleanUrl}`;
    
    const newTracker: Tracker = {
      id: uuidv4(),
      url: fullUrl,
      category: newCategory,
      mode: newMode,
      status: 'running',
      progress: 5,
      downloadSpeed: t('calculating'),
      imageCount: 0,
      images: [],
      dateAdded: new Date().toISOString()
    };
    
    setTrackers(prev => [newTracker, ...prev]);
    setShowNewModal(false);
    setNewUrl('');

    // Trigger execution
    executeTracker(newTracker.id, newTracker.url, newTracker.mode);
  };

  const pauseTracker = (id: string) => {
    if (controlsRef.current[id]) {
      controlsRef.current[id].isPaused = true;
    }
    setTrackers(prev => prev.map(item => item.id === id ? { ...item, status: 'paused', downloadSpeed: '0 MB/s' } : item));
  };

  const resumeTracker = (id: string) => {
    const ctrl = controlsRef.current[id];
    if (ctrl) {
      ctrl.isPaused = false;
      if (ctrl.resumeResolver) {
        ctrl.resumeResolver();
        ctrl.resumeResolver = undefined;
      }
    } else {
      // Re-launch if was completely stopped
      const tr = trackers.find(item => item.id === id);
      if (tr) {
        executeTracker(tr.id, tr.url, tr.mode);
        return;
      }
    }
    setTrackers(prev => prev.map(item => item.id === id ? { ...item, status: 'running' } : item));
  };

  const stopTracker = (id: string) => {
    if (controlsRef.current[id]) {
      controlsRef.current[id].isStopped = true;
      if (controlsRef.current[id].resumeResolver) {
        controlsRef.current[id].resumeResolver!();
      }
    }
    setTrackers(prev => prev.map(item => item.id === id ? { ...item, status: 'stopped', downloadSpeed: '0 MB/s' } : item));
  };

  const restartTracker = (id: string) => {
    const tr = trackers.find(item => item.id === id);
    if (!tr) return;
    stopTracker(id);
    setTrackers(prev => prev.map(item => item.id === id ? { 
      ...item, 
      status: 'running', 
      progress: 5, 
      imageCount: 0, 
      images: [], 
      completedChapters: 0 
    } : item));
    setTimeout(() => {
      executeTracker(id, tr.url, tr.mode);
    }, 150);
  };

  const removeTracker = (id: string) => {
    stopTracker(id);
    delete controlsRef.current[id];
    setTrackers(current => current.filter(tItem => tItem.id !== id));
  };

  const getModeIcon = (mode: TrackingMode) => {
    switch (mode) {
      case 'single': return <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-400" />;
      case 'sequential': return <List className="w-3.5 h-3.5 text-blue-400" />;
      case 'continuous': return <Zap className="w-3.5 h-3.5 text-amber-400" />;
    }
  };
  
  const getModeLabel = (mode: TrackingMode) => {
    switch (mode) {
      case 'single': return t('modeSingle');
      case 'sequential': return t('modeSequential');
      case 'continuous': return t('modeContinuous');
    }
  };

  const getStatusLabel = (status: Tracker['status']) => {
    switch (status) {
      case 'running': return t('running');
      case 'completed': return t('completed');
      case 'error': return t('error');
      case 'paused': return t('paused');
      case 'stopped': return t('stopped');
      default: return t('idle');
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 font-sans text-neutral-100 selection:bg-emerald-500/30 selection:text-white">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Centered Header with Single-Line Title & Centered Action Button */}
        <header className="flex flex-col items-center justify-center text-center space-y-4 pb-4 border-b border-white/5">
          <div className="w-full flex justify-center">
            <TerminalTitle />
          </div>

          <p className="text-xs sm:text-sm text-neutral-400 max-w-xl mx-auto px-4 -mt-1 leading-relaxed">
            {t('tagline')}
          </p>
          
          <div className="pt-2">
            <button 
              id="new-task-button"
              onClick={openNewTaskModal}
              className="liquid-glass liquid-button flex items-center gap-2.5 px-6 py-2.5 rounded-full text-white hover:text-emerald-200 transition-all shadow-xl hover:shadow-emerald-500/20 border border-emerald-500/30 cursor-pointer font-medium text-sm"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>{t('newTask')}</span>
            </button>
          </div>
        </header>

        {/* Tracker List */}
        <div className="space-y-5">
          <AnimatePresence mode="popLayout">
            {trackers.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="liquid-glass rounded-3xl p-10 sm:p-14 text-center border-white/5 shadow-2xl"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
                  <ArrowDownToLine className="w-8 h-8" />
                </div>
                <h3 className="text-lg sm:text-xl font-medium text-white/90 mb-2">
                  {t('noActiveTasks')}
                </h3>
                <p className="text-xs sm:text-sm text-neutral-400 max-w-md mx-auto leading-relaxed">
                  {t('emptyState')}
                </p>
              </motion.div>
            ) : (
              trackers.map((tracker) => (
                <motion.div
                  key={tracker.id}
                  id={`tracker-${tracker.id}`}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96, height: 0 }}
                  className="liquid-glass rounded-2xl flex flex-col relative overflow-hidden group shadow-xl border border-white/10"
                >
                  <div className="p-4 sm:p-6 flex flex-col gap-6 relative z-10">
                    {/* Dynamic progress bar underneath */}
                    <div 
                      className={cn(
                        "absolute inset-y-0 left-0 transition-all duration-500 ease-out z-0 pointer-events-none opacity-20",
                        tracker.status === 'completed' ? "bg-emerald-500" :
                        tracker.status === 'error' ? "bg-red-500" :
                        tracker.status === 'paused' ? "bg-amber-500" :
                        "bg-emerald-400"
                      )}
                      style={{ width: `${tracker.progress}%` }}
                    />
                    
                    <div className="relative z-10 flex-1 flex flex-col justify-between">
                      {/* Top Bar: Mode, Title, URL and Status Badge */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap text-xs font-semibold tracking-wider uppercase text-neutral-400">
                            {tracker.category && (
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wider uppercase border inline-flex items-center gap-1",
                                tracker.category === 'video' ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm shadow-indigo-500/20" :
                                (tracker.category === 'image' || tracker.category === 'nsfw') ? "bg-pink-500/15 text-pink-300 border-pink-500/30" :
                                "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              )}>
                                {tracker.category === 'video' ? <Video className="w-3 h-3" /> :
                                 (tracker.category === 'image' || tracker.category === 'nsfw') ? <ImageIcon className="w-3 h-3" /> :
                                 <BookOpen className="w-3 h-3" />}
                                {tracker.category === 'video' ? t('categoryVideo') :
                                 (tracker.category === 'image' || tracker.category === 'nsfw') ? t('categoryImage') :
                                 t('categoryManga')}
                              </span>
                            )}
                            <span className="flex items-center gap-1.5">
                              {getModeIcon(tracker.mode)}
                              <span>{getModeLabel(tracker.mode)}</span>
                            </span>
                            {tracker.totalChapters && tracker.totalChapters > 1 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 text-neutral-300 font-mono text-[10px]">
                                {tracker.category === 'video' ? <Film className="w-3 h-3 text-emerald-400" /> : <BookOpen className="w-3 h-3 text-emerald-400" />}
                                {tracker.completedChapters || 0} / {tracker.totalChapters}
                              </span>
                            )}
                          </div>
                          
                          {tracker.title && (
                            <div className="text-sm font-semibold text-emerald-400 truncate">
                              {tracker.title}
                            </div>
                          )}

                          {tracker.author && (
                            <div className="flex items-center gap-1.5 text-xs text-neutral-300">
                              <span className="text-neutral-500">{t('authorBy')}</span>
                              {tracker.authorUrl ? (
                                <a 
                                  href={tracker.authorUrl} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="text-emerald-400 hover:underline inline-flex items-center gap-1 font-medium"
                                >
                                  <span>{tracker.author}</span>
                                  <ExternalLink className="w-3 h-3 opacity-70" />
                                </a>
                              ) : (
                                <span className="text-emerald-400 font-medium">{tracker.author}</span>
                              )}
                            </div>
                          )}

                          <h3 
                            className="text-sm sm:text-base font-medium text-white/90 truncate max-w-full font-mono" 
                            title={tracker.url}
                          >
                            {tracker.url}
                          </h3>

                          {tracker.currentChapter && (
                            <div className="text-xs text-neutral-400 font-mono">
                              {tracker.currentChapter}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-xs font-semibold tracking-wide border backdrop-blur-md",
                            tracker.status === 'running' ? "bg-blue-500/20 text-blue-300 border-blue-500/30 animate-pulse" :
                            tracker.status === 'completed' ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]" :
                            tracker.status === 'error' ? "bg-red-500/20 text-red-300 border-red-500/30" :
                            tracker.status === 'paused' ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
                            "bg-white/10 text-neutral-300 border-white/10"
                          )}>
                            {getStatusLabel(tracker.status)}
                          </span>
                        </div>
                      </div>

                      {/* Stats & Interactive Controls Grid */}
                      <div className="mt-6 flex flex-wrap items-end gap-6 justify-between border-t border-white/5 pt-4">
                        <div className="flex flex-wrap items-center gap-6 sm:gap-8">
                          <div className="space-y-0.5">
                            <div className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">{t('progress')}</div>
                            <div className="text-xl sm:text-2xl font-light text-white font-mono">{Math.round(tracker.progress)}%</div>
                          </div>
                          <div className="space-y-0.5">
                            <div className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">{t('imagesFound')}</div>
                            <div className="text-xl sm:text-2xl font-light text-white font-mono">{tracker.imageCount}</div>
                          </div>
                          <div className="space-y-0.5">
                            <div className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">{t('speed')}</div>
                            <div className="text-xl sm:text-2xl font-light text-white font-mono">{tracker.downloadSpeed}</div>
                          </div>
                          <div className="space-y-0.5 hidden sm:block">
                            <div className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">{t('date')}</div>
                            <div className="text-xs font-mono text-neutral-400 mt-1">
                              {new Date(tracker.dateAdded).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons + Category-Specific Exporters */}
                        <div className="flex flex-wrap items-center gap-3 ml-auto">
                          
                          {/* 1. MANGA CATEGORY: PDF Exporters (pdf-lib & img2pdf) ONLY */}
                          {(!tracker.category || tracker.category === 'manga') && tracker.images && tracker.images.length > 0 && (
                            <div className="relative inline-flex items-center rounded-full bg-emerald-950/50 p-1 border border-emerald-500/30 shadow-lg">
                              {/* Modo 1: pdf-lib */}
                              <button
                                id={`export-pdflib-${tracker.id}`}
                                onClick={() => handleExportPdf(tracker, 'pdflib')}
                                disabled={generatingPdf?.id === tracker.id}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                                  generatingPdf?.id === tracker.id && generatingPdf.engine === 'pdflib'
                                    ? "bg-emerald-500 text-black font-bold animate-pulse"
                                    : "text-emerald-300 hover:bg-emerald-500/20 hover:text-white"
                                )}
                                title={t('pdfLibDescription')}
                              >
                                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                                <span>
                                  {generatingPdf?.id === tracker.id && generatingPdf.engine === 'pdflib' 
                                    ? t('generatingPdfLib') 
                                    : t('exportPdfPdfLib')}
                                </span>
                              </button>

                              <div className="w-px h-4 bg-emerald-500/25 mx-0.5" />

                              {/* Modo 2: img2pdf */}
                              <button
                                id={`export-img2pdf-${tracker.id}`}
                                onClick={() => handleExportPdf(tracker, 'img2pdf')}
                                disabled={generatingPdf?.id === tracker.id}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                                  generatingPdf?.id === tracker.id && generatingPdf.engine === 'img2pdf'
                                    ? "bg-emerald-400 text-black font-bold animate-pulse"
                                    : "text-emerald-300 hover:bg-emerald-500/20 hover:text-white"
                                )}
                                title={t('img2PdfDescription')}
                              >
                                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                                <span>
                                  {generatingPdf?.id === tracker.id && generatingPdf.engine === 'img2pdf' 
                                    ? t('generatingImg2Pdf') 
                                    : t('exportPdfImg2Pdf')}
                                </span>
                              </button>
                            </div>
                          )}

                          {/* 2. IMAGE CATEGORY: Packaging Exporters (ZIP, CBZ, WebP) ONLY */}
                          {(tracker.category === 'image' || tracker.category === 'nsfw') && tracker.images && tracker.images.length > 0 && (
                            <div className="relative inline-flex items-center rounded-full bg-pink-950/40 p-1 border border-pink-500/30 shadow-lg">
                              {/* ZIP Packager */}
                              <button
                                id={`export-zip-${tracker.id}`}
                                onClick={() => handleExportImagePackage(tracker, 'original', 'zip')}
                                disabled={generatingExport?.id === tracker.id}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                                  generatingExport?.id === tracker.id && generatingExport.type === 'zip_original'
                                    ? "bg-pink-500 text-white font-bold animate-pulse"
                                    : "text-pink-300 hover:bg-pink-500/20 hover:text-white"
                                )}
                                title="Empaquetar todas las imágenes en ZIP HD original"
                              >
                                <Archive className="w-3.5 h-3.5 text-pink-400" />
                                <span>
                                  {generatingExport?.id === tracker.id && generatingExport.type === 'zip_original'
                                    ? t('packagingZip')
                                    : t('exportImageZip')}
                                </span>
                              </button>

                              <div className="w-px h-4 bg-pink-500/25 mx-0.5" />

                              {/* CBZ Comic Packager */}
                              <button
                                id={`export-cbz-${tracker.id}`}
                                onClick={() => handleExportImagePackage(tracker, 'original', 'cbz')}
                                disabled={generatingExport?.id === tracker.id}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                                  generatingExport?.id === tracker.id && generatingExport.type === 'cbz_original'
                                    ? "bg-pink-400 text-black font-bold animate-pulse"
                                    : "text-pink-300 hover:bg-pink-500/20 hover:text-white"
                                )}
                                title="Empaquetar en formato Cómic / Lector CBZ"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-pink-400" />
                                <span>{t('exportImageCbz')}</span>
                              </button>

                              <div className="w-px h-4 bg-pink-500/25 mx-0.5" />

                              {/* WebP Batch Converter */}
                              <button
                                id={`export-webp-${tracker.id}`}
                                onClick={() => handleExportImagePackage(tracker, 'webp', 'zip')}
                                disabled={generatingExport?.id === tracker.id}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                                  generatingExport?.id === tracker.id && generatingExport.type === 'zip_webp'
                                    ? "bg-purple-500 text-white font-bold animate-pulse"
                                    : "text-purple-300 hover:bg-purple-500/20 hover:text-white"
                                )}
                                title="Optimizar y convertir lote a WebP ultra-ligero"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                                <span>
                                  {generatingExport?.id === tracker.id && generatingExport.type === 'zip_webp'
                                    ? t('packagingWebp')
                                    : t('exportImageWebp')}
                                </span>
                              </button>
                            </div>
                          )}

                          {/* 3. VIDEO CATEGORY: Video & Audio Exporters (MP4, WebM, MP3) ONLY */}
                          {tracker.category === 'video' && (
                            <div className="relative inline-flex items-center rounded-full bg-indigo-950/40 p-1 border border-indigo-500/30 shadow-lg">
                              {/* MP4 Video */}
                              <button
                                id={`export-mp4-${tracker.id}`}
                                onClick={() => handleExportVideoMedia(tracker, 'mp4')}
                                disabled={generatingExport?.id === tracker.id}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                                  generatingExport?.id === tracker.id && generatingExport.type === 'mp4'
                                    ? "bg-indigo-500 text-white font-bold animate-pulse"
                                    : "text-indigo-300 hover:bg-indigo-500/20 hover:text-white"
                                )}
                                title="Descargar contenedor de Video en MP4"
                              >
                                <Film className="w-3.5 h-3.5 text-indigo-400" />
                                <span>{t('exportVideoMp4')}</span>
                              </button>

                              <div className="w-px h-4 bg-indigo-500/25 mx-0.5" />

                              {/* WebM Video */}
                              <button
                                id={`export-webm-${tracker.id}`}
                                onClick={() => handleExportVideoMedia(tracker, 'webm')}
                                disabled={generatingExport?.id === tracker.id}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                                  generatingExport?.id === tracker.id && generatingExport.type === 'webm'
                                    ? "bg-indigo-400 text-black font-bold animate-pulse"
                                    : "text-indigo-300 hover:bg-indigo-500/20 hover:text-white"
                                )}
                                title="Descargar contenedor WebM"
                              >
                                <Video className="w-3.5 h-3.5 text-indigo-400" />
                                <span>{t('exportVideoWebm')}</span>
                              </button>

                              <div className="w-px h-4 bg-indigo-500/25 mx-0.5" />

                              {/* MP3 Audio Extract */}
                              <button
                                id={`export-mp3-${tracker.id}`}
                                onClick={() => handleExportAudioMedia(tracker)}
                                disabled={generatingExport?.id === tracker.id}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                                  generatingExport?.id === tracker.id && generatingExport.type === 'mp3'
                                    ? "bg-amber-500 text-black font-bold animate-pulse"
                                    : "text-amber-300 hover:bg-amber-500/20 hover:text-white"
                                )}
                                title="Extraer pista de audio en formato MP3"
                              >
                                <Music className="w-3.5 h-3.5 text-amber-400" />
                                <span>
                                  {generatingExport?.id === tracker.id && generatingExport.type === 'mp3'
                                    ? t('exportingAudio')
                                    : t('exportAudioMp3')}
                                </span>
                              </button>
                            </div>
                          )}

                          {/* View Toggle Buttons */}
                          {tracker.imageCount > 0 && (
                            <div className="flex bg-black/40 rounded-full p-1 border border-white/10 backdrop-blur-md">
                              <button
                                id={`preview-view-${tracker.id}`}
                                onClick={() => toggleView(tracker.id, 'preview')}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer",
                                  expandedViews[tracker.id] === 'preview' 
                                    ? "bg-white/20 text-white shadow-inner font-semibold" 
                                    : "text-neutral-400 hover:text-white hover:bg-white/10"
                                )}
                              >
                                <LayoutGrid className="w-3.5 h-3.5" />
                                {t('previewView')}
                              </button>
                              <button
                                id={`full-view-${tracker.id}`}
                                onClick={() => toggleView(tracker.id, 'full')}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer",
                                  expandedViews[tracker.id] === 'full' 
                                    ? "bg-white/20 text-white shadow-inner font-semibold" 
                                    : "text-neutral-400 hover:text-white hover:bg-white/10"
                                )}
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                                {t('fullView')}
                              </button>
                            </div>
                          )}

                          {/* Standard Controls: Play/Pause/Restart/Stop/Custom Batch/Delete */}
                          <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-full border border-white/10 backdrop-blur-md">
                            {/* Custom Download & Selection Sub-Panel Toggle Button */}
                            <button 
                              onClick={() => toggleCustomPanel(tracker.id)} 
                              className={cn(
                                "p-1.5 rounded-full transition-all cursor-pointer relative",
                                openCustomPanels[tracker.id]
                                  ? "bg-emerald-500 text-black shadow-md"
                                  : Object.values(selectedChapters[tracker.id] || {}).some(Boolean)
                                  ? "bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-500/35"
                                  : "hover:bg-white/15 text-neutral-300 hover:text-white"
                              )}
                              title={t('manageSelectionAndDownload')}
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                              {Object.values(selectedChapters[tracker.id] || {}).filter(Boolean).length > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 rounded-full bg-emerald-400 text-black text-[9px] font-bold flex items-center justify-center font-mono shadow">
                                  {Object.values(selectedChapters[tracker.id] || {}).filter(Boolean).length}
                                </span>
                              )}
                            </button>

                            {tracker.status === 'completed' && (
                              <button 
                                onClick={() => restartTracker(tracker.id)} 
                                className="p-1.5 rounded-full hover:bg-white/15 text-neutral-300 hover:text-white transition-colors cursor-pointer" 
                                title={t('restart')}
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {tracker.status !== 'running' && tracker.status !== 'completed' && (
                              <button 
                                onClick={() => resumeTracker(tracker.id)} 
                                className="p-1.5 rounded-full hover:bg-emerald-500/20 text-emerald-400 transition-colors cursor-pointer"
                                title={t('resume')}
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                              </button>
                            )}
                            {tracker.status === 'running' && (
                              <button 
                                onClick={() => pauseTracker(tracker.id)} 
                                className="p-1.5 rounded-full hover:bg-amber-500/20 text-amber-400 transition-colors cursor-pointer"
                                title={t('pause')}
                              >
                                <Pause className="w-3.5 h-3.5 fill-current" />
                              </button>
                            )}
                            {(tracker.status === 'running' || tracker.status === 'paused') && (
                              <button 
                                onClick={() => stopTracker(tracker.id)} 
                                className="p-1.5 rounded-full hover:bg-white/15 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                                title={t('stop')}
                              >
                                <Square className="w-3.5 h-3.5 fill-current" />
                              </button>
                            )}
                            <button 
                              onClick={() => removeTracker(tracker.id)} 
                              className="p-1.5 rounded-full hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
                              title={t('delete')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SUB-PANEL INTERMEDIO: ADMINISTRADOR DE DESCARGA Y SELECCIÓN PERSONALIZADA */}
                  <AnimatePresence>
                    {openCustomPanels[tracker.id] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="border-t border-emerald-500/30 bg-gradient-to-b from-emerald-950/30 via-neutral-950/90 to-black/90 backdrop-blur-xl overflow-hidden"
                      >
                        <div className="p-4 sm:p-5 space-y-4">
                          {/* Sub-Panel Header */}
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                                <SlidersHorizontal className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-semibold text-white tracking-wide">
                                    {t('customDownload')}
                                  </h4>
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    {Object.values(selectedChapters[tracker.id] || {}).filter(Boolean).length} / {tracker.chapters?.length || 1} {t('selectedCount')}
                                  </span>
                                </div>
                                <p className="text-[11px] text-neutral-400">
                                  {t('batchDownloadDescription')}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Bulk selection shortcuts */}
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => selectAllInTracker(tracker)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
                                >
                                  {t('selectAll')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deselectAllInTracker(tracker)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
                                >
                                  {t('deselectAll')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => invertSelectionInTracker(tracker)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
                                >
                                  {t('invertSelection')}
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => toggleCustomPanel(tracker.id)}
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ml-1"
                                title={t('closeSelectionPanel')}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Presets Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {/* Primeros a la vez */}
                            <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
                              <div className="text-[11px] font-medium text-neutral-400 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                                <span>{t('firstN')} {t('atOnce')}:</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {[10, 20, 30, 40, 50].map((qty) => (
                                  <button
                                    key={`first-${qty}`}
                                    type="button"
                                    onClick={() => selectFirstNChapters(tracker, qty)}
                                    className="px-2.5 py-1 rounded-lg text-xs font-mono bg-white/5 hover:bg-emerald-500/20 text-neutral-300 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/30 transition-all cursor-pointer"
                                  >
                                    {qty}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Últimos a la vez */}
                            <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
                              <div className="text-[11px] font-medium text-neutral-400 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                                <span>{t('lastN')} {t('atOnce')}:</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {[10, 20, 30, 40, 50].map((qty) => (
                                  <button
                                    key={`last-${qty}`}
                                    type="button"
                                    onClick={() => selectLastNChapters(tracker, qty)}
                                    className="px-2.5 py-1 rounded-lg text-xs font-mono bg-white/5 hover:bg-blue-500/20 text-neutral-300 hover:text-blue-300 border border-white/10 hover:border-blue-500/30 transition-all cursor-pointer"
                                  >
                                    {qty}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Cantidad Personalizada */}
                            <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
                              <div className="text-[11px] font-medium text-neutral-400 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />
                                <span>{t('enterQuantity')}:</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  max={tracker.chapters?.length || 100}
                                  value={customQty[tracker.id] ?? '15'}
                                  onChange={(e) => setCustomQty(prev => ({ ...prev, [tracker.id]: e.target.value }))}
                                  placeholder="15"
                                  className="w-16 bg-white/10 border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white font-mono text-center focus:outline-none focus:border-emerald-400"
                                />
                                <div className="flex rounded-lg overflow-hidden border border-white/10">
                                  <button
                                    type="button"
                                    onClick={() => setCustomDir(prev => ({ ...prev, [tracker.id]: 'first' }))}
                                    className={cn(
                                      "px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                                      (customDir[tracker.id] ?? 'first') === 'first'
                                        ? "bg-emerald-500/30 text-emerald-300 font-bold"
                                        : "bg-white/5 text-neutral-400 hover:text-white"
                                    )}
                                  >
                                    {t('firstN')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCustomDir(prev => ({ ...prev, [tracker.id]: 'last' }))}
                                    className={cn(
                                      "px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                                      customDir[tracker.id] === 'last'
                                        ? "bg-blue-500/30 text-blue-300 font-bold"
                                        : "bg-white/5 text-neutral-400 hover:text-white"
                                    )}
                                  >
                                    {t('lastN')}
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const qty = parseInt(customQty[tracker.id] ?? '15', 10) || 10;
                                    if ((customDir[tracker.id] ?? 'first') === 'first') {
                                      selectFirstNChapters(tracker, qty);
                                    } else {
                                      selectLastNChapters(tracker, qty);
                                    }
                                  }}
                                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 transition-all cursor-pointer ml-auto"
                                >
                                  {t('apply')}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Action Executions for Selected Chapters / Items */}
                          <div className="pt-2 flex flex-wrap items-center gap-2.5 border-t border-white/10">
                            <button
                              type="button"
                              onClick={() => handleDownloadSelectedChapters(tracker)}
                              disabled={isBatchDownloading[tracker.id] || !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)}
                              className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border shadow-lg",
                                !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)
                                  ? "bg-white/5 text-neutral-500 border-white/5 cursor-not-allowed"
                                  : isBatchDownloading[tracker.id]
                                  ? "bg-emerald-500 text-black border-emerald-400 animate-pulse"
                                  : "bg-gradient-to-r from-emerald-500 to-teal-500 text-black border-emerald-400 hover:brightness-110"
                              )}
                            >
                              <DownloadCloud className={cn("w-4 h-4", isBatchDownloading[tracker.id] && "animate-bounce")} />
                              <span>
                                {isBatchDownloading[tracker.id]
                                  ? t('downloading')
                                  : `${t('downloadSelected')} (${Object.values(selectedChapters[tracker.id] || {}).filter(Boolean).length})`}
                              </span>
                            </button>

                            {/* MANGA EXPORT OPTIONS */}
                            {(!tracker.category || tracker.category === 'manga') && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleExportSelectedCombined(tracker, 'pdflib')}
                                  disabled={generatingPdf?.id === tracker.id || !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)}
                                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <FileText className="w-4 h-4 text-emerald-400" />
                                  <span>{t('exportSelectedPdfLib')}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleExportSelectedCombined(tracker, 'img2pdf')}
                                  disabled={generatingPdf?.id === tracker.id || !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)}
                                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Layers className="w-4 h-4 text-emerald-400" />
                                  <span>{t('exportSelectedImg2Pdf')}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleExportSelectedIndividual(tracker, 'img2pdf')}
                                  disabled={generatingPdf?.id === tracker.id || !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)}
                                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed sm:ml-auto"
                                  title={t('exportIndividualPdfs')}
                                >
                                  <FolderDown className="w-4 h-4 text-emerald-400" />
                                  <span>{t('exportIndividualPdfs')}</span>
                                </button>
                              </>
                            )}

                            {/* IMAGE EXPORT OPTIONS */}
                            {(tracker.category === 'image' || tracker.category === 'nsfw') && (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const trackerSel = selectedChapters[tracker.id] || {};
                                    const selectedChapterList = (tracker.chapters || []).filter(ch => trackerSel[ch.id]);
                                    const combinedImages: string[] = [];
                                    selectedChapterList.forEach(ch => {
                                      if (ch.images) combinedImages.push(...ch.images);
                                    });
                                    if (combinedImages.length === 0) return;
                                    await handleExportImagePackage(tracker, 'original', 'zip', combinedImages, `${tracker.title || 'images'}_seleccion`);
                                  }}
                                  disabled={generatingExport?.id === tracker.id || !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)}
                                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-pink-950/50 hover:bg-pink-900/50 text-pink-300 border border-pink-500/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Archive className="w-4 h-4 text-pink-400" />
                                  <span>{t('exportImageZip')}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={async () => {
                                    const trackerSel = selectedChapters[tracker.id] || {};
                                    const selectedChapterList = (tracker.chapters || []).filter(ch => trackerSel[ch.id]);
                                    const combinedImages: string[] = [];
                                    selectedChapterList.forEach(ch => {
                                      if (ch.images) combinedImages.push(...ch.images);
                                    });
                                    if (combinedImages.length === 0) return;
                                    await handleExportImagePackage(tracker, 'webp', 'zip', combinedImages, `${tracker.title || 'images'}_webp_seleccion`);
                                  }}
                                  disabled={generatingExport?.id === tracker.id || !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)}
                                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-950/50 hover:bg-purple-900/50 text-purple-300 border border-purple-500/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Sparkles className="w-4 h-4 text-purple-400" />
                                  <span>{t('exportImageWebp')}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={async () => {
                                    const trackerSel = selectedChapters[tracker.id] || {};
                                    const selectedChapterList = (tracker.chapters || []).filter(ch => trackerSel[ch.id]);
                                    const combinedImages: string[] = [];
                                    selectedChapterList.forEach(ch => {
                                      if (ch.images) combinedImages.push(...ch.images);
                                    });
                                    if (combinedImages.length === 0) return;
                                    await handleExportImagePackage(tracker, 'original', 'cbz', combinedImages, `${tracker.title || 'comic'}_cbz_seleccion`);
                                  }}
                                  disabled={generatingExport?.id === tracker.id || !Object.values(selectedChapters[tracker.id] || {}).some(Boolean)}
                                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-pink-950/50 hover:bg-pink-900/50 text-pink-300 border border-pink-500/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed sm:ml-auto"
                                >
                                  <BookOpen className="w-4 h-4 text-pink-400" />
                                  <span>{t('exportImageCbz')}</span>
                                </button>
                              </>
                            )}

                            {/* VIDEO EXPORT OPTIONS */}
                            {tracker.category === 'video' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleExportVideoMedia(tracker, 'mp4')}
                                  disabled={generatingExport?.id === tracker.id}
                                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-950/50 hover:bg-indigo-900/50 text-indigo-300 border border-indigo-500/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Film className="w-4 h-4 text-indigo-400" />
                                  <span>{t('exportVideoMp4')}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleExportAudioMedia(tracker)}
                                  disabled={generatingExport?.id === tracker.id}
                                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-950/50 hover:bg-amber-900/50 text-amber-300 border border-amber-500/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed sm:ml-auto"
                                >
                                  <Music className="w-4 h-4 text-amber-400" />
                                  <span>{t('exportAudioMp3')}</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Expanded Gallery / Full-View Drawer: CHAPTER ORDERED VERTICAL SCROLL */}
                  <AnimatePresence>
                    {expandedViews[tracker.id] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="border-t border-white/10 bg-black/50 backdrop-blur-xl"
                      >
                        <div className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
                          {(() => {
                            // Ensure we have a valid chapter list
                            const displayChapters: ChapterInfo[] = (tracker.chapters && tracker.chapters.length > 0)
                              ? tracker.chapters
                              : [{
                                  id: 1,
                                  name: t('chapter') + ' 1',
                                  url: tracker.url,
                                  images: tracker.images,
                                  imageCount: tracker.images?.length || 0,
                                  status: tracker.status === 'completed' ? 'completed' : 'downloading'
                                }];

                            return (
                              <div className="space-y-6">
                                {/* Dedicated Video Player (Direct MP4 Stream or Embed) if available */}
                                {(tracker.videoUrl || tracker.videoEmbedUrl || tracker.mediaType === 'video' || tracker.category === 'video') && (
                                  <div className="p-4 rounded-2xl bg-neutral-950/90 border border-white/10 shadow-2xl space-y-3">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                      <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                                        <Film className="w-4 h-4 text-indigo-400" />
                                        <span>{t('videoPlayer')}</span>
                                        {tracker.videoUrl && (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                            HD Direct Stream
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {tracker.videoUrl && (
                                          <a
                                            href={tracker.videoUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            download
                                            className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-white transition-colors font-medium bg-indigo-500/15 hover:bg-indigo-500/25 px-2.5 py-1 rounded-lg border border-indigo-500/30"
                                          >
                                            <Download className="w-3 h-3" />
                                            <span>Stream MP4</span>
                                          </a>
                                        )}
                                        <a 
                                          href={tracker.url} 
                                          target="_blank" 
                                          rel="noreferrer" 
                                          className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors font-medium bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg border border-white/5"
                                        >
                                          <span>Abrir original</span>
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      </div>
                                    </div>
                                    <div className="w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/10 shadow-inner flex items-center justify-center">
                                      {tracker.videoUrl ? (
                                        <video
                                          src={tracker.videoUrl}
                                          controls
                                          playsInline
                                          preload="metadata"
                                          className="w-full h-full object-contain bg-black"
                                        />
                                      ) : tracker.videoEmbedUrl ? (
                                        <iframe
                                          src={tracker.videoEmbedUrl}
                                          className="w-full h-full border-0"
                                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                          allowFullScreen
                                        />
                                      ) : (
                                        <div className="text-center p-6 text-neutral-400 space-y-2">
                                          <Film className="w-8 h-8 mx-auto text-indigo-400 opacity-60" />
                                          <p className="text-xs">Video detectado. Puedes exportarlo directamente en MP4, WebM o MKV.</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Quick Jump Navigator */}
                                {displayChapters.length > 1 && (
                                  <div className="sticky top-0 z-30 pb-3 mb-2 bg-neutral-950/85 backdrop-blur-md border-b border-white/10 -mx-4 px-4 sm:-mx-6 sm:px-6 pt-1 space-y-3">
                                    {/* Chapters Quick Jump Bar */}
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar py-1 max-w-full">
                                        <div className="flex items-center gap-1.5 shrink-0 text-xs text-neutral-400 font-semibold uppercase tracking-wider mr-1">
                                          <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                                          <span>{t('chapters')}:</span>
                                        </div>
                                        {displayChapters.map((ch) => (
                                          <button
                                            key={ch.id}
                                            type="button"
                                            onClick={() => {
                                              const el = document.getElementById(`chapter-card-${tracker.id}-${ch.id}`);
                                              if (el) {
                                                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                              }
                                            }}
                                            className={cn(
                                              "px-3 py-1 rounded-full text-xs font-mono transition-all cursor-pointer shrink-0 border",
                                              ch.status === 'completed'
                                                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30"
                                                : ch.status === 'downloading'
                                                ? "bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse"
                                                : "bg-white/5 text-neutral-400 border-white/10 hover:bg-white/10 hover:text-neutral-200"
                                            )}
                                          >
                                            {ch.name} {ch.images && ch.images.length > 0 ? `(${ch.images.length})` : ''}
                                          </button>
                                        ))}
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0 ml-auto">
                                        <button
                                          type="button"
                                          onClick={() => toggleCustomPanel(tracker.id)}
                                          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all cursor-pointer"
                                        >
                                          <SlidersHorizontal className="w-3 h-3" />
                                          <span>{t('customDownload')}</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => toggleCollapseAll(tracker, true)}
                                          className="px-2.5 py-1 text-[11px] font-medium text-neutral-400 hover:text-white rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border border-white/5"
                                        >
                                          {t('collapseAll')}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => toggleCollapseAll(tracker, false)}
                                          className="px-2.5 py-1 text-[11px] font-medium text-neutral-400 hover:text-white rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border border-white/5"
                                        >
                                          {t('expandAll')}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* VERTICAL CHAPTER SCROLL */}
                                <div className="space-y-6">
                                  {displayChapters.map((chapter) => {
                                    const isCollapsed = collapsedChapters[`${tracker.id}_${chapter.id}`] ?? true;
                                    const isSelected = !!selectedChapters[tracker.id]?.[chapter.id];
                                    const chapterImages = chapter.images || [];

                                    return (
                                      <div 
                                        key={chapter.id} 
                                        id={`chapter-card-${tracker.id}-${chapter.id}`}
                                        className={cn(
                                          "rounded-2xl border transition-all shadow-xl overflow-hidden",
                                          isSelected
                                            ? "border-emerald-500/50 bg-neutral-950/80 ring-1 ring-emerald-500/20"
                                            : "border-white/10 bg-neutral-950/60"
                                        )}
                                      >
                                        {/* Chapter Header Card */}
                                        <div className="p-3.5 sm:p-4 bg-white/[0.04] border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
                                          <div className="flex items-center gap-3 min-w-0">
                                            {/* CHECKBOX SELECTION BUTTON */}
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleChapterSelect(tracker.id, chapter.id);
                                              }}
                                              className={cn(
                                                "w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer border shrink-0",
                                                isSelected
                                                  ? "bg-emerald-500 border-emerald-400 text-black shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                                                  : "bg-white/5 border-white/20 text-transparent hover:border-white/40 hover:bg-white/10"
                                              )}
                                              title={isSelected ? t('deselectAll') : t('apply')}
                                            >
                                              <Check className={cn("w-3.5 h-3.5 stroke-[3]", isSelected ? "text-black" : "text-transparent")} />
                                            </button>

                                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                                              <BookOpen className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                              <div className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
                                                <span className="truncate">{chapter.name}</span>
                                                {chapter.status === 'downloading' && (
                                                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse font-mono">
                                                    {t('downloading')}
                                                  </span>
                                                )}
                                                {chapter.status === 'completed' && (
                                                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                                                    {chapterImages.length} {t('pages')}
                                                  </span>
                                                )}
                                                {chapter.status === 'pending' && (
                                                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/10 text-neutral-400 border border-white/10 font-mono">
                                                    {t('pending')}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="text-[11px] text-neutral-400 font-mono truncate max-w-xs sm:max-w-md mt-0.5">
                                                {chapter.url}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Chapter Specific Actions: Category Specific Exporters + Accordion Toggle */}
                                          <div className="flex items-center gap-2.5 ml-auto">
                                            {/* Manga Category: PDF only */}
                                            {(!tracker.category || tracker.category === 'manga') && chapterImages.length > 0 && (
                                              <div className="inline-flex items-center rounded-full bg-emerald-950/40 p-0.5 border border-emerald-500/30">
                                                <button
                                                  type="button"
                                                  onClick={() => handleExportPdf(
                                                    tracker, 
                                                    'pdflib', 
                                                    chapterImages, 
                                                    `${tracker.title || 'manga'}_${chapter.name}`,
                                                    chapter.id
                                                  )}
                                                  disabled={generatingPdf?.id === tracker.id && generatingPdf?.chapterId === chapter.id}
                                                  className={cn(
                                                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer",
                                                    generatingPdf?.id === tracker.id && generatingPdf?.chapterId === chapter.id && generatingPdf.engine === 'pdflib'
                                                      ? "bg-emerald-500 text-black font-bold animate-pulse"
                                                      : "text-emerald-300 hover:bg-emerald-500/20 hover:text-white"
                                                  )}
                                                  title="PDF Vector Stream"
                                                >
                                                  <FileText className="w-3 h-3 text-emerald-400" />
                                                  <span>pdf-lib</span>
                                                </button>
                                                <div className="w-px h-3 bg-emerald-500/20" />
                                                <button
                                                  type="button"
                                                  onClick={() => handleExportPdf(
                                                    tracker, 
                                                    'img2pdf', 
                                                    chapterImages, 
                                                    `${tracker.title || 'manga'}_${chapter.name}`,
                                                    chapter.id
                                                  )}
                                                  disabled={generatingPdf?.id === tracker.id && generatingPdf?.chapterId === chapter.id}
                                                  className={cn(
                                                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer",
                                                    generatingPdf?.id === tracker.id && generatingPdf?.chapterId === chapter.id && generatingPdf.engine === 'img2pdf'
                                                      ? "bg-emerald-400 text-black font-bold animate-pulse"
                                                      : "text-emerald-300 hover:bg-emerald-500/20 hover:text-white"
                                                  )}
                                                  title="PDF 1:1 Image Package"
                                                >
                                                  <Layers className="w-3 h-3 text-emerald-400" />
                                                  <span>img2pdf</span>
                                                </button>
                                              </div>
                                            )}

                                            {/* Image Category: ZIP & WebP */}
                                            {(tracker.category === 'image' || tracker.category === 'nsfw') && chapterImages.length > 0 && (
                                              <div className="inline-flex items-center rounded-full bg-pink-950/40 p-0.5 border border-pink-500/30">
                                                <button
                                                  type="button"
                                                  onClick={() => handleExportImagePackage(
                                                    tracker,
                                                    'original',
                                                    'zip',
                                                    chapterImages,
                                                    `${tracker.title || 'image'}_${chapter.name}`,
                                                    chapter.id
                                                  )}
                                                  disabled={generatingExport?.id === tracker.id && generatingExport?.chapterId === chapter.id}
                                                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium text-pink-300 hover:bg-pink-500/20 hover:text-white transition-all cursor-pointer"
                                                  title="ZIP HD Original"
                                                >
                                                  <Archive className="w-3 h-3 text-pink-400" />
                                                  <span>ZIP</span>
                                                </button>
                                                <div className="w-px h-3 bg-pink-500/20" />
                                                <button
                                                  type="button"
                                                  onClick={() => handleExportImagePackage(
                                                    tracker,
                                                    'webp',
                                                    'zip',
                                                    chapterImages,
                                                    `${tracker.title || 'image'}_${chapter.name}_webp`,
                                                    chapter.id
                                                  )}
                                                  disabled={generatingExport?.id === tracker.id && generatingExport?.chapterId === chapter.id}
                                                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium text-purple-300 hover:bg-purple-500/20 hover:text-white transition-all cursor-pointer"
                                                  title="WebP Batch"
                                                >
                                                  <Sparkles className="w-3 h-3 text-purple-400" />
                                                  <span>WebP</span>
                                                </button>
                                              </div>
                                            )}

                                            {/* Video Category: MP4 & MP3 */}
                                            {tracker.category === 'video' && (
                                              <div className="inline-flex items-center rounded-full bg-indigo-950/40 p-0.5 border border-indigo-500/30">
                                                <button
                                                  type="button"
                                                  onClick={() => handleExportVideoMedia(
                                                    tracker,
                                                    'mp4',
                                                    chapter.id,
                                                    chapter.url,
                                                    `${tracker.title || 'video'}_${chapter.name}`
                                                  )}
                                                  disabled={generatingExport?.id === tracker.id && generatingExport?.chapterId === chapter.id}
                                                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium text-indigo-300 hover:bg-indigo-500/20 hover:text-white transition-all cursor-pointer"
                                                  title="Descargar Video MP4"
                                                >
                                                  <Film className="w-3 h-3 text-indigo-400" />
                                                  <span>MP4</span>
                                                </button>
                                                <div className="w-px h-3 bg-indigo-500/20" />
                                                <button
                                                  type="button"
                                                  onClick={() => handleExportAudioMedia(
                                                    tracker,
                                                    chapter.id,
                                                    chapter.url,
                                                    `${tracker.title || 'audio'}_${chapter.name}`
                                                  )}
                                                  disabled={generatingExport?.id === tracker.id && generatingExport?.chapterId === chapter.id}
                                                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium text-amber-300 hover:bg-amber-500/20 hover:text-white transition-all cursor-pointer"
                                                  title="Extraer Audio MP3"
                                                >
                                                  <Music className="w-3 h-3 text-amber-400" />
                                                  <span>MP3</span>
                                                </button>
                                              </div>
                                            )}

                                            <button
                                              type="button"
                                              onClick={() => toggleChapterCollapse(tracker.id, chapter.id)}
                                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs flex items-center justify-center cursor-pointer transition-colors border border-white/5"
                                              title={isCollapsed ? t('expand') : t('collapse')}
                                            >
                                              {isCollapsed ? (
                                                <ChevronDown className="w-4 h-4" />
                                              ) : (
                                                <ChevronUp className="w-4 h-4" />
                                              )}
                                            </button>
                                          </div>
                                        </div>

                                        {/* Chapter Content / Gallery */}
                                        {!isCollapsed && (
                                          <div className="p-4 sm:p-5">
                                            {chapter.status === 'downloading' && chapterImages.length === 0 ? (
                                              <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
                                                <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                                                <p className="text-xs text-neutral-400 font-mono">{t('downloading')}</p>
                                              </div>
                                            ) : chapter.status === 'pending' && chapterImages.length === 0 ? (
                                              <div className="py-6 text-center text-xs text-neutral-500 font-mono">
                                                {t('pending')}...
                                              </div>
                                            ) : chapterImages.length > 0 ? (
                                              expandedViews[tracker.id] === 'preview' ? (
                                                /* PREVIEW MODE: Chapter Thumbnail Grid */
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                                  {chapterImages.map((img, pageIdx) => (
                                                    <div 
                                                      key={pageIdx} 
                                                      className="relative aspect-[2/3] rounded-xl overflow-hidden bg-neutral-900 border border-white/10 group shadow-md hover:border-emerald-500/40 transition-all"
                                                    >
                                                      <Image 
                                                        src={img} 
                                                        alt={`${chapter.name} - ${t('pageNumber')} ${pageIdx + 1}`} 
                                                        fill
                                                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                                                        referrerPolicy="no-referrer"
                                                        sizes="(max-width: 768px) 50vw, 20vw"
                                                        loading="lazy"
                                                      />
                                                      <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-mono font-bold text-white/90 border border-white/10">
                                                        {pageIdx + 1}
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : (
                                                /* FULL VIEW MODE: Continuous high-res vertical webtoon scroll */
                                                <div className="flex flex-col items-center gap-4 max-w-2xl mx-auto py-2">
                                                  {chapterImages.map((img, pageIdx) => (
                                                    <div 
                                                      key={pageIdx} 
                                                      className="w-full relative rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 shadow-2xl"
                                                    >
                                                      <div className="absolute top-3 left-3 z-10 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-xs font-mono font-medium text-white/90 border border-white/15">
                                                        {chapter.name} • {t('pageNumber')} {pageIdx + 1} / {chapterImages.length}
                                                      </div>
                                                      <Image 
                                                        src={img} 
                                                        alt={`${chapter.name} - ${t('pageNumber')} ${pageIdx + 1}`} 
                                                        width={800}
                                                        height={1200}
                                                        className="w-full h-auto object-contain"
                                                        referrerPolicy="no-referrer"
                                                        loading="lazy"
                                                      />
                                                    </div>
                                                  ))}
                                                </div>
                                              )
                                            ) : (
                                              <div className="py-6 text-center text-xs text-neutral-400">
                                                0 {t('imagesFound')}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* New Task Modal */}
      <AnimatePresence>
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
              onClick={() => setShowNewModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.94, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 15 }}
              className="liquid-glass relative z-10 w-full max-w-lg rounded-3xl p-6 sm:p-8 border border-white/15 shadow-2xl"
            >
              <h2 className="text-2xl font-light mb-6 text-white tracking-tight flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <span>{t('createNewTask')}</span>
              </h2>
              
              <div className="space-y-5">
                {/* 1. Target URL with fixed https:// and dynamic Paste / Clear button */}
                <div className="space-y-2">
                  <label htmlFor="target-url-input" className="text-xs font-semibold uppercase tracking-wider text-neutral-300 ml-1">
                    {t('mangaUrl')}
                  </label>
                  
                  <div className="relative flex items-center w-full rounded-2xl bg-white/5 border border-white/15 focus-within:border-emerald-400/60 focus-within:ring-2 focus-within:ring-emerald-400/30 transition-all overflow-hidden group shadow-inner">
                    {/* Fixed https:// prefix badge */}
                    <div className="flex items-center pl-3.5 pr-2.5 py-3 text-emerald-400 font-mono text-sm font-semibold select-none shrink-0 bg-white/[0.04] border-r border-white/10">
                      <span className="opacity-70 text-neutral-400 mr-0.5">https://</span>
                    </div>

                    {/* Cleaned URL Input without duplicating https:// */}
                    <input 
                      id="target-url-input"
                      ref={inputRef}
                      type="text"
                      value={newUrl}
                      onChange={handleUrlChange}
                      placeholder={
                        newCategory === 'manga' ? "olympusxyz.com/series/... o manhwaweb.com/leer/..." :
                        newCategory === 'video' ? "youtube.com/watch?v=... o vm.tiktok.com/... o shorts/..." :
                        "x.com/.../status/... o instagram.com/p/... o vm.tiktok.com/..."
                      }
                      className="w-full bg-transparent px-3 py-3 text-white placeholder:text-neutral-500 focus:outline-none font-mono text-sm pr-24"
                      autoFocus
                    />

                    {/* Unified Button: Paste when empty, Clear X when filled */}
                    <div className="absolute right-2 flex items-center">
                      <AnimatePresence mode="wait" initial={false}>
                        {!newUrl ? (
                          <motion.button
                            key="paste-btn"
                            id="paste-url-btn"
                            type="button"
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.85 }}
                            transition={{ duration: 0.15 }}
                            onClick={handlePasteUrl}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-medium cursor-pointer transition-all shadow-sm"
                            title={t('paste')}
                          >
                            <Clipboard className="w-3.5 h-3.5" />
                            <span>{t('paste')}</span>
                          </motion.button>
                        ) : (
                          <motion.button
                            key="clear-btn"
                            id="clear-url-btn"
                            type="button"
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.85 }}
                            transition={{ duration: 0.15 }}
                            onClick={handleClearUrl}
                            className="p-1.5 rounded-xl bg-white/10 hover:bg-red-500/25 text-neutral-300 hover:text-red-300 border border-white/10 hover:border-red-500/40 text-xs transition-all cursor-pointer shadow-sm"
                            title={t('clear')}
                          >
                            <X className="w-4 h-4" />
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* 2. Sub-main Category Selector directly underneath the Target URL field: 3 CATEGORIES (Manga, Video, Imagen) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      {t('searchCategory')}
                    </label>
                    <span className="text-[11px] font-normal text-neutral-400">
                      {newCategory === 'manga' ? t('categoryMangaDesc') : 
                       newCategory === 'video' ? t('categoryVideoDesc') :
                       t('categoryImageDesc')}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md">
                    {/* Manga Option */}
                    <button
                      id="category-manga-btn"
                      type="button"
                      onClick={() => setNewCategory('manga')}
                      className={cn(
                        "flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl font-medium text-xs transition-all cursor-pointer text-center",
                        newCategory === 'manga'
                          ? "bg-emerald-500 text-black font-semibold shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400"
                          : "text-neutral-400 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('categoryManga')}</span>
                    </button>

                    {/* Video (YouTube / TikTok / Streams) */}
                    <button
                      id="category-video-btn"
                      type="button"
                      onClick={() => setNewCategory('video')}
                      className={cn(
                        "flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl font-medium text-xs transition-all cursor-pointer text-center",
                        newCategory === 'video'
                          ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/20 ring-1 ring-indigo-400"
                          : "text-neutral-400 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <Video className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('categoryVideo')}</span>
                    </button>

                    {/* Imagen Option (X, Instagram, TikTok, etc.) */}
                    <button
                      id="category-image-btn"
                      type="button"
                      onClick={() => setNewCategory('image')}
                      className={cn(
                        "flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl font-medium text-xs transition-all cursor-pointer text-center",
                        (newCategory === 'image' || newCategory === 'nsfw')
                          ? "bg-pink-600 text-white font-semibold shadow-md shadow-pink-600/20 ring-1 ring-pink-400"
                          : "text-neutral-400 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('categoryImage')}</span>
                    </button>
                  </div>
                </div>

                {/* 3. Tracking Modes Grid (Dynamic based on selected Category) */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 ml-1">
                    {t('trackingMode')}
                  </label>
                  <div className="grid gap-2.5">
                    {/* Single Mode */}
                    <button 
                      id="mode-single-btn"
                      type="button"
                      onClick={() => setNewMode('single')}
                      className={cn(
                        "flex items-center gap-3.5 p-3.5 rounded-2xl border text-left transition-all cursor-pointer",
                        newMode === 'single' 
                          ? "bg-emerald-500/15 border-emerald-400/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]" 
                          : "bg-white/5 border-white/5 hover:border-white/15 hover:bg-white/10"
                      )}
                    >
                      <div className={cn("p-2 rounded-full", newMode === 'single' ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-neutral-400")}>
                        <ArrowDownToLine className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">
                          {newCategory === 'manga' ? t('modeSingle') :
                           newCategory === 'video' ? 'Video / Short Único' :
                           t('imageSingle')}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {newCategory === 'manga' ? t('trackOnlyOneSpecified') :
                           newCategory === 'video' ? 'Extraer video, miniaturas HD y metadatos del clip' :
                           'Descargar foto, carrusel o post en máxima resolución'}
                        </div>
                      </div>
                    </button>

                    {/* Sequential Mode */}
                    <button 
                      id="mode-sequential-btn"
                      type="button"
                      onClick={() => setNewMode('sequential')}
                      className={cn(
                        "flex items-center gap-3.5 p-3.5 rounded-2xl border text-left transition-all cursor-pointer",
                        newMode === 'sequential' 
                          ? "bg-blue-500/15 border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]" 
                          : "bg-white/5 border-white/5 hover:border-white/15 hover:bg-white/10"
                      )}
                    >
                      <div className={cn("p-2 rounded-full", newMode === 'sequential' ? "bg-blue-500/20 text-blue-300" : "bg-white/5 text-neutral-400")}>
                        <List className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">
                          {newCategory === 'manga' ? t('modeSequential') :
                           newCategory === 'video' ? 'Lista de Reproducción / Canal' :
                           t('imageSequential')}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {newCategory === 'manga' ? t('trackAllOneAfterAnother') :
                           newCategory === 'video' ? 'Procesar videos de la lista de reproducción secuencialmente' :
                           'Descargar hilos de fotos o carruseles secuencialmente'}
                        </div>
                      </div>
                    </button>

                    {/* Continuous / Batch Mode */}
                    <button 
                      id="mode-continuous-btn"
                      type="button"
                      onClick={() => setNewMode('continuous')}
                      className={cn(
                        "flex items-center gap-3.5 p-3.5 rounded-2xl border text-left transition-all cursor-pointer",
                        newMode === 'continuous' 
                          ? "bg-amber-500/15 border-amber-400/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]" 
                          : "bg-white/5 border-white/5 hover:border-white/15 hover:bg-white/10"
                      )}
                    >
                      <div className={cn("p-2 rounded-full", newMode === 'continuous' ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-neutral-400")}>
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">
                          {newCategory === 'manga' ? t('modeContinuous') :
                           newCategory === 'video' ? 'Extracción Rápida / Lote Paralelo' :
                           t('imageParallel')}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {newCategory === 'manga' ? t('trackAllSimultaneously') :
                           newCategory === 'video' ? 'Extracción multi-hilo de múltiples videos y streams' :
                           'Extracción simultánea de álbumes y galerías completas'}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3 justify-end items-center">
                <button 
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-5 py-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/5 text-sm transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button 
                  id="submit-new-task-btn"
                  type="button"
                  onClick={addTracker}
                  disabled={!newUrl.trim()}
                  className="liquid-glass liquid-button px-7 py-2.5 rounded-full text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-lg hover:shadow-emerald-500/20 border border-emerald-500/30"
                >
                  {t('addTask')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
