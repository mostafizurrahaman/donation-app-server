/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '../utils';
import { ZodObject } from 'zod';

// validateRequest
export const validateRequest = (schema: ZodObject<any, any>) => {
  return asyncHandler(
    async (req: Request, _res: Response, next: NextFunction) => {
      console.log(req.body);

      const parsedData = await schema.parseAsync({
        body: req.body,
        cookies: req.cookies,
        query: req.query,
        params: req.params,
      });

      // Overwrite validated values (excluding read-only query)
      req.body = parsedData.body || req.body;
      req.cookies = parsedData.cookies || req.cookies;
      // req.query is read-only, so we store the validated query in a custom property
      (req as any).validatedQuery = parsedData.query || req.query;
      req.params = (parsedData.params as any) || req.params;

      next();
    }
  );
};

// validateRequestFromFormData
export const validateRequestFromFormData = (schema: ZodObject<any, any>) => {
  return asyncHandler(
    async (req: Request, _res: Response, next: NextFunction) => {
      if (req?.body?.data) {
        const parsedData = await schema.parseAsync({
          body: JSON.parse(req?.body?.data),
          cookies: req?.cookies,
          query: req?.query,
          params: req?.params,
        });

        // Overwrite validated values (excluding read-only query)
        req.body = parsedData?.body || req?.body;
        req.cookies = parsedData?.cookies || req?.cookies;
        // req.query is read-only, so we store the validated query in a custom property
        (req as any).validatedQuery = parsedData?.query || req?.query;
        req.params = (parsedData?.params as any) || req?.params;

        next();
      }
    }
  );
};
