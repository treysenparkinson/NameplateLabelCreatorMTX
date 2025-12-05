const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
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

    const pdfUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

    console.log("Posting to Zapier", { ZAPIER_HOOK_URL });

    const zapierRes = await fetch(ZAPIER_HOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referenceId,
        contact,
        templates,
        pdfUrl,
        source: "nameplate-label-creator",
      }),
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
