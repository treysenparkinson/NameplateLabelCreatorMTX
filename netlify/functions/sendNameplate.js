const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const PDFDocument = require("pdfkit");

const BUCKET = process.env.S3_BUCKET || "matrix-systems-labels";

// Use Netlify's MY_* AWS env vars (bucket is in us-west-1)
const REGION = process.env.MY_AWS_REGION || "us-west-1";
const AWS_ACCESS_KEY_ID = process.env.MY_AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.MY_AWS_SECRET_ACCESS_KEY;
const ZAPIER_HOOK_URL = process.env.ZAPIER_HOOK_URL_NAMEPLATE;

const s3 = new S3Client({
  region: REGION,
  credentials:
    AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

console.log("sendNameplate S3 config:", {
  REGION,
  BUCKET,
  hasAccessKey: !!AWS_ACCESS_KEY_ID,
  hasSecretKey: !!AWS_SECRET_ACCESS_KEY,
});

// Inline PDF generator – no external local modules
function generateNameplateSummaryPdf({ referenceId, contact, templates }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });

    try {
      doc.registerFont(
        "Montserrat",
        "netlify/lib/pdf/fonts/Montserrat-Regular.ttf"
      );
      doc.font("Montserrat");
    } catch (e) {
      console.error("Failed to load Montserrat font, using default", e);
    }

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    const headerTimestamp = new Date().toLocaleString("en-US", {
      timeZone: "America/Denver",
    });
    const margin = 50;
    const previewCol = 120;
    const sizeCol = 220;
    const fontCol = 160;
    const qtyCol = 60;
    const rowH = 70;

    const headerY = margin;
    doc.fontSize(20).text("Nameplate Label Summary", margin, headerY);
    doc.fontSize(9).text(
      `Generated: ${headerTimestamp}`,
      doc.page.width - margin - 200,
      margin
    );
    doc.fontSize(10);
    if (referenceId) doc.text(`Reference ID: ${referenceId}`, margin, headerY + 25);
    if (contact?.name || contact?.email)
      doc.text(
        `Contact: ${contact.name || ""}${
          contact.email ? ` <${contact.email}>` : ""
        }`,
        margin,
        headerY + 38
      );

    const tableHeaderY = margin + 70;
    doc.fontSize(11);
    doc.text("Preview", margin, tableHeaderY);
    doc.text("Size/Name", margin + previewCol + 10, tableHeaderY);
    doc.text("Font", margin + previewCol + sizeCol + 20, tableHeaderY);
    const qtyHeaderX = margin + previewCol + sizeCol + fontCol + 30;
    doc.text("Qty", qtyHeaderX, tableHeaderY, { width: qtyCol, align: "center" });

    doc.save();
    doc.strokeColor("#DDDDDD").lineWidth(1);
    doc
      .moveTo(margin, tableHeaderY + 14)
      .lineTo(doc.page.width - margin, tableHeaderY + 14)
      .stroke();
    doc.restore();

    let currentY = tableHeaderY + 24;

    templates.forEach((t) => {
      if (currentY + rowH > doc.page.height - margin) {
        doc.addPage();
        doc.fontSize(11);
        doc.text("Preview", margin, tableHeaderY);
        doc.text("Size/Name", margin + previewCol + 10, tableHeaderY);
        doc.text("Font", margin + previewCol + sizeCol + 20, tableHeaderY);
        doc.text("Qty", qtyHeaderX, tableHeaderY, { width: qtyCol, align: "center" });
        doc.save();
        doc.strokeColor("#DDDDDD").lineWidth(1);
        doc
          .moveTo(margin, tableHeaderY + 14)
          .lineTo(doc.page.width - margin, tableHeaderY + 14)
          .stroke();
        doc.restore();
        currentY = tableHeaderY + 24;
      }

      if (t.previewDataUrl) {
        try {
          const imgBuf = Buffer.from(t.previewDataUrl.split(",")[1], "base64");
          doc.image(imgBuf, margin, currentY, {
            width: previewCol - 10,
            height: rowH - 10,
            fit: [previewCol - 10, rowH - 10],
          });
        } catch {}
      }

      const sizeX = margin + previewCol + 10;
      doc.fontSize(10);
      let sizeY = currentY + 5;
      if (t.name) {
        doc.text(t.name, sizeX, sizeY);
        sizeY += 14;
      }
      doc.text(`${t.heightInches || "0"}" × ${t.widthInches || "0"}"`, sizeX, sizeY);

      const fontX = margin + previewCol + sizeCol + 20;
      const fontDisplay =
        t.fontDisplayName ||
        (typeof t.fontFamily === "string"
          ? t.fontFamily.split(",")[0].trim()
          : "");

      doc.text(fontDisplay, fontX, currentY + 5);

      const qtyX = margin + previewCol + sizeCol + fontCol + 30;
      doc.text(String(t.quantity || 1), qtyX, currentY + 5, {
        width: qtyCol,
        align: "center",
      });

      currentY += rowH;
    });

    const pageRange = doc.bufferedPageRange();
    const pageCount = pageRange.count;
    const footerY = doc.page.height - margin + 5;
    const ts = new Date().toLocaleString("en-US", { timeZone: "America/Denver" });
    for (let p = 0; p < pageCount; p++) {
      doc.switchToPage((pageRange.start || 0) + p);

      doc.fontSize(7).text(`Page ${p + 1} of ${pageCount}`, margin, margin - 10);
      doc.fontSize(8).text(
        `Reference ID: ${referenceId || ""}  ${ts}`,
        margin,
        footerY
      );
      doc.text(
        `Nameplate Label Summary  Page ${p + 1} of ${pageCount}`,
        doc.page.width - margin - 200,
        footerY
      );
    }

    doc.end();
  });
}

