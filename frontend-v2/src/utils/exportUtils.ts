/**
 * exportUtils.ts
 * Shared export helpers for CSV, PNG, SVG, and PDF downloads.
 */

// ── CSV ───────────────────────────────────────────────────────────────────────

export function exportToCSV(
  data: Record<string, unknown>[],
  filename: string,
): void {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const esc = (v: unknown) =>
    `"${String(v ?? '').replace(/"/g, '""')}"`;
  const content = [
    headers.join(','),
    ...data.map(row => headers.map(h => esc(row[h])).join(',')),
  ].join('\n');
  triggerDownload(
    new Blob([content], { type: 'text/csv;charset=utf-8;' }),
    filename,
  );
}

// ── PNG ───────────────────────────────────────────────────────────────────────

export async function exportToPNG(
  element: HTMLElement,
  filename: string,
  options: { background?: string; scale?: number } = {},
): Promise<void> {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(element, {
    backgroundColor: options.background ?? '#141820',
    scale: options.scale ?? 2,
    useCORS: true,
    logging: false,
  });
  canvas.toBlob(blob => {
    if (blob) triggerDownload(blob, filename);
  }, 'image/png');
}

// ── SVG ───────────────────────────────────────────────────────────────────────

export function exportToSVG(svgElement: SVGElement, filename: string): void {
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgElement);
  triggerDownload(
    new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }),
    filename,
  );
}

// ── PDF ───────────────────────────────────────────────────────────────────────

export interface PdfRackOptions {
  /** Site + rack title shown in the header */
  title: string;
  /** Date string (ISO or formatted) shown in header */
  date?: string;
  /** The element to capture as the main rack illustration */
  rackElement: HTMLElement;
  /** Rows for the device legend table: [name, type, uPos, ip] */
  legend?: { name: string; type: string; uPos: string; ip: string }[];
  orientation?: 'portrait' | 'landscape';
}

export async function exportRackToPDF(opts: PdfRackOptions): Promise<void> {
  const { default: html2canvas } = await import('html2canvas');
  const { jsPDF } = await import('jspdf');

  const {
    title,
    date = new Date().toLocaleDateString(),
    rackElement,
    legend = [],
    orientation = 'portrait',
  } = opts;

  const pdf = new jsPDF({
    orientation,
    unit: 'pt',
    format: 'a4',
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 36;

  // ── Header ──────────────────────────────────────────────────────────────────
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text(title, margin, margin + 12);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(120, 120, 120);
  pdf.text(date, pageW - margin, margin + 12, { align: 'right' });
  pdf.setTextColor(0, 0, 0);

  // Divider under header
  const headerBottom = margin + 24;
  pdf.setDrawColor(220, 220, 220);
  pdf.line(margin, headerBottom, pageW - margin, headerBottom);

  // ── Rack illustration ────────────────────────────────────────────────────────
  const canvas = await html2canvas(rackElement, {
    backgroundColor: '#141820',
    scale: 2,
    useCORS: true,
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const imgNatW = canvas.width / 2; // logical px
  const imgNatH = canvas.height / 2;

  const maxImgW = pageW - margin * 2;
  const maxImgH = pageH * 0.55;
  const scale = Math.min(maxImgW / imgNatW, maxImgH / imgNatH, 1);
  const drawW = imgNatW * scale;
  const drawH = imgNatH * scale;
  const imgX = margin + (maxImgW - drawW) / 2;
  const imgY = headerBottom + 16;

  pdf.addImage(imgData, 'PNG', imgX, imgY, drawW, drawH);

  // ── Device legend table ──────────────────────────────────────────────────────
  if (legend.length > 0) {
    const tableTop = imgY + drawH + 24;

    // Table heading
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(80, 80, 80);
    pdf.text('DEVICE LEGEND', margin, tableTop);

    pdf.setTextColor(0, 0, 0);

    const colW = [180, 90, 50, 110]; // name, type, U, IP
    const rowH = 16;
    const headers = ['Device', 'Type', 'U', 'IP'];
    const tableX = margin;
    let y = tableTop + 12;

    // Header row
    pdf.setFillColor(240, 240, 240);
    pdf.rect(tableX, y, colW.reduce((a, b) => a + b, 0), rowH, 'F');
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    let x = tableX;
    for (let i = 0; i < headers.length; i++) {
      pdf.text(headers[i], x + 4, y + 11);
      x += colW[i];
    }
    y += rowH;

    // Data rows
    pdf.setFont('helvetica', 'normal');
    for (let r = 0; r < legend.length; r++) {
      if (y + rowH > pageH - margin) {
        pdf.addPage();
        y = margin;
      }
      if (r % 2 === 1) {
        pdf.setFillColor(250, 250, 250);
        pdf.rect(tableX, y, colW.reduce((a, b) => a + b, 0), rowH, 'F');
      }
      const row = legend[r];
      const cells = [row.name, row.type, row.uPos, row.ip];
      x = tableX;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i] ?? '';
        const maxW = colW[i] - 8;
        const clipped =
          pdf.getStringUnitWidth(cell) * 8 > maxW
            ? cell.slice(0, Math.floor(maxW / 4)) + '…'
            : cell;
        pdf.text(clipped, x + 4, y + 11);
        x += colW[i];
      }
      y += rowH;
    }

    // Bottom border
    pdf.setDrawColor(220, 220, 220);
    pdf.line(
      tableX,
      y,
      tableX + colW.reduce((a, b) => a + b, 0),
      y,
    );
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  pdf.setFontSize(7);
  pdf.setTextColor(160, 160, 160);
  pdf.text('Generated by WerkStack', margin, pageH - 18);
  pdf.text(
    `Page 1 of ${pdf.getNumberOfPages()}`,
    pageW - margin,
    pageH - 18,
    { align: 'right' },
  );

  const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  pdf.save(`${safeName}.pdf`);
}

// ── Internal helper ───────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
