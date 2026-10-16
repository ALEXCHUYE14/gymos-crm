'use client';

export type CellValue = string | number | null | undefined;

/** Exporta filas a .xlsx (carga diferida de la librería para no inflar el bundle inicial). */
export async function exportToExcel(rows: Record<string, CellValue>[], fileName: string, sheetName = 'Datos') {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.json_to_sheet(rows);
  const firstRow = rows[0];
  if (firstRow) {
    sheet['!cols'] = Object.keys(firstRow).map((key) => ({
      wch: Math.min(40, Math.max(key.length, ...rows.map((r) => String(r[key] ?? '').length)) + 2),
    }));
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(book, `${fileName}.xlsx`);
}

export interface PdfReportOptions {
  title: string;
  subtitle?: string;
  businessName: string;
  head: string[];
  body: CellValue[][];
  summary?: Array<[string, string]>;
  fileName: string;
}

export async function exportToPdf(opts: PdfReportOptions) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();

  doc.setFillColor(30, 32, 34);
  doc.rect(0, 0, width, 72, 'F');
  doc.setTextColor(240, 240, 236);
  doc.setFontSize(16);
  doc.text(opts.businessName, 40, 34);
  doc.setFontSize(10);
  doc.text(opts.title, 40, 52);
  doc.text(new Date().toLocaleString('es-PE'), width - 40, 52, { align: 'right' });

  let y = 96;
  doc.setTextColor(40, 40, 40);
  if (opts.subtitle) {
    doc.setFontSize(10);
    doc.text(opts.subtitle, 40, y);
    y += 18;
  }

  if (opts.summary?.length) {
    autoTable(doc, {
      startY: y,
      body: opts.summary.map(([k, v]) => [k, v]),
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 180 } },
      margin: { left: 40, right: 40 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }

  autoTable(doc, {
    startY: y,
    head: [opts.head],
    body: opts.body.map((row) => row.map((c) => (c === null || c === undefined ? '' : String(c)))),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [92, 104, 64], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 245, 241] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`${opts.fileName}.pdf`);
}
