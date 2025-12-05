// netlify/functions/pdfSummary.js
const PDFDocument = require("pdfkit");

async function generateNameplateSummaryPdf({ referenceId, contact, templates }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    // Header
    doc.fontSize(20).text("Saved Labels Summary", { align: "left" });
    doc.moveDown(0.5);

    doc.fontSize(10);
    if (referenceId) {
      doc.text(`Reference ID: ${referenceId}`);
    }
    if (contact?.name || contact?.email) {
      doc.text(
        `Contact: ${contact?.name || ""}${
          contact?.email ? ` <${contact.email}>` : ""
        }`
      );
    }

    doc.moveDown();

    // Each template row
    templates.forEach((t, index) => {
      doc.fontSize(11).text(`Label ${index + 1}`, { underline: true });
      doc.moveDown(0.15);

      doc.fontSize(10);
      doc.text(
        `Size: ${t.heightInches}" x ${t.widthInches}"  |  Qty: ${t.quantity}`
      );
      doc.text(
        `Font: ${t.fontFamily}  |  Color: ${t.colorPalette}  |  Corners: ${t.cornerStyle}`
      );

      if (Array.isArray(t.lines)) {
        t.lines.forEach((line, i) => {
          doc.text(
            `Line ${i + 1}: "${line.text || ""}" (${line.fontSizePt || ""} pt)`
          );
        });
      }

      doc.moveDown();
    });

    // Footer
    const timestamp = new Date().toISOString();
    doc.moveDown();
    doc.fontSize(8).text(`Generated: ${timestamp}`);

    doc.end();
  });
}

module.exports = { generateNameplateSummaryPdf };
