// ═══════════════════════════════════════════════════════════════════════════
// 🏨 SERVICIO DE GESTIÓN DE RESERVAS HOTELERAS - LIMA AIRPORT HOSTEL
// ═══════════════════════════════════════════════════════════════════════════
// Gestiona reservas de habitaciones y las sincroniza con Google Calendar

import { logger } from '../utils/logger.js';
import googleCalendarService from './google-calendar.service.js';
// ✅ Importar configuración de IA (SOLO DeepSeek via OpenRouter)
import { openai, AI_MODELS, AI_CONFIG } from '../config/ai.js';
import type OpenAI from 'openai'; // ✅ Import de tipos para ChatCompletionMessageParam

// ═══════════════════════════════════════════════════════════════════════════
// 📋 INTERFACES Y TIPOS
// ═══════════════════════════════════════════════════════════════════════════

type ReservationType = 'cuadruple' | 'triple' | 'doble' | 'matrimonial' | 'individual';

interface BookingIntentResult {
  hasBookingIntent: boolean;
  bookingDetails?: {
    roomType: ReservationType;
    guestName: string;
    guestEmail?: string;
    guestPhone?: string;
    checkInDate: string; // ISO format YYYY-MM-DD
    checkOutDate: string; // ISO format YYYY-MM-DD
    numberOfGuests: number;
    needsAirportPickup?: boolean;
    specialRequests?: string;
  };
  extractedInfo?: string;
}

