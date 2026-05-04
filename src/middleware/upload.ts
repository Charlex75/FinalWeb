import multer from 'multer';
import { AppError } from '../utils/AppError';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

function imageFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(`Unsupported file type: ${file.mimetype}`, 400));
  }
}

// Memory storage — used for cloud uploads (signature images, etc.)
// TODO(human): configure cloud storage provider (Cloudinary / R2 / S3)
//              in src/services/storage.service.ts and wire it up here
export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: imageFilter,
});

// Disk storage — used for local company logo uploads
export const diskUpload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/logos',
    filename(_req, file, cb) {
      const ext = file.originalname.split('.').pop() ?? 'jpg';
      cb(null, `logo-${Date.now()}.${ext}`);
    },
  }),
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: imageFilter,
});
