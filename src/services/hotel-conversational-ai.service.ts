// ═══════════════════════════════════════════════════════════════════════════
// 🧠 SERVICIO CONVERSACIONAL PRINCIPAL - LIMA AIRPORT HOSTEL
// ═══════════════════════════════════════════════════════════════════════════
// Sistema inteligente que maneja TODAS las conversaciones del hotel:
// ✅ Reservas de habitaciones
// ✅ Consultas sobre servicios (WiFi, recojo aeropuerto, tours, etc.)
// ✅ Información de precios
// ✅ Chat general (saludos, preguntas, FAQ)

import { logger } from '../utils/logger.js';
import bookingCalendarService from './booking-calendar.service.js';
import { getSuperIntelligentPrompt } from '../config/super-intelligent-prompt.js';
// ✅ Importar configuración de IA (SOLO DeepSeek via OpenRouter)
import { openai, AI_MODELS, AI_CONFIG } from '../config/ai.js';
import type OpenAI from 'openai';
// 🔥 NUEVO: Importar Prisma para consultar agent_memory
import { prisma } from '../config/database.js';

// ─────────────────────────────────────────────────────────────────────────────
// 📋 Interfaces
// ─────────────────────────────────────────────────────────────────────────────

interface ConversationalContext {
  userMessage: string;
  conversationHistory: Array<{ role: string; content: string }>;
  subscriberId: string;
  userEmail?: string;
  platform?: string;
  // ✅ Contexto temporal completo del webhook
  currentDateTime?: {
    full: string; // "sábado, 2 de noviembre de 2025, 20:30:15"
    date: string; // "2 de noviembre de 2025"
    time: string; // "20:30"
    dayOfWeek: string; // "sábado"
    timezone: string; // "America/Lima (UTC-5)"
    isoString: string; // ISO para cálculos programáticos
  };
  subscriber?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    customFields?: Record<string, any>;
  };
}

interface IntelligentDecision {
  currentStep: number; // 1-17 del flujo de ventas
  stepName: string; // bienvenida|catalogo|pregunta_habitacion|etc.
  intentType: 'booking' | 'payment' | 'flight_info' | 'general_question';
  confidence: number; // 0.0 - 1.0
  understanding: string; // Qué entendió del mensaje
  suggestedResponse: string; // Respuesta EXACTA según el script
  customFieldsToSet: {
    estado_cliente?: 'prospecto' | 'reserva_solicitada' | 'pago_pendiente' | 'cliente_pagado';
    habitacion_solicitada?: 'individual' | 'doble' | 'triple' | 'cuadruple' | 'matrimonial' | null;
    fecha_ingreso?: string | null; // YYYY-MM-DD
    nombre_titular?: string | null;
    cantidad_personas?: number | null;
    metodo_pago_elegido?: 'yape' | 'bcp' | 'interbank' | null;
    tiene_comprobante?: 'si' | 'no';
    datos_vuelo?: string | null;
  };
  shouldTriggerFlow2: boolean; // true cuando cliente envía comprobante de pago
  needsCalendarCheck: boolean; // true cuando necesita verificar disponibilidad
  roomAvailability?: {
    available: boolean;
    roomType: string;
    dates: string[]; // Array de fechas YYYY-MM-DD
  };
}

interface ActionResult {
  success: boolean;
  response: string;
  currentStep: number;
  stepName: string;
  intentType: string;
  confidence: number;
  customFieldsToSet: {
    estado_cliente?: 'prospecto' | 'reserva_solicitada' | 'pago_pendiente' | 'cliente_pagado';
    habitacion_solicitada?: 'individual' | 'doble' | 'triple' | 'cuadruple' | 'matrimonial' | null;
    fecha_ingreso?: string | null;
    nombre_titular?: string | null;
    cantidad_personas?: number | null;
    metodo_pago_elegido?: 'yape' | 'bcp' | 'interbank' | null;
    tiene_comprobante?: 'si' | 'no';
    datos_vuelo?: string | null;
  };
  shouldTriggerFlow2: boolean;
  needsCalendarCheck: boolean;
  roomAvailability?: {
    available: boolean;
    roomType: string;
    dates: string[];
  };
}

// 🔥 NUEVA INTERFACE: Datos extraídos de agent_memory
interface AgentMemoryData {
  nombre_titular: string | null;
  fecha_ingreso: string | null;
  cantidad_personas: number | null;
  habitacion_solicitada: string | null;
  metodo_pago_elegido: string | null;
  tiene_comprobante: string | null;
  estado_cliente: string | null;
  datos_vuelo: string | null;
  cantidad_noches: number | null;
  duracion_estadia: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 Hotel Conversational AI Service
// ─────────────────────────────────────────────────────────────────────────────

export class HotelConversationalAI {
  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * 🔥 NUEVO MÉTODO: Consultar agent_memory antes de analizar el mensaje
   * ═══════════════════════════════════════════════════════════════════════════
   */
  // 🔥 MÉTODO CORREGIDO - Consulta JSONB correctamente

