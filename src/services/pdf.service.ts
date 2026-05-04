import PDFDocument from 'pdfkit';

export interface PdfNoteData {
  id: string;
  format: 'material' | 'hours';
  description: string;
  workDate: Date;
  material?: string;
  quantity?: number;
  unit?: string;
  hours?: number;
  workers?: Array<{ name: string; hours: number }>;
  signed: boolean;
  signedAt?: Date;
  signatureUrl?: string;
  user: { name: string; email?: string };
  company: { name: string; cif?: string };
  client: { name: string; cif?: string; email?: string };
  project: { name: string; projectCode: string };
}

const COLORS = { primary: '#1a56db', gray: '#6b7280', light: '#f3f4f6', dark: '#111827' };
const MARGIN = 50;

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string, y: number): number {
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(10).text(text, MARGIN, y);
  doc.moveTo(MARGIN, y + 14).lineTo(doc.page.width - MARGIN, y + 14)
    .strokeColor(COLORS.primary).lineWidth(0.5).stroke();
  return y + 20;
}

function labelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number): void {
  doc.fillColor(COLORS.gray).font('Helvetica').fontSize(8).text(label, x, y);
  doc.fillColor(COLORS.dark).font('Helvetica').fontSize(9).text(value || '—', x, y + 10);
}

/**
 * Generates a delivery-note PDF and returns the buffer.
 * Uses pdfkit streaming to build the document in memory.
 */
export function generateDeliveryNotePdf(note: PdfNoteData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', margin: MARGIN, compress: true });
    const chunks: Buffer[] = [];

    doc.on('data',  chunk => chunks.push(chunk as Buffer));
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', err   => reject(err));

    const W = doc.page.width - MARGIN * 2;
    let y = MARGIN;

    // ── Header ────────────────────────────────────────────────────────────────
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(20)
      .text('ALBARÁN', MARGIN, y);
    doc.fillColor(COLORS.gray).font('Helvetica').fontSize(9)
      .text(`Nº ${note.id.slice(-8).toUpperCase()}`, MARGIN, y + 22);

    doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(12)
      .text(note.company.name, doc.page.width - MARGIN - 200, y, { width: 200, align: 'right' });
    doc.fillColor(COLORS.gray).font('Helvetica').fontSize(8)
      .text(note.company.cif ?? '', doc.page.width - MARGIN - 200, y + 16, { width: 200, align: 'right' });

    y += 50;
    doc.moveTo(MARGIN, y).lineTo(doc.page.width - MARGIN, y)
      .strokeColor(COLORS.primary).lineWidth(1).stroke();
    y += 12;

    // ── Client & Project ──────────────────────────────────────────────────────
    y = sectionTitle(doc, 'CLIENTE', y);

    const col2 = MARGIN + W / 2;
    labelValue(doc, 'Nombre',  note.client.name,         MARGIN, y);
    labelValue(doc, 'CIF',     note.client.cif ?? '—',   col2,   y);
    y += 24;
    labelValue(doc, 'Email',   note.client.email ?? '—', MARGIN, y);
    y += 28;

    y = sectionTitle(doc, 'PROYECTO', y);
    labelValue(doc, 'Nombre', note.project.name,         MARGIN, y);
    labelValue(doc, 'Código', note.project.projectCode,  col2,   y);
    y += 28;

    // ── Work details ─────────────────────────────────────────────────────────
    y = sectionTitle(doc, 'DETALLES DEL TRABAJO', y);

    labelValue(doc, 'Fecha de trabajo', formatDate(note.workDate), MARGIN, y);
    labelValue(doc, 'Tipo',             note.format === 'hours' ? 'Horas' : 'Material', col2, y);
    y += 28;

    labelValue(doc, 'Descripción', note.description, MARGIN, y);
    y += 28;

    if (note.format === 'material') {
      doc.fillColor(COLORS.light).rect(MARGIN, y, W, 22).fill();
      doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(8)
        .text('Material', MARGIN + 4, y + 7)
        .text('Cantidad', MARGIN + W * 0.45, y + 7)
        .text('Unidad',   MARGIN + W * 0.7,  y + 7);
      y += 22;
      doc.fillColor(COLORS.dark).font('Helvetica').fontSize(9)
        .text(note.material ?? '—', MARGIN + 4,        y + 4)
        .text(String(note.quantity ?? '—'), MARGIN + W * 0.45, y + 4)
        .text(note.unit ?? '—',     MARGIN + W * 0.7,  y + 4);
      y += 24;
    } else {
      if (note.hours !== undefined) {
        labelValue(doc, 'Total horas', `${note.hours} h`, MARGIN, y);
        y += 28;
      }

      if (note.workers && note.workers.length > 0) {
        doc.fillColor(COLORS.light).rect(MARGIN, y, W, 22).fill();
        doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(8)
          .text('Trabajador', MARGIN + 4, y + 7)
          .text('Horas',      MARGIN + W * 0.7, y + 7);
        y += 22;

        for (const w of note.workers) {
          doc.fillColor(COLORS.dark).font('Helvetica').fontSize(9)
            .text(w.name,          MARGIN + 4,        y + 4)
            .text(`${w.hours} h`,  MARGIN + W * 0.7,  y + 4);
          y += 20;
        }
        y += 8;
      }
    }

    // ── Signature ─────────────────────────────────────────────────────────────
    y += 8;
    y = sectionTitle(doc, 'FIRMA', y);

    if (note.signed && note.signedAt) {
      doc.fillColor('#16a34a').font('Helvetica-Bold').fontSize(14)
        .text('✓ FIRMADO', MARGIN, y);
      doc.fillColor(COLORS.gray).font('Helvetica').fontSize(8)
        .text(`Fecha de firma: ${formatDate(note.signedAt)}`, MARGIN, y + 18);
      if (note.signatureUrl) {
        doc.fillColor(COLORS.gray).fontSize(7)
          .text(`URL: ${note.signatureUrl}`, MARGIN, y + 30, { width: W });
      }
    } else {
      doc.fillColor(COLORS.gray).font('Helvetica').fontSize(9)
        .text('Pendiente de firma', MARGIN, y);
      doc.rect(MARGIN, y + 16, 200, 60).strokeColor(COLORS.gray).lineWidth(0.5).stroke();
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const pageBottom = doc.page.height - 30;
    doc.fillColor(COLORS.gray).font('Helvetica').fontSize(7)
      .text(
        `Generado por BildyApp · ${new Date().toISOString()}`,
        MARGIN, pageBottom, { width: W, align: 'center' },
      );

    doc.end();
  });
}
