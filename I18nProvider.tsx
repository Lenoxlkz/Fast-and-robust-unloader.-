'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'es';

const translations = {
  en: {
    appTitle: 'Liquid Fast Download',
    tagline: 'Advanced search and data extraction engine.',
    enterUrl: 'Enter URL to track...',
    modeSingle: 'Single Chapter',
    modeSequential: 'Sequential Chapters',
    modeContinuous: 'Continuous Tracking',
    startTracking: 'Start Tracking',
    trackingStatus: 'Status',
    tracking: 'Tracking',
    running: 'Downloading',
    completed: 'Completed',
    failed: 'Failed',
    error: 'Error',
    paused: 'Paused',
    idle: 'Idle',
    stopped: 'Stopped',
    imagesFound: 'Images Found',
    images: 'Images',
    exportPdf: 'Export PDF',
    exportPdfPdfLib: 'PDF (pdf-lib)',
    exportPdfImg2Pdf: 'PDF (img2pdf)',
    pdfLibDescription: 'Direct binary vector embed',
    img2PdfDescription: 'Direct 1:1 image-to-PDF packaging',
    previewView: 'Preview',
    fullView: 'Full View',
    generatingPdf: 'Generating PDF...',
    generatingPdfLib: 'Exporting (pdf-lib)...',
    generatingImg2Pdf: 'Exporting (img2pdf)...',
    emptyState: 'No active tracking tasks. Use the New Task button above to start extracting and downloading chapters.',
    noActiveTasks: 'No active tracking tasks',
    loading: 'Loading...',
    progress: 'Progress',
    speed: 'Speed',
    date: 'Date',
    controls: 'Controls',
    newTask: 'New Task',
    createNewTask: 'Create New Task',
    mangaUrl: 'Target URL',
    trackingMode: 'Tracking Mode',
    trackAllSimultaneously: 'Track all chapters simultaneously',
    trackAllOneAfterAnother: 'Track all chapters one after another',
    trackOnlyOneSpecified: 'Track only one specified chapter',
    cancel: 'Cancel',
    addTask: 'Add Task',
    restart: 'Restart',
    pause: 'Pause',
    resume: 'Resume',
    stop: 'Stop',
    delete: 'Delete',
    pageNumber: 'Page',
    selectPdfEngine: 'Choose export engine',
    calculating: 'Calculating...',
    chapters: 'Chapters',
    discoveringChapters: 'Discovering chapters...',
    chapter: 'Chapter',
    downloadingBatch: 'Downloading in parallel...',
    exportAllPdf: 'Export All (PDF)',
    exportChapter: 'Export PDF',
    pages: 'pages',
    collapse: 'Collapse',
    expand: 'Expand',
    expandAll: 'Expand All',
    collapseAll: 'Collapse All',
    pending: 'Pending',
    downloading: 'Downloading...',
    customDownload: 'Custom Selection & Download',
    firstN: 'First',
    lastN: 'Last',
    atOnce: 'at once',
    downloadSelected: 'Download Selected',
    exportSelectedPdfLib: 'Export Selected (pdf-lib)',
    exportSelectedImg2Pdf: 'Export Selected (img2pdf)',
    exportIndividualPdfs: 'Export Each Chapter as 1 File',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    invertSelection: 'Invert',
    selectedCount: 'selected',
    quickPresets: 'Quick Presets',
    enterQuantity: 'Qty',
    apply: 'Select',
    checkboxMode: 'Checkbox Selection Mode',
    allCollapsedNotice: 'Chapters are collapsed by default for smooth visual performance',
    manageSelectionAndDownload: 'Custom Selection & Batch Download',
    closeSelectionPanel: 'Close Manager',
    openSelectionPanel: 'Custom Batches & Selection',
    batchDownloadDescription: 'Select chapters with checkboxes or quick presets to download and export in batch or individually.',
    searchCategory: 'Category',
    categoryManga: 'Manga',
    categoryVideo: 'Video',
    categoryImage: 'Image',
    categoryNsfw: 'Image',
    categoryMangaDesc: 'Comics, manhwas, webtoons (single, sequential, parallel) with PDF Export',
    categoryVideoDesc: 'YouTube, TikTok, Shorts, clips, playlists with MP4, MKV, WebM & MP3 Export',
    categoryImageDesc: 'TikTok photos, X / Twitter, Instagram & galleries with ZIP, CBZ, WebP Export',
    categoryNsfwDesc: 'TikTok photos, X / Twitter, Instagram & galleries with ZIP, CBZ, WebP Export',
    paste: 'Paste',
    clear: 'Clear',
    videoSingle: 'Single Video / Short',
    videoSequential: 'Sequential / Playlist',
    videoParallel: 'Batch Extraction',
    imageSingle: 'Single Image / Post',
    imageSequential: 'Sequential Thread / Gallery',
    imageParallel: 'Batch Image Extraction',
    nsfwVideoSingle: 'Single Image / Post',
    nsfwVideoSequential: 'Sequential Thread / Gallery',
    nsfwVideoParallel: 'Batch Image Extraction',
    videoPlayer: 'Video Player',
    authorBy: 'by',
    
    // Image Category Export
    exportImageZip: 'ZIP Package',
    exportImageCbz: 'CBZ Comic',
    exportImageWebp: 'WebP Batch',
    exportImageJpg: 'JPG Batch',
    exportImagePng: 'PNG Batch',
    exportSelectedZip: 'Export Selected (ZIP)',
    exportSelectedWebp: 'Export Selected (WebP)',
    packagingImages: 'Packaging images...',
    packagingZip: 'Compressing to ZIP...',
    packagingWebp: 'Converting to WebP...',

    // Video Category Export
    exportVideoMp4: 'Video (MP4)',
    exportVideoWebm: 'Video (WebM)',
    exportVideoMkv: 'Video (MKV)',
    exportAudioMp3: 'Audio (MP3)',
    exportSelectedVideo: 'Download Video (MP4)',
    exportSelectedAudio: 'Extract Audio (MP3)',
    exportingVideo: 'Exporting Video...',
    exportingAudio: 'Extracting MP3...'
  },
  es: {
    appTitle: 'Liquid Fast Download',
    tagline: 'Motor avanzado de búsqueda y extracción de datos.',
    enterUrl: 'Introduce la URL a rastrear...',
    modeSingle: 'Capítulo Único',
    modeSequential: 'Capítulos Secuenciales',
    modeContinuous: 'Descarga Continua',
    startTracking: 'Iniciar Rastreo',
    trackingStatus: 'Estado',
    tracking: 'Rastreando',
    running: 'Descargando',
    completed: 'Completado',
    failed: 'Fallido',
    error: 'Error',
    paused: 'Pausado',
    idle: 'Inactivo',
    stopped: 'Detenido',
    imagesFound: 'Imágenes / Miniaturas',
    images: 'Imágenes',
    exportPdf: 'Exportar PDF',
    exportPdfPdfLib: 'PDF (pdf-lib)',
    exportPdfImg2Pdf: 'PDF (img2pdf)',
    pdfLibDescription: 'Incrustación de flujo binario vectorial',
    img2PdfDescription: 'Empaquetado 1:1 directo imagen-a-PDF',
    previewView: 'Vista Previa',
    fullView: 'Vista Completa',
    generatingPdf: 'Generando PDF...',
    generatingPdfLib: 'Exportando (pdf-lib)...',
    generatingImg2Pdf: 'Exportando (img2pdf)...',
    emptyState: 'No hay rastreadores activos. Usa el botón superior de "Nueva Tarea" para comenzar a extraer.',
    noActiveTasks: 'No hay tareas activas de rastreo',
    loading: 'Cargando...',
    progress: 'Progreso',
    speed: 'Velocidad',
    date: 'Fecha',
    controls: 'Controles',
    newTask: 'Nueva Tarea',
    createNewTask: 'Crear Nueva Tarea',
    mangaUrl: 'URL Objetivo',
    trackingMode: 'Modo de Rastreo',
    trackAllSimultaneously: 'Rastrear todos los capítulos simultáneamente',
    trackAllOneAfterAnother: 'Rastrear todos los capítulos uno tras otro',
    trackOnlyOneSpecified: 'Rastrear solo un capítulo específico',
    cancel: 'Cancelar',
    addTask: 'Añadir Tarea',
    restart: 'Reiniciar',
    pause: 'Pausar',
    resume: 'Reanudar',
    stop: 'Detener',
    delete: 'Eliminar',
    pageNumber: 'Página / Frame',
    selectPdfEngine: 'Elegir motor de exportación',
    calculating: 'Calculando...',
    chapters: 'Capítulos / Videos',
    discoveringChapters: 'Descubriendo capítulos...',
    chapter: 'Capítulo',
    downloadingBatch: 'Descargando en paralelo...',
    exportAllPdf: 'Exportar Todo (PDF)',
    exportChapter: 'Exportar PDF',
    pages: 'elementos',
    collapse: 'Plegar',
    expand: 'Desplegar',
    expandAll: 'Expandir Todos',
    collapseAll: 'Plegar Todos',
    pending: 'Pendiente',
    downloading: 'Descargando...',
    customDownload: 'Descarga y Selección Personalizada',
    firstN: 'Primeros',
    lastN: 'Últimos',
    atOnce: 'a la vez',
    downloadSelected: 'Descargar seleccionados',
    exportSelectedPdfLib: 'Exportar Seleccionados (pdf-lib)',
    exportSelectedImg2Pdf: 'Exportar Seleccionados (img2pdf)',
    exportIndividualPdfs: 'Exportar cada cap. en 1 archivo individual',
    selectAll: 'Seleccionar Todos',
    deselectAll: 'Deselect. Todos',
    invertSelection: 'Invertir',
    selectedCount: 'seleccionados',
    quickPresets: 'Cantidades rápidas',
    enterQuantity: 'Cant.',
    apply: 'Seleccionar',
    checkboxMode: 'Modo Selección con Casillas (Check)',
    allCollapsedNotice: 'Todos los capítulos inician plegados para una carga suave',
    manageSelectionAndDownload: 'Administrar Selección y Descargas',
    closeSelectionPanel: 'Cerrar Gestor',
    openSelectionPanel: 'Selección y Lotes Personalizados',
    batchDownloadDescription: 'Selecciona capítulos con casillas o cantidades rápidas para descargar y exportar en lote o individualmente.',
    searchCategory: 'Categoría',
    categoryManga: 'Manga',
    categoryVideo: 'Video',
    categoryImage: 'Imagen',
    categoryNsfw: 'Imagen',
    categoryMangaDesc: 'Cómics, manhwas, webtoons (único, secuencial, simultáneo) con exportación a PDF',
    categoryVideoDesc: 'YouTube, TikTok, Shorts, clips, playlists con exportación a MP4, MKV, WebM y MP3',
    categoryImageDesc: 'Fotos de TikTok, X / Twitter, Instagram y galerías con exportación a ZIP, CBZ y WebP',
    categoryNsfwDesc: 'Fotos de TikTok, X / Twitter, Instagram y galerías con exportación a ZIP, CBZ y WebP',
    paste: 'Pegar',
    clear: 'Borrar',
    videoSingle: 'Video / Short Único',
    videoSequential: 'Playlist / Secuencial',
    videoParallel: 'Extracción Simultánea / Lote',
    imageSingle: 'Imagen / Publicación Única',
    imageSequential: 'Hilo Secuencial / Galería',
    imageParallel: 'Extracción de Imágenes en Lote',
    nsfwVideoSingle: 'Imagen / Publicación Única',
    nsfwVideoSequential: 'Hilo Secuencial / Galería',
    nsfwVideoParallel: 'Extracción de Imágenes en Lote',
    videoPlayer: 'Reproductor de Video',
    authorBy: 'por',

    // Exportación Categoría Imagen
    exportImageZip: 'Paquete ZIP',
    exportImageCbz: 'Cómic CBZ',
    exportImageWebp: 'Lote WebP',
    exportImageJpg: 'Lote JPG',
    exportImagePng: 'Lote PNG',
    exportSelectedZip: 'Exportar Seleccionados (ZIP)',
    exportSelectedWebp: 'Exportar Seleccionados (WebP)',
    packagingImages: 'Empaquetando imágenes...',
    packagingZip: 'Comprimiendo a ZIP...',
    packagingWebp: 'Convirtiendo a WebP...',

    // Exportación Categoría Video
    exportVideoMp4: 'Video (MP4)',
    exportVideoWebm: 'Video (WebM)',
    exportVideoMkv: 'Video (MKV)',
    exportAudioMp3: 'Audio (MP3)',
    exportSelectedVideo: 'Descargar Video (MP4)',
    exportSelectedAudio: 'Extraer Audio (MP3)',
    exportingVideo: 'Exportando Video...',
    exportingAudio: 'Extrayendo Audio MP3...'
  }
} as const;

