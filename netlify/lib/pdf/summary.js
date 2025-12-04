import PDFDocument from 'pdfkit';

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/i);
  if (!match) return null;
  try {
    return Buffer.from(match[2], 'base64');
  } catch (err) {
    return null;
  }
}

function drawTableHeader(doc, x, widths) {
  const [previewW, sizeW, fontW, qtyW] = widths;
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(11);
  doc.text('Preview', x, y, { width: previewW });
  doc.text('Size/Name', x + previewW, y, { width: sizeW });
  doc.text('Font', x + previewW + sizeW, y, { width: fontW });
  doc.text('Qty', x + previewW + sizeW + fontW, y, { width: qtyW, align: 'right' });
  doc.moveDown(0.4);
  doc.moveTo(x, doc.y).lineTo(x + previewW + sizeW + fontW + qtyW, doc.y).stroke();
  doc.moveDown(0.2);
}

function drawHeader(doc, { title, referenceId, createdAt, pageNumber }) {
  const topY = doc.y;
  const leftX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.font('Helvetica-Bold').fontSize(16);
  doc.text(title || 'Saved Labels Summary', leftX, topY, { align: 'center', width: usableWidth });

  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10);
  doc.text(`Reference ID: ${referenceId || '-'}`, leftX, doc.y, { align: 'left', width: usableWidth / 2 });
  const timestamp = createdAt instanceof Date ? createdAt.toLocaleString() : String(createdAt || '');
  doc.text(`${timestamp} | Page ${pageNumber}`, leftX + usableWidth / 2, doc.y, { align: 'right', width: usableWidth / 2 });
  doc.moveDown(0.6);
}

function ensureSpace(doc, neededHeight, drawPage) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) {
    drawPage();
    return true;
  }
  return false;
}

function drawItemRow(doc, item, x, widths, rowHeight) {
  const [previewW, sizeW, fontW, qtyW] = widths;
  const baseY = doc.y;
  const previewX = x;
  const sizeX = x + previewW;
  const fontX = sizeX + sizeW;
  const qtyX = fontX + fontW;

  doc.rect(x, baseY - 4, previewW + sizeW + fontW + qtyW, rowHeight + 8).strokeColor('#cccccc').stroke();

  const imgBuf = dataUrlToBuffer(item.previewPng);
  if (imgBuf) {
    doc.image(imgBuf, previewX + 8, baseY + 6, { fit: [previewW - 16, rowHeight - 12], align: 'center', valign: 'center'] });
  } else {
    doc.rect(previewX + 8, baseY + 6, previewW - 16, rowHeight - 12).fillOpacity(0.08).fill('#666666').fillOpacity(1);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#777777');
    doc.text('Preview unavailable', previewX + 12, baseY + rowHeight / 2 - 6, { width: previewW - 24, align: 'center' });
    doc.fillColor('#000000');
  }

  doc.font('Helvetica-Bold').fontSize(11);
  doc.text(item.sizeTop || '', sizeX + 6, baseY + 8, { width: sizeW - 12 });
  doc.font('Helvetica').fontSize(10);
  doc.text(item.sizeBottom || '', sizeX + 6, baseY + 26, { width: sizeW - 12 });

  doc.font('Helvetica').fontSize(10);
  doc.text(item.fontLabel || '', fontX + 6, baseY + 14, { width: fontW - 12 });

  doc.font('Helvetica-Bold').fontSize(12);
  doc.text(String(item.qty || 0), qtyX, baseY + 14, { width: qtyW, align: 'center' });

  doc.y = baseY + rowHeight + 6;
}

export async function renderSummaryPdf({ title, referenceId, createdAt, items = [] }) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
  const buffers = [];
  doc.on('data', (b) => buffers.push(b));

  let pageNumber = 1;
  const widths = [110, 220, 140, 60];
  const rowHeight = 80;

  const drawPage = () => {
    if (pageNumber > 1) {
      doc.addPage();
    }
    drawHeader(doc, { title, referenceId, createdAt, pageNumber });
    drawTableHeader(doc, doc.page.margins.left, widths);
    pageNumber += 1;
  };

  drawPage();

  items.forEach((item, idx) => {
    ensureSpace(doc, rowHeight + 24, drawPage);
    drawItemRow(doc, item, doc.page.margins.left, widths, rowHeight);
  });

  return await new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
    doc.end();
  });
}
