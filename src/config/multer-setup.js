import multer from "multer";
import { BadRequestError } from "../middleware/error-handler.js";
import { LIVENESS } from "./constants.js";

const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/webp",
    "image/heic",
    "image/heif",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestError(
        "Only image files (JPEG, PNG, JPG, WEBP, HEIC) are allowed."
      ),
      false
    );
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
});

// Check-in/out frame bursts: client-compressed JPEGs are tiny, so a tight
// per-frame cap plus a hard file count keeps a check-in from buffering tens of
// MB in memory (16 frames x 5MB would otherwise be the ceiling).
export const frameUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1.5 * 1024 * 1024, // 1.5MB per frame
    files: LIVENESS.MAX_FRAMES,
  },
});