export type TranslationKey = keyof typeof translations['en'];

type I18nContextType = {
  t: (key: TranslationKey) => string;
  language: Language;
  setLanguage: (lang: Language) => void;
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

function detectBrowserLanguage(): Language {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'en';
  }

  // Check all available language lists
  const candidateLanguages: string[] = [];
  if (navigator.languages && navigator.languages.length > 0) {
    candidateLanguages.push(...navigator.languages);
  }
  if (navigator.language) {
    candidateLanguages.push(navigator.language);
  }
  const userLang = (navigator as unknown as { userLanguage?: string; browserLanguage?: string }).userLanguage;
  if (userLang) {
    candidateLanguages.push(userLang);
  }
  const browserLang = (navigator as unknown as { browserLanguage?: string }).browserLanguage;
  if (browserLang) {
    candidateLanguages.push(browserLang);
  }

  for (const lang of candidateLanguages) {
    if (typeof lang === 'string') {
      const lower = lang.toLowerCase();
      if (lower.startsWith('es') || lower.includes('spanish') || lower.includes('es-')) {
        return 'es';
      }
    }
  }

  return 'en';
}

const emptySubscribe = () => () => {};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false);

  const [language, setLanguage] = useState<Language>(() => detectBrowserLanguage());

  // Listen for real-time system/browser language changes
  useEffect(() => {
    setIsClient(true);
    const handleLanguageChange = () => {
      const detected = detectBrowserLanguage();
      setLanguage(detected);
    };

    window.addEventListener('languagechange', handleLanguageChange);
    return () => window.removeEventListener('languagechange', handleLanguageChange);
  }, []);

  const t = (key: TranslationKey): string => {
    const langObj = translations[language] as Record<TranslationKey, string>;
    const defaultObj = translations.en as Record<TranslationKey, string>;
    return langObj?.[key] || defaultObj[key] || String(key);
  };

  if (!isClient) {
    return (
      <div className="min-h-screen bg-neutral-900 text-neutral-100 flex items-center justify-center font-mono opacity-50">
        Loading...
      </div>
    );
  }

  return (
    <I18nContext.Provider value={{ t, language, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
