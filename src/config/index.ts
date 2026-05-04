const config = {
  env: process.env['NODE_ENV'] ?? 'development',
  port: Number(process.env['PORT'] ?? 3000),
  host: process.env['HOST'] ?? 'localhost',

  mongodb: {
    uri: process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/bildyapp',
  },

  jwt: {
    secret: process.env['JWT_SECRET'] ?? 'change_me_in_production',
    expiresIn: process.env['JWT_EXPIRES_IN'] ?? '7d',
    refreshSecret: process.env['JWT_REFRESH_SECRET'] ?? 'change_refresh_in_production',
    refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] ?? '30d',
  },

  email: {
    host: process.env['SMTP_HOST'] ?? '',
    port: Number(process.env['SMTP_PORT'] ?? 587),
    user: process.env['SMTP_USER'] ?? '',
    pass: process.env['SMTP_PASS'] ?? '',
    from: process.env['EMAIL_FROM'] ?? 'noreply@bildyapp.com',
  },

  slack: {
    webhookUrl: process.env['SLACK_WEBHOOK_URL'] ?? '',
  },

  cloudinary: {
    cloudName: process.env['CLOUDINARY_CLOUD_NAME'] ?? '',
    apiKey: process.env['CLOUDINARY_API_KEY'] ?? '',
    apiSecret: process.env['CLOUDINARY_API_SECRET'] ?? '',
  },

  r2: {
    accountId: process.env['R2_ACCOUNT_ID'] ?? '',
    accessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',
    bucketName: process.env['R2_BUCKET_NAME'] ?? '',
    publicUrl: process.env['R2_PUBLIC_URL'] ?? '',
  },

  rateLimit: {
    windowMs: Number(process.env['RATE_LIMIT_WINDOW_MS'] ?? 15 * 60 * 1000),
    max: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
  },

  cors: {
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3000',
  },

  frontendUrl: process.env['FRONTEND_URL'] ?? 'http://localhost:3000',
};

export default config;