  // 🔥 MÉTODO CORREGIDO - Consulta JSONB correctamente
  private async getAgentMemory(subscriberId: string): Promise<AgentMemoryData> {
    try {
      logger.info(`🔍 [HOTEL AI] Consultando agent_memory para subscriber: ${subscriberId}`);

      // 🔥 QUERY CORREGIDA: SELECT del campo context (JSONB)
      const result = await prisma.$queryRaw<Array<{
        context: any; // El context es un objeto JSON
      }>>`
        SELECT context
        FROM agent_memory
        WHERE "subscriberId" = ${subscriberId}
          AND "agentType" = 'EXTRACTED_DATA'
        ORDER BY "createdAt" DESC
        LIMIT 1
      `;

      if (result.length === 0) {
        logger.info(`📭 [HOTEL AI] No hay datos previos en agent_memory para ${subscriberId}`);
        return {
          nombre_titular: null,
          fecha_ingreso: null,
          cantidad_personas: null,
          habitacion_solicitada: null,
          metodo_pago_elegido: null,
          tiene_comprobante: null,
          estado_cliente: null,
          datos_vuelo: null,
          cantidad_noches: null,
          duracion_estadia: null,
        };
      }

      // 🔥 EXTRAER valores del objeto JSON context
      const ctx = result[0].context;

      // Convertir fecha de string a formato YYYY-MM-DD si existe
      const fechaIngreso = ctx.fecha_ingreso || null;

      const memoryData: AgentMemoryData = {
        nombre_titular: ctx.nombre_titular || null,
        fecha_ingreso: fechaIngreso,
        cantidad_personas: ctx.cantidad_personas || null,
        habitacion_solicitada: ctx.habitacion_solicitada || null,
        metodo_pago_elegido: ctx.metodo_pago_elegido || null,
        tiene_comprobante: ctx.tiene_comprobante || null,
        estado_cliente: ctx.estado_cliente || null,
        datos_vuelo: ctx.datos_vuelo || null,
        cantidad_noches: ctx.cantidad_noches || null,
        duracion_estadia: ctx.duracion_estadia || null,
      };

      logger.info(`✅ [HOTEL AI] Datos recuperados de agent_memory:`, {
        nombre: memoryData.nombre_titular || 'NO TIENE',
        fecha: memoryData.fecha_ingreso || 'NO TIENE',
        cantidad: memoryData.cantidad_personas || 'NO TIENE',
        habitacion: memoryData.habitacion_solicitada || 'NO TIENE',
        noches: memoryData.cantidad_noches || memoryData.duracion_estadia || 'NO TIENE',
        pago: memoryData.metodo_pago_elegido || 'NO TIENE',
        comprobante: memoryData.tiene_comprobante || 'NO TIENE',
        estado: memoryData.estado_cliente || 'NO TIENE',
      });

      return memoryData;
    } catch (error) {
      logger.error('❌ [HOTEL AI] Error consultando agent_memory:', error);
      // Si hay error, retornar vacío (mejor que fallar toda la conversación)
      return {
        nombre_titular: null,
        fecha_ingreso: null,
        cantidad_personas: null,
        habitacion_solicitada: null,
        metodo_pago_elegido: null,
        tiene_comprobante: null,
        estado_cliente: null,
        datos_vuelo: null,
        cantidad_noches: null,
        duracion_estadia: null,
      };
    }
  }

