// ═══════════════════════════════════════════════════════════════════════════
// 🚀 SERVIDOR PRINCIPAL - LIMA AIRPORT HOSTEL AI SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import webhookRoutes from './routes/webhook.routes.js';
import calendarRoutes from './routes/calendar.routes.js';

// Para ES Modules: definir __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno desde la raíz del proyecto
dotenv.config({ path: path.join(__dirname, '../.env') });

// Crear aplicación Express
const app = express();
const PORT = process.env.API_PORT || 3001;

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 MIDDLEWARES
// ═══════════════════════════════════════════════════════════════════════════

// Seguridad
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
  })
);

// Parsear JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// ═══════════════════════════════════════════════════════════════════════════
// 🛣️ RUTAS
// ═══════════════════════════════════════════════════════════════════════════

app.use('/api', webhookRoutes);
app.use('/api/calendar', calendarRoutes);

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    service: '🏨 Lima Airport Hostel - AI System',
    version: '1.0.0',
    status: 'Running',
    endpoints: {
      health: '/api/health',
      webhook: '/api/webhook/manychat',
      calendarAuth: '/api/calendar/auth',
      calendarStatus: '/api/calendar/status',
    },
    hotel: {
      name: 'Lima Airport Hostel',
      website: 'https://limaairporthostel.com',
      location: 'Frente al Aeropuerto Jorge Chávez, Lima, Perú',
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🚨 MANEJO DE ERRORES
// ═══════════════════════════════════════════════════════════════════════════

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('❌ Error no manejado:', err);

  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 INICIAR SERVIDOR
// ═══════════════════════════════════════════════════════════════════════════

async function startServer() {
  try {
    app.listen(PORT, () => {
      logger.info('═══════════════════════════════════════════════════════════════');
      logger.info('🏨 LIMA AIRPORT HOSTEL - AI SYSTEM');
      logger.info('═══════════════════════════════════════════════════════════════');
      logger.info(`🚀 Servidor corriendo en http://localhost:${PORT}`);
      logger.info(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📧 Email: ${process.env.COMPANY_EMAIL}`);
      logger.info(`📱 WhatsApp: ${process.env.COMPANY_PHONE}`);
      logger.info('═══════════════════════════════════════════════════════════════');
    });
  } catch (error) {
    logger.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
}

// Manejo de señales de terminación
process.on('SIGTERM', () => {
  logger.info('⚠️ SIGTERM recibido, cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('⚠️ SIGINT recibido, cerrando servidor...');
  process.exit(0);
});

// Iniciar
startServer();
