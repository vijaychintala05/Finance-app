import { Router } from 'express';

export function protectAsyncRoutes(router: Router): Router {
  const stack = (router as any).stack || [];
  for (const routeLayer of stack) {
    for (const handlerLayer of routeLayer.route?.stack || []) {
      const original = handlerLayer.handle;
      handlerLayer.handle = (req: any, res: any, next: any) => {
        try {
          Promise.resolve(original(req, res, next)).catch(next);
        } catch (error) {
          next(error);
        }
      };
    }
  }
  return router;
}
