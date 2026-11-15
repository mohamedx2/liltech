import { Router, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger-spec';

export const docsRouter: Router = Router();

// Raw OpenAPI 3.0 specification in JSON format
docsRouter.get('/docs/openapi.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(swaggerSpec);
});

// Interactive Swagger UI documentation
docsRouter.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'LilTech 2026 API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      displayRequestDuration: true,
      filter: true,
    },
  }),
);
