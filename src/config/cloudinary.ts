import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

// 1. Configure Cloudinary credentials from environment
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// 2. Multer Memory Storage (keep file in memory buffer to stream directly to Cloudinary)
const memoryStorage = multer.memoryStorage();

export const uploadLicenseMiddleware = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP) หรือเอกสาร PDF สำหรับใบประกอบวิชาชีพเท่านั้น'));
    }
  },
});

/**
 * Upload a memory buffer to Cloudinary and return the public HTTPS URL
 */
export const uploadBufferToCloudinary = (
  fileBuffer: Buffer,
  folder = 'medical_clinic/licenses'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto', // Supports both image and PDF
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error('Upload to Cloudinary failed'));
        }
        resolve(result.secure_url);
      }
    );

    uploadStream.end(fileBuffer);
  });
};

export default cloudinary;
