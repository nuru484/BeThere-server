// src/config/cloudinary-setup.js
//
// Configures the Cloudinary SDK exactly once, as an import side effect.
//
// Configuration used to live in app.js, which only the WEB process imports -
// so the worker process (worker.js -> lifecycle.js -> retention -> evidence
// purge -> deleteImage) ran with an unconfigured SDK and every destroy threw
// "Must supply api_key". Owning it here means any consumer of
// utils/cloudinary.js is configured by virtue of importing it, in either
// entrypoint.
import { v2 as cloudinary } from "cloudinary";
import ENV from "./env.js";

cloudinary.config({
  cloud_name: ENV.CLOUDINARY_CLOUD_NAME,
  api_key: ENV.CLOUDINARY_API_KEY,
  api_secret: ENV.CLOUDINARY_API_SECRET,
});

export default cloudinary;