exports.handler = async (event) => {
  console.log("sendNameplate invoked");

  if (event.httpMethod && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { referenceId, contact, templates } = body;

    if (
      !referenceId ||
      !contact?.name ||
      !contact?.email ||
      !Array.isArray(templates) ||
      templates.length === 0
    ) {
      console.error("Validation failed", {
        referenceId,
        contact,
        templatesCount: templates?.length,
      });
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message:
            "Reference ID, contact (name & email), and at least one template are required.",
        }),
      };
    }

    if (
      !REGION ||
      !BUCKET ||
      !ZAPIER_HOOK_URL ||
      !AWS_ACCESS_KEY_ID ||
      !AWS_SECRET_ACCESS_KEY
    ) {
      console.error("Missing required env vars", {
        REGION,
        BUCKET,
        ZAPIER_HOOK_URL,
        hasAccessKey: !!AWS_ACCESS_KEY_ID,
        hasSecretKey: !!AWS_SECRET_ACCESS_KEY,
      });
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          message: "Server configuration error. Missing environment variables.",
        }),
      };
    }

    console.log("Generating PDF for referenceId:", referenceId);

    const pdfBuffer = await generateNameplateSummaryPdf({
      referenceId,
      contact,
      templates,
    });

    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
      console.error("PDF generator did not return a Buffer");
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          message: "Failed to generate PDF.",
        }),
      };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `nameplate/${referenceId}/${timestamp}.pdf`;

    console.log("Uploading PDF to S3", { bucket: BUCKET, key });

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: pdfBuffer,
          ContentType: "application/pdf",
        })
      );
    } catch (err) {
      console.error("S3 upload error", {
        code: err.Code || err.name,
        message: err.message,
        endpoint: err.$metadata?.endpoint || undefined,
        httpStatusCode: err.$metadata?.httpStatusCode,
      });

      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          message: "Failed to upload PDF to S3.",
          errorCode: err.Code || err.name,
        }),
      };
    }

    // Generate a presigned URL for the uploaded PDF (valid for 24 hours)
    const signedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }),
      { expiresIn: 60 * 60 * 24 }
    );

    const pdfUrl = signedUrl;
    console.log("Generated presigned pdfUrl:", pdfUrl);

    console.log("Posting to Zapier", { ZAPIER_HOOK_URL });

    const zapierPayload = {
      referenceId,
      contact,
      templates,
      pdfUrl,
      source: "nameplate-label-creator",
    };

    const zapierRes = await fetch(ZAPIER_HOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(zapierPayload),
    });

    if (!zapierRes.ok) {
      const text = await zapierRes.text().catch(() => "");
      console.error("Zapier responded with non-OK status", zapierRes.status, text);
      return {
        statusCode: 502,
        body: JSON.stringify({
          success: false,
          message: "Failed to notify Zapier.",
        }),
      };
    }

    console.log("sendNameplate completed successfully");

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Nameplate label submitted successfully.",
      }),
    };
  } catch (err) {
    console.error("sendNameplate error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Unexpected error in sendNameplate.",
      }),
    };
  }
};
