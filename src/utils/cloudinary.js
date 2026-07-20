// src/utils/cloudinary.js
//
// Shared Cloudinary helpers for every image-bearing domain (profile
// pictures, event covers). Uploads are promised wrappers around
// upload_stream; deletion is best-effort cleanup that never fails the
// request it runs in.
import cloudinary from "cloudinary";
import logger from "./logger.js";

/**
 * Resolves a Cloudinary delivery URL to the public id `destroy` expects
 * (folder path included, version prefix and file extension stripped).
 * A value that is not a URL is assumed to already be a public id.
 */
function extractPublicIdFromUrl(urlOrPublicId) {
  try {
    // e.g. /<cloud>/image/upload/v1712345/bethere/abc123.jpg
    const segments = new URL(urlOrPublicId).pathname.split("/").filter(Boolean);
    const uploadIndex = segments.indexOf("upload");
    let publicIdSegments =
      uploadIndex === -1 ? segments.slice(-1) : segments.slice(uploadIndex + 1);
    if (/^v\d+$/.test(publicIdSegments[0] ?? "")) {
      publicIdSegments = publicIdSegments.slice(1);
    }
    return publicIdSegments.join("/").replace(/\.[^/.]+$/, "");
  } catch {
    return urlOrPublicId;
  }
}

/** Uploads an in-memory image buffer and resolves to its secure URL. */
export function uploadImage(buffer, { folder = "bethere" } = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.v2.uploader.upload_stream(
      { folder, quality: "auto", fetch_format: "auto" },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
}

/**
 * Best-effort destroy of a Cloudinary asset by URL or public id. Deletion
 * is cleanup, never a domain invariant, so failures are logged and
 * swallowed - the caller's request must not fail over an orphaned image.
 */
export async function deleteImage(urlOrPublicId) {
  if (!urlOrPublicId) return;
  try {
    const publicId = extractPublicIdFromUrl(urlOrPublicId);
    await cloudinary.v2.uploader.destroy(publicId);
  } catch (error) {
    logger.error(error, `Failed to delete Cloudinary image: ${urlOrPublicId}`);
  }
}

/**
 * Wire semantics for image fields on multipart UPDATE endpoints:
 *   field omitted (undefined) -> undefined - leave the column untouched
 *   field ''                  -> null      - remove; the service then deletes
 *                                            the old asset (best-effort)
 *   string                    -> string    - replace (written by the service
 *                                            after a file upload, never
 *                                            client-typed)
 */
export const imageColumnValue = (value) => (value === "" ? null : value);
