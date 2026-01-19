import sharp from "sharp";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB
const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 90;

export interface ImageProcessingResult {
  data: Buffer;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
  wasCompressed: boolean;
}

/**
 * Compress and resize image if it exceeds size limits
 * Returns the processed image as a Buffer
 */
export async function processImage(
  imageBuffer: Buffer
): Promise<ImageProcessingResult> {
  let image = sharp(imageBuffer);
  const metadata = await image.metadata();

  let wasCompressed = false;
  let outputBuffer: Buffer;

  // Check if image needs resizing based on dimensions
  let needsResize = false;
  if (metadata.width && metadata.width > MAX_DIMENSION) {
    needsResize = true;
  }
  if (metadata.height && metadata.height > MAX_DIMENSION) {
    needsResize = true;
  }

  // Resize if needed
  if (needsResize) {
    image = image.resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });
    wasCompressed = true;
  }

  // Convert to JPEG if size is large or if it's PNG
  const originalSize = imageBuffer.length;
  if (
    originalSize > MAX_IMAGE_SIZE ||
    metadata.format === "png" ||
    needsResize
  ) {
    outputBuffer = await image
      .jpeg({ quality: JPEG_QUALITY, progressive: true })
      .toBuffer();
    wasCompressed = true;
  } else {
    // Keep original format if small enough
    outputBuffer = await image.toBuffer();
  }

  // If still too large, reduce quality further
  if (outputBuffer.length > MAX_IMAGE_SIZE) {
    let quality = JPEG_QUALITY - 10;
    while (outputBuffer.length > MAX_IMAGE_SIZE && quality > 50) {
      outputBuffer = await sharp(imageBuffer)
        .resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: "inside",
        })
        .jpeg({ quality, progressive: true })
        .toBuffer();
      quality -= 10;
      wasCompressed = true;
    }
  }

  const finalMetadata = await sharp(outputBuffer).metadata();

  return {
    data: outputBuffer,
    width: finalMetadata.width || 0,
    height: finalMetadata.height || 0,
    format: finalMetadata.format || "jpeg",
    sizeBytes: outputBuffer.length,
    wasCompressed,
  };
}

/**
 * Generate a thumbnail for the image (200x200 max)
 */
export async function generateThumbnail(
  imageBuffer: Buffer
): Promise<Buffer> {
  return await sharp(imageBuffer)
    .resize({
      width: 200,
      height: 200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();
}
