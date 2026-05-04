import mongoSanitize from 'express-mongo-sanitize';

export const sanitize = mongoSanitize({ replaceWith: '_' });