  async analyzeMessage(context: ConversationalContext): Promise<IntelligentDecision> {
    try {
      // 🔥 NUEVO: Consultar agent_memory ANTES de analizar el mensaje
      const memoryData = await this.getAgentMemory(context.subscriberId);

      // ✅ Usar el contexto temporal del webhook (con fecha/hora/día completo)
      // Si no viene, crear uno de respaldo (aunque debería venir siempre del webhook)
      let currentTime: string;

      if (context.currentDateTime?.full) {
        currentTime = context.currentDateTime.full;
        logger.info(`📅 [HOTEL AI] Usando contexto temporal del webhook: ${currentTime}`);
      } else {
        // Fallback: crear fecha/hora si no viene del webhook
        const now = new Date();
        currentTime = new Intl.DateTimeFormat('es-PE', {
          timeZone: 'America/Lima',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          weekday: 'long',
        }).format(now);
        logger.warn('⚠️ [HOTEL AI] No vino contexto temporal del webhook, usando fallback');
      }

      // 🔥 MEMORIA ILIMITADA: Usar TODOS los mensajes disponibles - SIN LÍMITES
      // ⚡ NUNCA se debe olvidar información ya conversada - MEMORIA PERFECTA
      const conversationContext = context.conversationHistory
        .map((msg) => `${msg.role === 'user' ? 'Huésped' : 'Recepcionista'}: ${msg.content}`)
        .join('\n');

      // ✅ Usar el prompt superinteligente adaptado para el hotel CON DATOS DE MEMORIA
      const systemPrompt = getSuperIntelligentPrompt(currentTime, conversationContext, memoryData);

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
      ];

      // 🧠 MEMORIA ILIMITADA: Agregar TODOS los mensajes sin límites
      if (context.conversationHistory && context.conversationHistory.length > 0) {
        context.conversationHistory.forEach((msg) => {
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          });
        });
      }

      // Agregar mensaje actual
      messages.push({
        role: 'user',
        content: `Analiza este mensaje y decide cómo responder:\n\n"${context.userMessage}"`,
      });

      logger.info(`🧠 [HOTEL AI] Analizando mensaje con ${AI_CONFIG.provider.toUpperCase()} (${AI_MODELS.MAIN})...`);

      const response = await openai.chat.completions.create({
        model: AI_MODELS.MAIN, // ✅ Usar modelo configurado (OpenRouter, DeepSeek, etc.)
        messages,
        temperature: AI_CONFIG.temperature.analytical, // ✅ Temperatura configurada para análisis
        response_format: { type: 'json_object' },
      });

      const decision: IntelligentDecision = JSON.parse(
        response.choices[0].message.content || '{}'
      );

      logger.info('🎯 [HOTEL AI] Decisión inteligente:', {
        intent: decision.intentType,
        confidence: decision.confidence,
        understanding: decision.understanding,
      });

      // 🔍 DEBUG TEMPORAL: Ver qué está retornando el modelo de IA
      logger.info(`🔍 [DEBUG] customFieldsToSet recibido de ${AI_MODELS.MAIN}:`,
        JSON.stringify(decision.customFieldsToSet, null, 2)
      );
      logger.info(`🔍 [DEBUG] Respuesta COMPLETA de ${AI_MODELS.MAIN}:`,
        JSON.stringify(decision, null, 2)
      );

