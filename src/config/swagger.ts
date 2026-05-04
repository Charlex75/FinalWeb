import swaggerJsdoc from 'swagger-jsdoc';
import { join } from 'path';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BildyApp API',
      version: '1.0.0',
      description:
        'Backend REST API for BildyApp — delivery note (albarán) management between clients and providers.',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    join(__dirname, '../routes/*.js'),
    join(__dirname, '../routes/*.ts'),
    join(__dirname, '../models/*.js'),
    join(__dirname, '../models/*.ts'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
