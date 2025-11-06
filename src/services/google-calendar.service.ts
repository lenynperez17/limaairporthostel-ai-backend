// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE CALENDAR SERVICE - LIMA AIRPORT HOSTEL
// ═══════════════════════════════════════════════════════════════════════════

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

// Para ES Modules: definir __dirname y __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface RoomAvailability {
  date: string;
  availableRooms: number;
  totalRooms: number;
  isAvailable: boolean;
}

class GoogleCalendarService {
  private oauth2Client!: OAuth2Client;
  private calendar: any;

  constructor() {
    const credentialsPath = path.join(__dirname, '../../config/google/credentials.json');
    const tokenPath = path.join(__dirname, '../../config/google/token.json');

    try {
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      const { client_secret, client_id, redirect_uris } = credentials.web;

      this.oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

      const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      this.oauth2Client.setCredentials(token);

      // 🔄 RENOVACIÓN AUTOMÁTICA: Guardar tokens cuando se renuevan
      this.oauth2Client.on('tokens', (tokens) => {
        logger.info('🔄 Token de Google Calendar renovado automáticamente');

        // Si hay refresh_token nuevo, guardarlo (rara vez cambia)
        if (tokens.refresh_token) {
          const currentTokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
          currentTokens.refresh_token = tokens.refresh_token;
          fs.writeFileSync(tokenPath, JSON.stringify(currentTokens, null, 2));
        }

        // Siempre guardar el nuevo access_token
        const currentTokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        currentTokens.access_token = tokens.access_token;
        currentTokens.expiry_date = tokens.expiry_date;
        fs.writeFileSync(tokenPath, JSON.stringify(currentTokens, null, 2));

        logger.info('💾 Nuevo token guardado en token.json');
      });

      this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      logger.info('✅ Google Calendar inicializado con renovación automática de tokens');
    } catch (error) {
      logger.warn('⚠️ Google Calendar no configurado. Usar modo simulación.');
      logger.error('Detalle del error:', error);
    }
  }

  async checkRoomAvailability(checkIn: string, checkOut: string, totalRooms: number = 10): Promise<RoomAvailability> {
    try {
      const checkInISO = `${checkIn}T14:00:00-05:00`;
      const checkOutISO = `${checkOut}T12:00:00-05:00`;

      const response = await this.calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        timeMin: checkInISO,
        timeMax: checkOutISO,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const bookedRooms = response.data.items?.length || 0;
      const availableRooms = Math.max(0, totalRooms - bookedRooms);

      logger.info(`🏨 Disponibilidad: ${availableRooms}/${totalRooms} habitaciones`);

      return {
        date: checkIn,
        availableRooms,
        totalRooms,
        isAvailable: availableRooms > 0
      };
    } catch (error) {
      logger.error('❌ Error verificando disponibilidad:', error);
      return {
        date: checkIn,
        availableRooms: totalRooms,
        totalRooms,
        isAvailable: true
      };
    }
  }

  async listEvents(params: any): Promise<any[]> {
    try {
      const response = await this.calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        ...params
      });
      return response.data.items || [];
    } catch (error) {
      logger.error('❌ Error listando eventos:', error);
      return [];
    }
  }

  async createEvent(eventData: any): Promise<any> {
    try {
      const response = await this.calendar.events.insert({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        resource: eventData,
        sendUpdates: eventData.sendUpdates || 'all'
      });
      logger.info('✅ Evento creado en Google Calendar');
      return response.data;
    } catch (error) {
      logger.error('❌ Error creando evento:', error);
      throw error;
    }
  }

  async updateEvent(eventId: string, eventData: any): Promise<any> {
    try {
      const response = await this.calendar.events.patch({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        eventId: eventId,
        resource: eventData,
        sendUpdates: 'all'
      });
      logger.info('✅ Evento actualizado en Google Calendar');
      return response.data;
    } catch (error) {
      logger.error('❌ Error actualizando evento:', error);
      throw error;
    }
  }
}

export default new GoogleCalendarService();