      return decision;
    } catch (error) {
      logger.error('❌ [HOTEL AI] Error en análisis:', error);
      return {
        currentStep: 0,
        stepName: 'error',
        intentType: 'general_question',
        confidence: 0,
        understanding: 'Error al analizar mensaje',
        suggestedResponse: 'Disculpa, tuve un problema procesando tu mensaje. ¿Podrías repetir?',
        customFieldsToSet: {},
        shouldTriggerFlow2: false,
        needsCalendarCheck: false,
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ⚡ PASO 2: EJECUTAR ACCIÓN - Según la intención detectada
   * ═══════════════════════════════════════════════════════════════════════════
   */
  async executeAction(
    decision: IntelligentDecision,
    context: ConversationalContext
  ): Promise<ActionResult> {
    try {
      logger.info(`⚡ [HOTEL AI] Ejecutando acción para intent: ${decision.intentType}`);

      // ──────────────────────────────────────────────────────────────────
      // 🏨 RESERVA - Ya manejado por el flujo superinteligente
      // ──────────────────────────────────────────────────────────────────
      if (decision.intentType === 'booking') {
        logger.info('🏨 [HOTEL AI] Procesando reserva según flujo...');

        return {
          success: true,
          response: decision.suggestedResponse,
          currentStep: decision.currentStep,
          stepName: decision.stepName,
          intentType: 'booking',
          confidence: decision.confidence,
          customFieldsToSet: decision.customFieldsToSet,
          shouldTriggerFlow2: decision.shouldTriggerFlow2,
          needsCalendarCheck: decision.needsCalendarCheck,
          roomAvailability: decision.roomAvailability,
        };
      }

      // ──────────────────────────────────────────────────────────────────
      // 💳 PAGO - Cliente enviando datos de pago o comprobante
      // ──────────────────────────────────────────────────────────────────
      if (decision.intentType === 'payment') {
        logger.info('💳 [HOTEL AI] Procesando información de pago...');

        return {
          success: true,
          response: decision.suggestedResponse,
          currentStep: decision.currentStep,
          stepName: decision.stepName,
          intentType: 'payment',
          confidence: decision.confidence,
          customFieldsToSet: decision.customFieldsToSet,
          shouldTriggerFlow2: decision.shouldTriggerFlow2,
          needsCalendarCheck: decision.needsCalendarCheck,
          roomAvailability: decision.roomAvailability,
        };
      }

      // ──────────────────────────────────────────────────────────────────
      // ✈️ INFORMACIÓN DE VUELO - Cliente enviando datos de vuelo
      // ──────────────────────────────────────────────────────────────────
      if (decision.intentType === 'flight_info') {
        logger.info('✈️ [HOTEL AI] Procesando información de vuelo...');

        // 🔥 ACTUALIZAR GOOGLE CALENDAR con datos de vuelo
        try {
          // Consultar memoria para obtener nombre_titular y fecha_ingreso
          const memoryData = await this.getAgentMemory(context.subscriberId);

          if (memoryData.nombre_titular && memoryData.fecha_ingreso) {
            logger.info('📅 [HOTEL AI] Actualizando Google Calendar con datos de vuelo:', {
              titular: memoryData.nombre_titular,
              fecha: memoryData.fecha_ingreso
            });

            const updateResult = await bookingCalendarService.updateEventWithFlightData(
              memoryData.nombre_titular,
              memoryData.fecha_ingreso,
              context.userMessage
            );

            if (updateResult.success) {
              logger.info('✅ [HOTEL AI] Datos de vuelo agregados al Calendar exitosamente');
            } else {
              logger.warn('⚠️ [HOTEL AI] No se pudo actualizar Calendar:', updateResult.error);
            }
          } else {
            logger.warn('⚠️ [HOTEL AI] No hay nombre_titular o fecha_ingreso en memoria, no se puede actualizar Calendar');
          }
        } catch (error) {
          logger.error('❌ [HOTEL AI] Error al actualizar Calendar con datos de vuelo:', error);
          // Continuamos con la respuesta al usuario aunque falle la actualización
        }

        return {
          success: true,
          response: decision.suggestedResponse,
          currentStep: decision.currentStep,
          stepName: decision.stepName,
          intentType: 'flight_info',
          confidence: decision.confidence,
          customFieldsToSet: decision.customFieldsToSet,
          shouldTriggerFlow2: decision.shouldTriggerFlow2,
          needsCalendarCheck: decision.needsCalendarCheck,
          roomAvailability: decision.roomAvailability,
        };
      }

      // ──────────────────────────────────────────────────────────────────
      // ❓ PREGUNTA GENERAL - Cualquier otra consulta
      // ──────────────────────────────────────────────────────────────────
      return {
        success: true,
        response: decision.suggestedResponse,
        currentStep: decision.currentStep,
        stepName: decision.stepName,
        intentType: 'general_question',
        confidence: decision.confidence,
        customFieldsToSet: decision.customFieldsToSet,
        shouldTriggerFlow2: decision.shouldTriggerFlow2,
        needsCalendarCheck: decision.needsCalendarCheck,
        roomAvailability: decision.roomAvailability,
      };
    } catch (error) {
      logger.error('❌ [HOTEL AI] Error ejecutando acción:', error);
      return {
        success: false,
        response: 'Disculpa, tuve un problema. ¿Podrías intentar de nuevo?',
        currentStep: 0,
        stepName: 'error',
        intentType: decision.intentType,
        confidence: 0,
        customFieldsToSet: {},
        shouldTriggerFlow2: false,
        needsCalendarCheck: false,
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * 🚀 MÉTODO PRINCIPAL - Procesar cualquier mensaje
   * ═══════════════════════════════════════════════════════════════════════════
   */
  async processMessage(context: ConversationalContext): Promise<ActionResult> {
    logger.info('🚀 [HOTEL AI] Iniciando procesamiento de mensaje hotelero');

    try {
      // Paso 1: Analizar mensaje y detectar intención
      const decision = await this.analyzeMessage(context);

      // Paso 2: Ejecutar acción según intención
      const result = await this.executeAction(decision, context);

      logger.info('✅ [HOTEL AI] Procesamiento completado:', {
        intent: result.intentType,
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error('❌ [HOTEL AI] Error en procesamiento:', error);
      return {
        success: false,
        response: 'Disculpa, tuve un problema procesando tu mensaje. ¿Podrías repetir?',
        currentStep: 0,
        stepName: 'error',
        intentType: 'error',
        confidence: 0,
        customFieldsToSet: {},
        shouldTriggerFlow2: false,
        needsCalendarCheck: false,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎯 Singleton Instance
// ─────────────────────────────────────────────────────────────────────────────

export const hotelConversationalAI = new HotelConversationalAI();
