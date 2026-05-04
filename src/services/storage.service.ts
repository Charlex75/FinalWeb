import { v2 as cloudinary } from 'cloudinary';
import config from '../config/index';

const isConfigured = (): boolean =>
  !!(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret);

if (isConfigured()) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key:    config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
  });
}

/**
 * Uploads a buffer to Cloudinary.
 * In test mode or when Cloudinary is not configured, returns a deterministic mock URL.
 */
export async function uploadBuffer(
  buffer: Buffer,
  publicId: string,
  folder: string,
  resourceType: 'image' | 'raw' = 'image',
): Promise<string> {
  if (!isConfigured()) {
    return `https://mock.cdn.bildyapp.com/${folder}/${publicId}`;
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: resourceType, overwrite: true },
      (error, result) => {
        if (error ?? !result) {
          reject(error ?? new Error('Cloudinary upload failed'));
        } else {
          resolve(result!.secure_url);
        }
      },
    );
    stream.end(buffer);
  });
}
