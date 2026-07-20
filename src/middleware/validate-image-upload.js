// src/middleware/validate-image-upload.js
//
// Second line of defense behind multer's fileFilter: the multipart mimetype
// is client-declared metadata, so anything could arrive labeled
// "image/jpeg". This middleware checks the actual bytes (magic numbers)
// of every buffered upload and rejects non-images before they reach
// Cloudinary or the face engine.
import { BadRequestError } from "./error-handler.js";

/** True when `buffer` starts with a real image signature we accept. */
export function isImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) return false;

  // JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return true;
  }
  // PNG: 89 50 4E 47
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return true;
  }
  // HEIC/HEIF/AVIF family: an ISO-BMFF "ftyp" box at offset 4.
  if (buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp") {
    return true;
  }
  return false;
}

/**
 * Validates every file multer buffered on this request (req.file and
 * req.files, array or fielded object). Mount AFTER the multer middleware.
 */
export function validateImageUploads(req, _res, next) {
  const files = [
    ...(req.file ? [req.file] : []),
    ...(Array.isArray(req.files)
      ? req.files
      : req.files
        ? Object.values(req.files).flat()
        : []),
  ];

  for (const file of files) {
    if (!isImageBuffer(file.buffer)) {
      return next(
        new BadRequestError(
          "One of the uploaded files is not a valid image.",
          { code: "INVALID_IMAGE" }
        )
      );
    }
  }
  next();
}