interface BookingConfirmation {
  success: boolean;
  eventUrl?: string;
  reservationCode?: string;
  checkInDate?: string;
  checkOutDate?: string;
  totalNights?: number;
  totalPrice?: {
    usd: number;
    pen: number;
  };
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 💰 PRECIOS DE HABITACIONES (desde .env)
// ═══════════════════════════════════════════════════════════════════════════
const ROOM_PRICES = {
  cuadruple: {
    usd: parseFloat(process.env.PRECIO_CUADRUPLE_USD || '55'),
    pen: parseFloat(process.env.PRECIO_CUADRUPLE_PEN || '200'),
  },
  triple: {
    usd: parseFloat(process.env.PRECIO_TRIPLE_USD || '49'),
    pen: parseFloat(process.env.PRECIO_TRIPLE_PEN || '180'),
  },
  doble: {
    usd: parseFloat(process.env.PRECIO_DOBLE_USD || '44'),
    pen: parseFloat(process.env.PRECIO_DOBLE_PEN || '160'),
  },
  matrimonial: {
    usd: parseFloat(process.env.PRECIO_MATRIMONIAL_USD || '38'),
    pen: parseFloat(process.env.PRECIO_MATRIMONIAL_PEN || '140'),
  },
  individual: {
    usd: parseFloat(process.env.PRECIO_INDIVIDUAL_USD || '38'),
    pen: parseFloat(process.env.PRECIO_INDIVIDUAL_PEN || '140'),
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔢 FUNCIÓN AUXILIAR: GENERAR CÓDIGO DE RESERVA
// ═══════════════════════════════════════════════════════════════════════════
function generateReservationCode(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');

  return `LAH-${year}${month}-${random}`; // LAH = Lima Airport Hostel
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔢 FUNCIÓN AUXILIAR: CALCULAR NÚMERO DE NOCHES
// ═══════════════════════════════════════════════════════════════════════════
function calculateNights(checkIn: string, checkOut: string): number {
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  const diffTime = Math.abs(checkOutDate.getTime() - checkInDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

class BookingCalendarService {
  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * 🔍 DETECTAR INTENCIÓN DE RESERVA
   * ═══════════════════════════════════════════════════════════════════════════
   */
  async detectBookingIntent(
    userMessage: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<BookingIntentResult> {
    try {
      const now = new Date();
      const peruTime = new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'long',
      }).format(now);

      const systemPrompt = `Eres un asistente experto en detectar intenciones de reserva de habitaciones de hotel.

FECHA Y HORA ACTUAL EN PERÚ (America/Lima):
${peruTime}

Tu trabajo es analizar el mensaje del usuario para determinar si quiere reservar una habitación en el Lima Airport Hostel.

TIPOS DE HABITACIONES DISPONIBLES:
1. Cuádruple - 4 personas, baño privado - $55 USD / S/200
2. Triple - 3 personas, baño privado - $49 USD / S/180
3. Doble - 2 personas, baño privado - $44 USD / S/160
4. Matrimonial - 1 cama grande, baño privado - $38 USD / S/140
5. Individual - 1 persona, baño privado - $38 USD / S/140

PALABRAS CLAVE DE RESERVA:
- reservar, reserva, booking, book
- quiero, necesito, busco una habitación
- check-in, check in, llegada, entrada
- check-out, check out, salida
- cuántas noches, días, estadía

EXTRACCIÓN DE DATOS:
1. Tipo de habitación (cuadruple|triple|doble|matrimonial|individual)
2. Nombre del huésped
3. Fecha de check-in (convertir a formato ISO YYYY-MM-DD)
4. Fecha de check-out (convertir a formato ISO YYYY-MM-DD)
5. Número de huéspedes (número entero)
6. Email (si lo menciona)
7. Teléfono (si lo menciona)
8. Necesita recojo del aeropuerto? (true/false)
9. Solicitudes especiales (cualquier pedido especial)

CONVERSIÓN DE FECHAS:
- "hoy" → fecha actual
- "mañana" → fecha actual + 1 día
- "lunes próximo", "martes", etc. → próximo día de esa semana
- "del 1 al 5 de febrero" → check-in: 2025-02-01, check-out: 2025-02-05

IMPORTANTE:
- Si no menciona todas las fechas, aún detecta la intención pero marca needsMoreInfo
- Si menciona "desde el aeropuerto" o "llegando al aeropuerto", asume needsAirportPickup: true

Responde en JSON:
{
  "hasBookingIntent": true/false,
  "bookingDetails": {
    "roomType": "cuadruple|triple|doble|matrimonial|individual",
    "guestName": "Nombre del huésped",
    "guestEmail": "email@ejemplo.com",
    "guestPhone": "+51 999 999 999",
    "checkInDate": "2025-01-28",
    "checkOutDate": "2025-01-30",
    "numberOfGuests": 2,
    "needsAirportPickup": true/false,
    "specialRequests": "Texto de solicitudes especiales"
  },
  "extractedInfo": "Resumen de lo que entendiste"
}`;

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
      ];

      if (conversationHistory && conversationHistory.length > 0) {
        conversationHistory.slice(-5).forEach((msg) => {
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          });
        });
      }

      messages.push({
        role: 'user',
        content: `Analiza este mensaje y determina si quiere reservar:\n\n"${userMessage}"`,
      });

      const response = await openai.chat.completions.create({
        model: AI_MODELS.MINI, // ✅ Usar modelo configurado (más barato para análisis simple)
        messages,
        temperature: AI_CONFIG.temperature.analytical, // ✅ Temperatura configurada para análisis
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      logger.info('🏨 Detección de intención de reserva:', result);

      return result;
    } catch (error) {
      logger.error('❌ Error al detectar intención de reserva:', error);
      return { hasBookingIntent: false };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * 📅 VERIFICAR DISPONIBILIDAD DE HABITACIÓN
   * ═══════════════════════════════════════════════════════════════════════════
   */
  async checkRoomAvailability(
    roomType: ReservationType,
    checkInDate: string,
    checkOutDate: string
  ): Promise<boolean> {
    try {
      const checkInISO = `${checkInDate}T15:00:00-05:00`; // Check-in a las 3 PM
      const checkOutISO = `${checkOutDate}T12:00:00-05:00`; // Check-out a las 12 PM

      // Buscar reservas existentes que se solapen
      const events = await googleCalendarService.listEvents({
        timeMin: new Date(checkInISO).toISOString(),
        timeMax: new Date(checkOutISO).toISOString(),
        maxResults: 100,
      });

      // Filtrar por tipo de habitación
      const roomTypeReservations = events.filter((event: any) => {
        const summary = (event.summary || '').toLowerCase();
        return summary.includes(roomType.toLowerCase());
      });

      logger.info(
        `🔍 Disponibilidad ${roomType}: ${roomTypeReservations.length} reservas existentes en el rango`
      );

      // Si hay reservas, la habitación no está disponible
      // NOTA: En producción, deberías tener múltiples habitaciones del mismo tipo
      // y verificar cuántas están ocupadas vs. cuántas tienes disponibles
      return roomTypeReservations.length === 0;
    } catch (error) {
      logger.error('❌ Error al verificar disponibilidad:', error);
      return false;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ➕ CREAR RESERVA Y EVENTO EN GOOGLE CALENDAR
   * ═══════════════════════════════════════════════════════════════════════════
   */
  async createReservation(
    bookingDetails: BookingIntentResult['bookingDetails']
  ): Promise<BookingConfirmation> {
    try {
      if (!bookingDetails) {
        return {
          success: false,
          error: 'No se proporcionaron detalles de la reserva',
        };
      }

      // Verificar disponibilidad
      const isAvailable = await this.checkRoomAvailability(
        bookingDetails.roomType,
        bookingDetails.checkInDate,
        bookingDetails.checkOutDate
      );

      if (!isAvailable) {
        return {
          success: false,
          error: `La habitación ${bookingDetails.roomType} no está disponible para esas fechas`,
        };
      }

      // Generar código de reserva
      const reservationCode = generateReservationCode();

      // Calcular número de noches y precio total
      const totalNights = calculateNights(
        bookingDetails.checkInDate,
        bookingDetails.checkOutDate
      );

      const roomPrice = ROOM_PRICES[bookingDetails.roomType];
      const totalPriceUSD = roomPrice.usd * totalNights;
      const totalPricePEN = roomPrice.pen * totalNights;

      // Construir fechas en formato ISO para Google Calendar
      const checkInDateTime = `${bookingDetails.checkInDate}T15:00:00-05:00`; // Check-in 3 PM
      const checkOutDateTime = `${bookingDetails.checkOutDate}T12:00:00-05:00`; // Check-out 12 PM

      // Construir descripción detallada
      const description = `
═════════════════════════════════════════════════════
🏨 RESERVA LIMA AIRPORT HOSTEL
═════════════════════════════════════════════════════

📋 CÓDIGO DE RESERVA: ${reservationCode}

👤 HUÉSPED:
   Nombre: ${bookingDetails.guestName}
   ${bookingDetails.guestEmail ? `Email: ${bookingDetails.guestEmail}` : ''}
   ${bookingDetails.guestPhone ? `Teléfono: ${bookingDetails.guestPhone}` : ''}

🏠 HABITACIÓN:
   Tipo: ${bookingDetails.roomType.toUpperCase()}
   Huéspedes: ${bookingDetails.numberOfGuests} personas

📅 ESTADÍA:
   Check-in: ${new Date(checkInDateTime).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
   Check-out: ${new Date(checkOutDateTime).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
   Total noches: ${totalNights}

💰 PRECIO TOTAL:
   USD: $${totalPriceUSD}
   PEN: S/ ${totalPricePEN}

✈️ RECOJO AEROPUERTO: ${bookingDetails.needsAirportPickup ? 'SÍ (GRATIS)' : 'No solicitado'}

${bookingDetails.specialRequests ? `📝 SOLICITUDES ESPECIALES:\n   ${bookingDetails.specialRequests}` : ''}

═════════════════════════════════════════════════════
🌐 www.limaairporthostel.com
📧 info@limaairporthostel.com
📱 WhatsApp: +51 991 737 720
═════════════════════════════════════════════════════
      `.trim();

      // Crear evento en Google Calendar
      const eventData = {
        summary: `Reserva ${reservationCode} - ${bookingDetails.roomType.toUpperCase()} - ${bookingDetails.guestName}`,
        description: description,
        start: {
          dateTime: checkInDateTime,
          timeZone: 'America/Lima',
        },
        end: {
          dateTime: checkOutDateTime,
          timeZone: 'America/Lima',
        },
        attendees: bookingDetails.guestEmail
          ? [{ email: bookingDetails.guestEmail }]
          : [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 1 día antes
            { method: 'popup', minutes: 2 * 60 }, // 2 horas antes
          ],
        },
        sendUpdates: 'all',
      };

      const createdEvent = await googleCalendarService.createEvent(eventData);

      logger.info('✅ Reserva creada exitosamente:', {
        code: reservationCode,
        roomType: bookingDetails.roomType,
        nights: totalNights,
        totalUSD: totalPriceUSD,
      });

      return {
        success: true,
        eventUrl: createdEvent.htmlLink,
        reservationCode,
        checkInDate: bookingDetails.checkInDate,
        checkOutDate: bookingDetails.checkOutDate,
        totalNights,
        totalPrice: {
          usd: totalPriceUSD,
          pen: totalPricePEN,
        },
      };
    } catch (error: any) {
      logger.error('❌ Error al crear reserva:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * 🎯 PROCESO COMPLETO: DETECTAR INTENCIÓN Y CREAR RESERVA
   * ═══════════════════════════════════════════════════════════════════════════
   */
  async processBookingIntent(
    userMessage: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<{
    hasIntent: boolean;
    reservationCreated: boolean;
    bookingInfo?: BookingConfirmation;
    suggestedResponse?: string;
    needsMoreInfo?: boolean;
  }> {
    try {
      // 1. Detectar intención
      const intentResult = await this.detectBookingIntent(userMessage, conversationHistory);

      if (!intentResult.hasBookingIntent) {
        return {
          hasIntent: false,
          reservationCreated: false,
        };
      }

      // 2. Verificar si falta información
      if (
        !intentResult.bookingDetails?.checkInDate ||
        !intentResult.bookingDetails?.checkOutDate ||
        !intentResult.bookingDetails?.roomType
      ) {
        logger.info('🔍 Falta información para completar la reserva');

        let missingInfo: string[] = [];
        if (!intentResult.bookingDetails?.checkInDate) missingInfo.push('fecha de llegada');
        if (!intentResult.bookingDetails?.checkOutDate) missingInfo.push('fecha de salida');
        if (!intentResult.bookingDetails?.roomType) missingInfo.push('tipo de habitación');

        return {
          hasIntent: true,
          reservationCreated: false,
          needsMoreInfo: true,
          suggestedResponse: `Entiendo que quieres reservar. Para confirmar tu reserva necesito: ${missingInfo.join(', ')}. ¿Me los puedes proporcionar? 😊`,
        };
      }

      // 3. Crear la reserva
      const bookingResult = await this.createReservation(intentResult.bookingDetails);

      if (!bookingResult.success) {
        return {
          hasIntent: true,
          reservationCreated: false,
          suggestedResponse: `${bookingResult.error}. ¿Te gustaría intentar con otras fechas o tipo de habitación?`,
        };
      }

      // 4. Generar respuesta de confirmación
      const checkInFormatted = new Date(bookingResult.checkInDate!).toLocaleDateString('es-PE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const checkOutFormatted = new Date(bookingResult.checkOutDate!).toLocaleDateString('es-PE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      let confirmationMessage = `✅ ¡Reserva confirmada!\n\n`;
      confirmationMessage += `🎫 *Código de Reserva:* ${bookingResult.reservationCode}\n\n`;
      confirmationMessage += `🏠 *Habitación:* ${intentResult.bookingDetails.roomType.toUpperCase()}\n`;
      confirmationMessage += `📅 *Check-in:* ${checkInFormatted} a las 3:00 PM\n`;
      confirmationMessage += `📅 *Check-out:* ${checkOutFormatted} a las 12:00 PM\n`;
      confirmationMessage += `🌙 *Total noches:* ${bookingResult.totalNights}\n\n`;
      confirmationMessage += `💰 *Precio Total:*\n`;
      confirmationMessage += `   • $${bookingResult.totalPrice?.usd} USD\n`;
      confirmationMessage += `   • S/ ${bookingResult.totalPrice?.pen} PEN\n\n`;

      if (intentResult.bookingDetails.needsAirportPickup) {
        confirmationMessage += `✈️ *Recojo del Aeropuerto:* GRATIS - Incluido en tu reserva!\n`;
        confirmationMessage += `   Por favor envíanos tu vuelo para coordinar.\n\n`;
      }

      confirmationMessage += `📧 Te hemos enviado la confirmación por email.\n`;
      confirmationMessage += `🔗 *Ver reserva:* ${bookingResult.eventUrl}\n\n`;
      confirmationMessage += `¿Necesitas algo más? ¡Estamos para ayudarte! 😊`;

      return {
        hasIntent: true,
        reservationCreated: true,
        bookingInfo: bookingResult,
        suggestedResponse: confirmationMessage,
      };
    } catch (error) {
      logger.error('❌ Error al procesar intención de reserva:', error);
      return {
        hasIntent: false,
        reservationCreated: false,
      };
    }
  }
}

export default new BookingCalendarService();
