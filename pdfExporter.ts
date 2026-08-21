import { PDFDocument } from 'pdf-lib';
import jsPDF from 'jspdf';
import { Tracker } from '@/types';

// Convert image url to ArrayBuffer (through local proxy if needed)
async function fetchImageBuffer(url: string): Promise<{ buffer: ArrayBuffer; format: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image ${url} (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || '';
  
  let format = 'JPEG';
  if (contentType.includes('png') || url.includes('.png')) {
    format = 'PNG';
  } else if (contentType.includes('webp') || url.includes('.webp')) {
    format = 'WEBP';
  }
  
  return { buffer, format };
}

// Convert image URL to Base64 and get image dimensions via canvas or Image element
async function getImageData(url: string): Promise<{ base64: string; width: number; height: number; format: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 800;
        canvas.height = img.naturalHeight || 1200;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const base64 = canvas.toDataURL('image/jpeg', 0.92);
          resolve({
            base64,
            width: canvas.width,
            height: canvas.height,
            format: 'JPEG'
          });
          return;
        }
      } catch (canvasErr) {
        console.warn('Canvas conversion failed, fallbacking directly', canvasErr);
      }

      resolve({
        base64: url,
        width: img.naturalWidth || 800,
        height: img.naturalHeight || 1200,
        format: 'JPEG'
      });
    };

    img.onerror = () => {
      resolve({
        base64: url,
        width: 800,
        height: 1200,
        format: 'JPEG'
      });
    };

    img.src = url;
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ ]/g, '_').trim().replace(/\s+/g, '_');
}

/**
 * Mode 1: PDF Generation using pdf-lib (Vector binary stream embedding)
 * Converts webp images to JPG/PNG via canvas so pdf-lib embeds natively without error.
 */
export async function exportWithPdfLib(tracker: Tracker, customImages?: string[], customTitle?: string): Promise<void> {
  const imagesToExport = customImages && customImages.length > 0 ? customImages : tracker.images;
  if (!imagesToExport || imagesToExport.length === 0) {
    throw new Error('No images to export');
  }

  const pdfDoc = await PDFDocument.create();

  for (const imgUrl of imagesToExport) {
    try {
      const { base64 } = await getImageData(imgUrl);
      const base64Data = base64.split(',')[1];
      if (!base64Data) continue;

      const binaryStr = atob(base64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      let image;
      try {
        image = await pdfDoc.embedJpg(bytes.buffer);
      } catch {
        try {
          image = await pdfDoc.embedPng(bytes.buffer);
        } catch {
          continue;
        }
      }

      if (image) {
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
      }
    } catch (e) {
      console.error('pdf-lib failed for image:', imgUrl, e);
    }
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  
  const baseName = customTitle || tracker.title || `comic-${tracker.id.substring(0, 6)}`;
  a.download = `${sanitizeFilename(baseName)}.pdf`;
  a.click();
  URL.revokeObjectURL(downloadUrl);
}

/**
 * Mode 2: PDF Generation using img2pdf (Direct Image-to-PDF packaging)
 */
export async function exportWithImg2Pdf(tracker: Tracker, customImages?: string[], customTitle?: string): Promise<void> {
  const imagesToExport = customImages && customImages.length > 0 ? customImages : tracker.images;
  if (!imagesToExport || imagesToExport.length === 0) {
    throw new Error('No images to export');
  }

  let doc: jsPDF | null = null;

  for (let i = 0; i < imagesToExport.length; i++) {
    const imgUrl = imagesToExport[i];
    try {
      const { base64, width, height, format } = await getImageData(imgUrl);
      const orientation = width > height ? 'landscape' : 'portrait';

      if (!doc) {
        doc = new jsPDF({
          orientation,
          unit: 'px',
          format: [width, height],
          hotfixes: ['px_scaling'],
        });
      } else {
        doc.addPage([width, height], orientation);
      }

      doc.addImage(base64, format, 0, 0, width, height, undefined, 'FAST');
    } catch (err) {
      console.error('img2pdf failed for image index ' + i, imgUrl, err);
    }
  }

  if (doc) {
    const baseName = customTitle || tracker.title || `comic-${tracker.id.substring(0, 6)}`;
    doc.save(`${sanitizeFilename(baseName)}_img2pdf.pdf`);
  }
}
