import logger from "./logger.js";

export const extractPublicIdFromUrl = (url) => {
  try {
    const urlPath = new URL(url).pathname;
    const parts = urlPath.split("/");
    const filename = parts[parts.length - 1];
    return filename.split(".")[0];
  } catch (error) {
    logger.error(error, "Error extracting public ID from Cloudinary URL");
    return url.split("/").slice(-1)[0].split(".")[0];
  }
};
