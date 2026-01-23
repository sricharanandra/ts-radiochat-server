import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import crypto from "crypto";

// Oracle Object Storage is S3-compatible
// Configuration from environment variables
const s3Client = new S3Client({
  region: process.env.OCI_REGION || "us-ashburn-1",
  endpoint: process.env.OCI_ENDPOINT, // e.g., https://namespace.compat.objectstorage.us-ashburn-1.oraclecloud.com
  credentials: {
    accessKeyId: process.env.OCI_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.OCI_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true, // Required for Oracle Object Storage
});

const BUCKET_NAME = process.env.OCI_BUCKET_NAME || "eurus-images";

/**
 * Upload encrypted image data to Oracle Object Storage
 * @param imageData Base64-encoded encrypted image data
 * @param messageId Unique message identifier
 * @returns Public URL to the uploaded image
 */
export async function uploadImage(
  imageData: Buffer,
  messageId: string
): Promise<string> {
  const key = `images/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${messageId}.enc`;

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: imageData,
      ContentType: "application/octet-stream", // Encrypted data, no image type
      CacheControl: "public, max-age=31536000", // 1 year cache
    },
  });

  await upload.done();

  // Return the public URL
  const baseUrl = process.env.OCI_PUBLIC_URL || process.env.OCI_ENDPOINT;
  return `${baseUrl}/${BUCKET_NAME}/${key}`;
}

/**
 * Generate a unique image ID
 */
export function generateImageId(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Validate image size (max 10MB before compression)
 */
export function validateImageSize(sizeBytes: number): boolean {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  return sizeBytes <= MAX_SIZE;
}
