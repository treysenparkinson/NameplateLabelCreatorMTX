const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { generateNameplateSummaryPdf } = require("./pdfSummary");

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.S3_BUCKET;
const ZAPIER_HOOK_URL = process.env.ZAPIER_HOOK_URL_NAMEPLATE;

const s3 = new S3Client({ region: REGION });

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

    if (!referenceId || !contact?.name || !contact?.email || !Array.isArray(templates) || templates.length === 0) {
      console.error("Validation failed", { referenceId, contact, templatesCount: templates?.length });
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Reference ID, contact (name & email), and at least one template are required.",
        }),
      };
    }

    if (!REGION || !BUCKET || !ZAPIER_HOOK_URL) {
      console.error("Missing required env vars", { REGION, BUCKET, ZAPIER_HOOK_URL });
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          message: "Server configuration error. Missing environment variables.",
        }),
      };
    }

    console.log("Generating PDF for referenceId:", referenceId);

    const pdfBuffer = await generateNameplateSummaryPdf({ referenceId, contact, templates });

    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
      console.error("PDF generator did not return a Buffer");
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, message: "Failed to generate PDF." }),
      };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `nameplate/${referenceId}/${timestamp}.pdf`;

    console.log("Uploading PDF to S3", { bucket: BUCKET, key });

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: pdfBuffer,
        ContentType: "application/pdf",
      })
    );

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
        body: JSON.stringify({ success: false, message: "Failed to notify Zapier." }),
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