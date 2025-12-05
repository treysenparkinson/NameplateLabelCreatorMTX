const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const BUCKET = process.env.S3_BUCKET || process.env.PDF_BUCKET || process.env.FILE_BUCKET;

function getClient() {
  return new S3Client({ region: REGION });
}

async function putPdf({ key, buffer, contentType = 'application/pdf' }) {
  if (!BUCKET) {
    throw new Error('Missing S3 bucket configuration for PDF uploads');
  }
  if (!buffer) {
    throw new Error('Missing PDF buffer');
  }

  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read'
    })
  );

  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

module.exports = { putPdf };

