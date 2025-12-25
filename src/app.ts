/* eslint-disable @typescript-eslint/no-unused-vars */
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import morgan from 'morgan';
import routes from './app/routes';
import webhookRoutes from './app/routes/webhook.routes';
import { globalErrorHandler, notFoundHandler } from './app/utils';
import { manualTriggerRoundUpProcessing } from './app/jobs';
import { createNotification } from './app/modules/Notification/notification.service';
import { ROLE } from './app/modules/Auth/auth.constant';
import { auth } from './app/middlewares';
import { NOTIFICATION_TYPE } from './app/modules/Notification/notification.constant';

// app
const app: Application = express();

// cors
app.use(
  cors({
    credentials: true,
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://13.55.115.124:5173',
      'http://13.55.115.124:5174',
      'https://crescent-dashboard-eta.vercel.app',
    ],
  })
);

//parser
app.use(cookieParser());

//logger
app.use(morgan('dev'));
// static files
app.use('/public', express.static('public'));

// Apply raw body middleware BEFORE body parsing for webhooks
app.use(
  ['/api/v1/webhook/donation', '/api/v1/webhook/basiq'],
  (req, res, next) => {
    let rawBody = '';
    req.on('data', (chunk) => {
      rawBody += chunk;
    });
    req.on('end', () => {
      req.rawBody = rawBody;
      try {
        req.body = JSON.parse(rawBody);
      } catch (e) {
        req.body = {};
      }
      next();
    });
  }
);

// TODO: REMOVE LATER
app.post('/api/v1/test-my-corn', async (req, res) => {
  await manualTriggerRoundUpProcessing();

  console.log('============ENDED====================');
  res.json({
    success: true,
    message: 'Manual Trigger completed',
    data: null,
  });
});

// TODO: REMOVE LATER
app.post(
  '/api/v1/test-notification',
  auth(ROLE.ADMIN, ROLE.CLIENT, ROLE.BUSINESS, ROLE.ORGANIZATION),
  async (req, res) => {
    const userId = req.user._id.toString(); // Send it to yourself

    // Call the dispatcher you built
    await createNotification(
      userId,
      NOTIFICATION_TYPE.NEW_DONATION,
      `Donation created successully`,
      'test_id',
      {
        name: 'mostafizur rahaman',
        email: 'test@gmail.com',
      }
    );

    res.json({ success: true, message: 'Notification triggered' });
  }
);

// Add webhook routes after the raw body middleware
app.use('/api/v1/webhook', webhookRoutes);

//body parser
app.use(express.json());

//url encoded parser
app.use(express.urlencoded({ extended: true }));

// All main routes
app.use('/api/v1', routes);

// Testing
app.get('/', (req: Request, res: Response, next: NextFunction) => {
  res.send({ message: 'Server is running like a Rabit!' });
});

// global error handler
app.use(globalErrorHandler);

// all not found handler
app.use(notFoundHandler);

export default app;
