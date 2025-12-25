/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import http, { Server } from 'http';
import mongoose from 'mongoose';
import app from './app';
import config from './app/config';
import seedAdmin from './app/seed';
import { initializeJobs } from './app/jobs';
import { ensureBasiqWebhookRegistered } from './app/modules/BankConnection/basiq.service';

let server: Server | null = null;

// bootstrap function
async function bootstrap() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.dbUrl as string);
    console.log('🛢 Database connected successfully');

    // Seed initial admin if not already present
    await seedAdmin();

    // ensure Basiq webhook registered:
    ensureBasiqWebhookRegistered(config.serverUrl);

    // Initialize background jobs (cron jobs)
    initializeJobs();

    // Start the HTTP server
    const port = config.port;
    console.log(
      `Debug: Config port is ${port}, process.env.PORT is ${process.env.PORT}`
    );
    server = http.createServer(app);

    server.listen(port, () => {
      const host = config.host;
      console.log(`🚀 Server running on http://${host}:${port}`);
    });

    // Handle connection errors gracefully
    server.on('error', (err) => {
      console.error('❌ Server error:', err);
      shutdown('SERVER_ERROR', err);
    });
  } catch (error) {
    console.error('❌ Failed to start the application:', error);
    process.exit(1);
  }
}

// Boot up
bootstrap();

// Global process event handlers
['SIGTERM', 'SIGINT', 'uncaughtException', 'unhandledRejection'].forEach(
  (signal) => {
    process.on(signal as NodeJS.Signals, (err?: any) => {
      shutdown(signal, err instanceof Error ? err : undefined);
    });
  }
);

// Gracefully closes the HTTP server and MongoDB connection.
async function shutdown(signal: string, error?: Error) {
  console.log(`\n⚠️  Received ${signal}. Shutting down gracefully...`);

  if (error) {
    console.error('Reason:', error.message);
  }

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
      console.log('🧩 Server closed.');
    }

    await mongoose.connection.close();
    console.log('🧩 MongoDB connection closed.');

    process.exit(error ? 1 : 0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}
