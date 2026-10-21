import fs from 'fs';
import path from 'path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { env } from './config/env';
import authRoutes from './routes/auth';
import bookingRoutes from './routes/bookings';
import catalogRoutes from './routes/catalog';
import operatorRoutes from './routes/operator';
import paymentRoutes, { mockGateway } from './routes/payments';
import tripRoutes from './routes/trips';
import { errorHandler } from './utils/http';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(compression());
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const norm = origin.replace(/\/+$/, '');
        const allowedOrigins = [
          env.CLIENT_URL,
          'https://bus-reservation-system-red.vercel.app',
          'https://bus17.netlify.app',
        ];
        if (
          allowedOrigins.includes(norm) ||
          /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+):5173$/.test(norm)
        ) {
          return cb(null, true);
        }
        return cb(null, true);
      },
      credentials: true,
    }),
  );

  // keep the raw body: webhook signatures are verified against it
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(morgan('dev'));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, skip: () => env.NODE_ENV === 'test' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
  app.use('/api/auth', authRoutes);
  app.use('/api/trips', tripRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/operator', operatorRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', bookingRoutes);
  if (!env.EXTERNAL_PAYMENT_URL) app.use('/mock-gateway', mockGateway);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  // Deployment: if the web app has been built (npm run build), serve it from this same server, so one
  // address serves the site AND the API and a payment QR scanned on any network opens the same site.
  const dist = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : path.resolve(__dirname, '../../frontend/dist');
  if (env.NODE_ENV === 'production' && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get(/^\/(?!api\/|mock-gateway).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
