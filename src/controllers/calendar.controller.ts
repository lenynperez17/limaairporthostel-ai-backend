// ═══════════════════════════════════════════════════════════════════════════
// 📅 CONTROLADOR DE AUTENTICACIÓN GOOGLE CALENDAR - LIMA AIRPORT HOSTEL
// ═══════════════════════════════════════════════════════════════════════════

import { Request, Response } from 'express';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

// Para ES Modules: definir __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Scopes necesarios para Google Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar'
];

// Rutas de configuración
const credentialsPath = path.join(__dirname, '../../config/google/credentials.json');
const tokenPath = path.join(__dirname, '../../config/google/token.json');

/**
 * 🔐 Redirige al usuario a la página de autorización de Google
 * Ruta: GET /api/calendar/auth
 */
export async function handleAuth(req: Request, res: Response) {
  try {
    logger.info('🔐 Iniciando flujo de autorización OAuth2...');

    // Leer credenciales
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.web;

    // Crear cliente OAuth2
    // Usar redirect_uri basado en el entorno
    const redirectUri = process.env.NODE_ENV === 'production'
      ? redirect_uris.find((uri: string) => uri.includes('hotel.nyneldigital.com')) || redirect_uris[1]
      : redirect_uris[0];

    const oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirectUri
    );

    // Generar URL de autorización
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Obtener refresh_token
      scope: SCOPES,
      prompt: 'consent' // Forzar pantalla de consentimiento para obtener refresh_token
    });

    logger.info(`✅ URL de autorización generada: ${authUrl}`);
    logger.info(`🔗 Redirect URI usado: ${redirectUri}`);

    // Redirigir al usuario a Google
    res.redirect(authUrl);
  } catch (error) {
    logger.error('❌ Error en handleAuth:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar autorización OAuth2',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * ✅ Maneja el callback de Google después de la autorización
 * Ruta: GET /api/calendar/auth/callback
 */
export async function handleCallback(req: Request, res: Response) {
  try {
    const code = req.query.code as string;

    if (!code) {
      throw new Error('No se recibió código de autorización');
    }

    logger.info('📥 Código de autorización recibido');

    // Leer credenciales
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.web;

    // Usar el mismo redirect_uri que en handleAuth
    const redirectUri = process.env.NODE_ENV === 'production'
      ? redirect_uris.find((uri: string) => uri.includes('hotel.nyneldigital.com')) || redirect_uris[1]
      : redirect_uris[0];

    const oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirectUri
    );

    // Intercambiar código por tokens
    logger.info('🔄 Intercambiando código por tokens...');
    const { tokens } = await oauth2Client.getToken(code);

    logger.info('✅ Tokens obtenidos exitosamente');
    logger.info(`📝 Scopes: ${tokens.scope}`);
    logger.info(`⏰ Expira en: ${new Date(tokens.expiry_date!).toLocaleString('es-PE')}`);

    // Guardar tokens en token.json
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
    logger.info(`💾 Token guardado en: ${tokenPath}`);

    // Copiar token.json al servidor de producción si estamos en desarrollo
    if (process.env.NODE_ENV !== 'production') {
      logger.info('📤 IMPORTANTE: Copia este token.json al servidor de producción:');
      logger.info(`   Local:  ${tokenPath}`);
      logger.info('   Remoto: /var/www/limaairporthostel/config/google/token.json');
    }

    // Respuesta exitosa
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>✅ Autorización Exitosa - Lima Airport Hostel</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            padding: 3rem;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 500px;
          }
          h1 {
            color: #2d3748;
            margin-bottom: 1rem;
            font-size: 2rem;
          }
          .success-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
          }
          .info {
            background: #f7fafc;
            padding: 1.5rem;
            border-radius: 10px;
            margin: 1.5rem 0;
            text-align: left;
          }
          .info-item {
            margin: 0.5rem 0;
            font-size: 0.9rem;
            color: #4a5568;
          }
          .label {
            font-weight: bold;
            color: #2d3748;
          }
          .token-path {
            font-family: 'Courier New', monospace;
            background: #edf2f7;
            padding: 0.3rem 0.6rem;
            border-radius: 4px;
            font-size: 0.85rem;
          }
          .success-msg {
            color: #48bb78;
            font-weight: 600;
            margin: 1rem 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Autorización Exitosa</h1>
          <p class="success-msg">Google Calendar conectado correctamente</p>

          <div class="info">
            <div class="info-item">
              <span class="label">🏨 Hotel:</span> Lima Airport Hostel
            </div>
            <div class="info-item">
              <span class="label">📅 Servicio:</span> Google Calendar API
            </div>
            <div class="info-item">
              <span class="label">🔐 Scopes:</span> calendar.events, calendar
            </div>
            <div class="info-item">
              <span class="label">⏰ Expira:</span> ${new Date(tokens.expiry_date!).toLocaleString('es-PE')}
            </div>
            <div class="info-item" style="margin-top: 1rem;">
              <span class="label">💾 Token guardado en:</span><br>
              <span class="token-path">${tokenPath}</span>
            </div>
          </div>

          <p style="color: #718096; font-size: 0.9rem;">
            El sistema de reservas ahora puede verificar disponibilidad en tiempo real.
            Puedes cerrar esta ventana.
          </p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    logger.error('❌ Error en handleCallback:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>❌ Error de Autorización</title>
        <meta charset="utf-8">
        <style>
          body {
            font-family: sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: #fee;
          }
          .error {
            background: white;
            padding: 2rem;
            border-radius: 10px;
            max-width: 500px;
            text-align: center;
          }
          h1 { color: #e53e3e; }
          pre {
            background: #f7fafc;
            padding: 1rem;
            border-radius: 5px;
            text-align: left;
            overflow-x: auto;
          }
        </style>
      </head>
      <body>
        <div class="error">
          <h1>❌ Error de Autorización</h1>
          <p>No se pudo completar la autorización de Google Calendar.</p>
          <pre>${error instanceof Error ? error.message : 'Unknown error'}</pre>
          <p><a href="/api/calendar/auth">Intentar nuevamente</a></p>
        </div>
      </body>
      </html>
    `);
  }
}

/**
 * 📊 Verifica el estado de la autenticación
 * Ruta: GET /api/calendar/status
 */
export async function handleStatus(req: Request, res: Response) {
  try {
    // Verificar si existe token.json
    if (!fs.existsSync(tokenPath)) {
      return res.json({
        authenticated: false,
        message: 'No hay token de autorización. Visita /api/calendar/auth para autorizar.'
      });
    }

    // Leer token
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    const expiryDate = new Date(token.expiry_date);
    const now = new Date();
    const isExpired = expiryDate < now;

    res.json({
      authenticated: true,
      hasRefreshToken: !!token.refresh_token,
      expiryDate: expiryDate.toISOString(),
      isExpired,
      scopes: token.scope?.split(' ') || [],
      message: isExpired
        ? 'Token expirado. Se renovará automáticamente en la próxima solicitud.'
        : 'Token válido y activo.'
    });
  } catch (error) {
    logger.error('❌ Error en handleStatus:', error);
    res.status(500).json({
      success: false,
      error: 'Error al verificar estado de autorización'
    });
  }
}
