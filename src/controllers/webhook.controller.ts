// ═══════════════════════════════════════════════════════════════════════════
// 🎯 WEBHOOK CONTROLLER V9.1 - CONVERSACIÓN NATURAL CON PROCESO DE PENSAMIENTO
// ═══════════════════════════════════════════════════════════════════════════
// PATRÓN PROFESIONAL CON IA SUPERINTELIGENTE:
// 1. Webhook responde 200 OK inmediatamente (sin contenido)
// 2. Backend espera 15 segundos para concatenar mensajes
// 3. Backend guarda TODOS los mensajes en BD (historial completo)
// 4. Backend recupera últimos 200 mensajes de conversación
// 5. Backend envía últimos 100 mensajes a IA como contexto
// 6. Backend verifica disponibilidad en Google Calendar
// 7. IA DECIDE cuándo enviar catálogo (basándose en historial de BD)
// 8. Backend setea custom fields del flujo de ventas
// 9. Backend activa Flow principal con respuesta de IA
//
// VENTAJAS:
// - ✅ Sin timeout de ManyChat (webhook ya respondió)
// - ✅ Sin límite de ventana 24h (usa Flows, no Send API)
// - ✅ Usuario puede escribir múltiples mensajes rápido
// - ✅ Memoria completa de conversación en BD
// - ✅ Disponibilidad real de Google Calendar
// - ✅ IA 100% inteligente (decide basándose en historial)
// - ✅ Sin custom fields innecesarios en ManyChat
// - ✅ Patrón profesional y escalable

import { Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger.js';
import { hotelConversationalAI } from '../services/hotel-conversational-ai.service.js';
import { manychatAPI } from '../services/manychat-api.service.js';
import { prisma } from '../config/database.js';
import googleCalendar from '../services/google-calendar.service.js';
import redisMessageQueue from '../services/redis-message-queue.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

interface ManyChatWebhookPayload {
  subscriber_id: string;
  text?: string;
  user_message?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  platform?: string;
  custom_fields?: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📨 WEBHOOK PRINCIPAL DE MANYCHAT
// ═══════════════════════════════════════════════════════════════════════════

export async function handleManyChatWebhook(req: Request, res: Response) {
  try {
    const payload: ManyChatWebhookPayload = req.body;

    logger.info('📥 Webhook V3 recibido de ManyChat');
    logger.info(JSON.stringify(payload, null, 2));

    // Aceptar tanto text como user_message
    const messageText = payload.text || payload.user_message;

    // Validar datos mínimos
    if (!payload.subscriber_id || !messageText) {
      logger.warn('⚠️ Payload incompleto - subscriber_id o mensaje faltante');
      return res.status(200).json({
        version: 'v2',
        content: {
          messages: []
        }
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // 1. Responder INMEDIATAMENTE con 200 OK (Decouple Response Pattern)
    // ─────────────────────────────────────────────────────────────────
    res.status(200).json({
      version: 'v2',
      content: {
        messages: [] // Sin contenido - responderemos después via sendFlow
      }
    });
    logger.info('✅ Webhook respondió 200 OK inmediatamente');

    // ─────────────────────────────────────────────────────────────────
    // 2. Sistema de concatenación con Redis + Debounce (10 segundos)
    // ─────────────────────────────────────────────────────────────────
    const subscriberId = payload.subscriber_id;

    // Agregar mensaje a Redis - el servicio maneja el debounce automáticamente
    await redisMessageQueue.addMessage(
      subscriberId,
      messageText,
      payload,
      async () => {
        // Este callback se ejecuta después de 10s sin nuevos mensajes
        await processQueuedMessagesAndSendViaFlow(subscriberId);
      }
    );

    return;
  } catch (error: any) {
    logger.error('❌ Error en webhook V3:', error);
    return res.status(200).json({
      version: 'v2',
      content: {
        messages: []
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 PROCESAR MENSAJES EN COLA Y ENVIAR VÍA SENDFLOW
// ═══════════════════════════════════════════════════════════════════════════

async function processQueuedMessagesAndSendViaFlow(subscriberId: string) {
  // Obtener mensajes de Redis (esto también los elimina de la cola)
  const queueData = await redisMessageQueue.getAndClearMessages(subscriberId);
  if (!queueData) {
    logger.warn(`⚠️ No hay mensajes en cola para ${subscriberId} o aún no es tiempo`);
    return;
  }

  const startTime = Date.now();
  logger.info(`🚀 Procesando ${queueData.messages.length} mensaje(s) concatenado(s)`);

  try {
    // ─────────────────────────────────────────────────────────────────
    // 1. Concatenar todos los mensajes
    // ─────────────────────────────────────────────────────────────────
    const concatenatedMessage = queueData.messages.map((m) => m.text).join('\n');
    logger.info(`📝 Mensaje concatenado: "${concatenatedMessage}"`);

    // ─────────────────────────────────────────────────────────────────
    // 2. GUARDAR o ACTUALIZAR SUBSCRIBER EN BD
    // ─────────────────────────────────────────────────────────────────
    const subscriber = await prisma.subscriber.upsert({
      where: { subscriberId: queueData.payload.subscriber_id },
      create: {
        subscriberId: queueData.payload.subscriber_id,
        platform: (queueData.payload.platform?.toUpperCase() as any) || 'WHATSAPP',
        firstName: queueData.payload.first_name,
        lastName: queueData.payload.last_name,
        email: queueData.payload.email,
        phone: queueData.payload.phone,
        customFields: queueData.payload.custom_fields || {},
      },
      update: {
        firstName: queueData.payload.first_name,
        lastName: queueData.payload.last_name,
        email: queueData.payload.email,
        phone: queueData.payload.phone,
        customFields: queueData.payload.custom_fields || {},
        lastActiveAt: new Date(),
      },
    });

    // ─────────────────────────────────────────────────────────────────
    // 3. OBTENER o CREAR CONVERSACIÓN ACTIVA
    // ─────────────────────────────────────────────────────────────────
    let conversation = await prisma.conversation.findFirst({
      where: {
        subscriberId: subscriber.id,
        isActive: true,
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          subscriberId: subscriber.id,
          topic: 'Consulta de habitación',
        },
      });
      logger.info(`🆕 Nueva conversación creada: ${conversation.id}`);
    }

    // ─────────────────────────────────────────────────────────────────
    // 4. GUARDAR MENSAJE DEL USUARIO EN BD
    // ─────────────────────────────────────────────────────────────────
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        messageType: 'TEXT',
        content: concatenatedMessage,
      },
    });

    // ─────────────────────────────────────────────────────────────────
    // 5. RECUPERAR HISTORIAL COMPLETO - MEMORIA ILIMITADA 🧠♾️
    // ─────────────────────────────────────────────────────────────────
    // ⚡ TODOS los mensajes - sin límites - memoria perfecta
    const messageHistory = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      // 🔥 SIN LÍMITE - recupera TODOS los mensajes de la conversación
    });

    logger.info(`💾 Historial COMPLETO recuperado: ${messageHistory.length} mensajes`);

    // ─────────────────────────────────────────────────────────────────
    // 6. PREPARAR TODOS LOS MENSAJES PARA IA - SIN LÍMITES
    // ─────────────────────────────────────────────────────────────────
    // 🧠 MEMORIA ILIMITADA: Enviar TODOS los mensajes, no solo los últimos
    const recentHistory = messageHistory
      .map((msg: any) => ({
        role: msg.role === 'USER' ? 'user' : 'assistant',
        content: msg.content,
      }));

    logger.info(`🧠 Enviando TODOS los ${recentHistory.length} mensajes a IA (MEMORIA ILIMITADA)`);

    // ─────────────────────────────────────────────────────────────────
    // 7. CONSULTAR DISPONIBILIDAD EN GOOGLE CALENDAR (SIEMPRE)
    // ─────────────────────────────────────────────────────────────────
    // La IA decide si usa esta información o no basándose en el contexto
    let availability = null;

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 2);
      const dayAfterStr = dayAfter.toISOString().split('T')[0];

      availability = await googleCalendar.checkRoomAvailability(
        tomorrowStr,
        dayAfterStr,
        10 // Total de habitaciones
      );

      logger.info(`🏨 Disponibilidad consultada: ${availability.availableRooms}/${availability.totalRooms}`);
      logger.info(`   IA decidirá si menciona esta información`);
    } catch (error) {
      logger.warn('⚠️ Error verificando disponibilidad, continuando sin ella:', error);
    }

    // ─────────────────────────────────────────────────────────────────
    // 7.5. 🧠 RECUPERAR MEMORIA DE LA IA (Datos guardados de sesiones anteriores)
    // ─────────────────────────────────────────────────────────────────
    logger.info('🧠 Recuperando datos guardados de agent_memory...');
    const savedMemory = await prisma.agentMemory.findUnique({
      where: {
        subscriberId_agentType: {
          subscriberId: subscriber.id,
          agentType: 'EXTRACTED_DATA'
        }
      }
    });

    // 🔥 MEZCLAR custom fields del webhook CON datos guardados en memoria
    // Prioridad: datos guardados (porque son más completos) > datos del webhook
    const combinedCustomFields = {
      ...(savedMemory?.context as Record<string, any> || {}), // Datos guardados de sesiones anteriores
      ...(queueData.payload.custom_fields || {}), // Datos del webhook actual (si los trae)
    };

    if (Object.keys(combinedCustomFields).length > 0) {
      logger.info(`✅ Custom fields recuperados: ${Object.keys(combinedCustomFields).length} campos`);
      logger.info(`   📋 Campos disponibles: ${Object.keys(combinedCustomFields).join(', ')}`);
      logger.info(`   🔍 Valores: ${JSON.stringify(combinedCustomFields, null, 2)}`);
    } else {
      logger.info('ℹ️ No hay custom fields guardados aún (primera interacción)');
    }

    // ─────────────────────────────────────────────────────────────────
    // 8. CONSTRUIR CONTEXTO COMPLETO PARA IA
    // ─────────────────────────────────────────────────────────────────
    // 8.1. Obtener información temporal completa (zona horaria de Lima, Perú)
    const now = new Date();
    const limaOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };

    const dateFormatter = new Intl.DateTimeFormat('es-PE', limaOptions);
    const currentDateTime = dateFormatter.format(now);

    // Obtener componentes individuales para facilitar cálculos
    const limaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const dayOfWeek = limaDate.toLocaleDateString('es-PE', { weekday: 'long', timeZone: 'America/Lima' });
    const dateOnly = limaDate.toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Lima' });
    const timeOnly = limaDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

    const context = {
      userMessage: concatenatedMessage,
      conversationHistory: recentHistory,
      subscriberId: subscriber.id, // ✅ UUID interno, NO el ID de ManyChat
      userEmail: queueData.payload.email,
      platform: queueData.payload.platform || 'whatsapp',
      availability, // Info de disponibilidad real
      // ✅ NUEVO: Contexto temporal completo
      currentDateTime: {
        full: currentDateTime, // "sábado, 2 de noviembre de 2025, 20:30:15"
        date: dateOnly, // "2 de noviembre de 2025"
        time: timeOnly, // "20:30"
        dayOfWeek, // "sábado"
        timezone: 'America/Lima (UTC-5)',
        isoString: now.toISOString(), // Para cálculos programáticos
      },
      subscriber: {
        firstName: queueData.payload.first_name,
        lastName: queueData.payload.last_name,
        email: queueData.payload.email,
        phone: queueData.payload.phone,
        customFields: combinedCustomFields, // ✅ AHORA INCLUYE MEMORIA DE SESIONES ANTERIORES
      },
    };

    // ─────────────────────────────────────────────────────────────────
    // 9. PROCESAR CON IA
    // ─────────────────────────────────────────────────────────────────
    logger.info('🤖 Procesando con IA...');
    const aiResponse = await hotelConversationalAI.processMessage(context);

    const processingTime = Date.now() - startTime;
    logger.info(`✅ Respuesta generada en ${processingTime}ms`);

    // ─────────────────────────────────────────────────────────────────
    // 10. GUARDAR RESPUESTA DE IA EN BD
    // ─────────────────────────────────────────────────────────────────
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        messageType: 'TEXT',
        content: aiResponse.response,
        aiAgent: 'hotel-receptionist',
        processingTime,
      },
    });

    // ─────────────────────────────────────────────────────────────────
    // 11. GUARDAR DATOS EXTRAÍDOS EN AGENT_MEMORY (PostgreSQL)
    // ─────────────────────────────────────────────────────────────────
    logger.info(`📝 Paso actual: ${aiResponse.currentStep} - ${aiResponse.stepName}`);

    // Obtener datos extraídos por la IA
    const customFields = aiResponse.customFieldsToSet;

    if (customFields && Object.keys(customFields).length > 0) {
      // 🔒 FILTRAR VALORES NULL ANTES DE GUARDAR
      const fieldsToSet = Object.entries(customFields).filter(
        ([key, value]) => value !== null && value !== undefined && value !== ''
      );

      logger.info(`🔍 Datos válidos a guardar: ${fieldsToSet.length}/${Object.keys(customFields).length} campos`);

      // ═══════════════════════════════════════════════════════════════
      // 💾 GUARDAR EN POSTGRESQL agent_memory
      // ═══════════════════════════════════════════════════════════════
      if (fieldsToSet.length > 0) {
        const allExtractedData = Object.fromEntries(fieldsToSet);
        const maxRetries = 3;
        let saveSuccess = false;

        logger.info('💾 Guardando datos extraídos en agent_memory (PostgreSQL)...', {
          subscriberId: subscriber.id,
          subscriberIdManyChat: subscriber.subscriberId,
          fieldsCount: Object.keys(allExtractedData).length,
          fields: Object.keys(allExtractedData)
        });

        for (let attempt = 1; attempt <= maxRetries && !saveSuccess; attempt++) {
          try {
            if (attempt > 1) {
              logger.info(`🔄 Reintento ${attempt}/${maxRetries} de guardado en agent_memory...`);
              await new Promise(resolve => setTimeout(resolve, 500 * attempt)); // Backoff exponencial
            }

            const savedMemory = await prisma.agentMemory.upsert({
              where: {
                subscriberId_agentType: {
                  subscriberId: subscriber.id, // UUID del subscriber
                  agentType: 'EXTRACTED_DATA'
                }
              },
              create: {
                subscriberId: subscriber.id,
                agentType: 'EXTRACTED_DATA',
                context: allExtractedData,
                summary: `Datos extraídos: ${Object.keys(allExtractedData).join(', ')}`
              },
              update: {
                context: allExtractedData,
                summary: `Datos extraídos: ${Object.keys(allExtractedData).join(', ')}`,
                createdAt: new Date() // Actualizar timestamp explícitamente
              }
            });

            // ✅ VERIFICACIÓN POST-SAVE: Confirmar que se guardó correctamente
            const verification = await prisma.agentMemory.findUnique({
              where: {
                subscriberId_agentType: {
                  subscriberId: subscriber.id,
                  agentType: 'EXTRACTED_DATA'
                }
              }
            });

            if (!verification) {
              throw new Error('VERIFICACIÓN FALLÓ: agent_memory no encontrado después de upsert');
            }

            const verificationFieldsCount = Object.keys(verification.context as object).length;
            if (verificationFieldsCount !== Object.keys(allExtractedData).length) {
              throw new Error(
                `VERIFICACIÓN FALLÓ: Campos guardados (${verificationFieldsCount}) ≠ Campos esperados (${Object.keys(allExtractedData).length})`
              );
            }

            logger.info(`✅ Respaldo en agent_memory guardado y VERIFICADO:`, {
              id: savedMemory.id,
              subscriberId: savedMemory.subscriberId,
              fieldsCount: Object.keys(allExtractedData).length,
              fields: Object.keys(allExtractedData),
              timestamp: savedMemory.createdAt,
              attempt: attempt
            });

            saveSuccess = true;

          } catch (backupError: any) {
            const isLastAttempt = attempt === maxRetries;
            logger.error(`❌ ERROR en agent_memory (intento ${attempt}/${maxRetries}):`, {
              error: backupError?.message || backupError,
              subscriberId: subscriber.id,
              stack: backupError?.stack,
              isLastAttempt
            });

            if (isLastAttempt) {
              logger.error('❌ CRÍTICO: Falló guardado en agent_memory después de 3 intentos');
              logger.error('   Los datos extraídos se PERDIERON:', Object.keys(allExtractedData));
            }
          }
        }

        if (!saveSuccess) {
          logger.error('🚨 FALLO TOTAL: No se pudo guardar en agent_memory después de todos los reintentos');
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // 12. DECIDIR QUÉ FLOW ACTIVAR (Flow Principal o Flow Post-Pago)
    // ─────────────────────────────────────────────────────────────────
    logger.info('📤 Decidiendo qué flow activar...');

    const platform = queueData.payload.platform?.toLowerCase() || 'whatsapp';
    let flowId: string;
    let flowType: string;

    // 🎯 LA IA DECIDE TODO (conversación 100% natural)
    // La IA analiza contexto completo y responde naturalmente
    let finalResponse = aiResponse.response;

    // 🎯 LÓGICA SIMPLIFICADA DE RESPUESTA:
    // ✅ Todos los casos usan sendFlow (compatible con WhatsApp)
    // ✅ La IA maneja conversaciones de reserva naturalmente
    if (aiResponse.shouldTriggerFlow2) {
      // ═══════════════════════════════════════════════════════════════
      // CASO 1: Cliente envió comprobante → ENVIAR VÍA SENDFLOW
      // ═══════════════════════════════════════════════════════════════
      flowId = getFlowIdForPlatform(platform);
      flowType = 'RESPUESTA POST-PAGO VÍA FLOW';
      logger.info(`🔔 ${flowType} - ¡Cliente envió comprobante!`);
      logger.info(`📱 Enviando mensaje completo vía sendFlow (compatible WhatsApp)`);

      // Enviar el mensaje completo que ya generó la IA (incluye ambas partes)
      const flowActivated = await manychatAPI.sendFlow(
        subscriberId,
        flowId,
        finalResponse // Ya contiene toda la info de vuelo + instrucciones
      );

      if (flowActivated) {
        logger.info(`✅ Mensaje post-pago enviado exitosamente vía Flow`);
        logger.info(`   • Guardado en PostgreSQL automáticamente`);
      } else {
        logger.error(`❌ Error al enviar mensaje post-pago`);
      }

    } else {
      // ═══════════════════════════════════════════════════════════════
      // CASO 2: Respuesta conversacional (incluye reservas, consultas, etc.)
      // ═══════════════════════════════════════════════════════════════
      flowId = getFlowIdForPlatform(platform);
      flowType = 'FLOW CONVERSACIONAL';
      logger.info(`💬 ACTIVANDO ${flowType} - La IA maneja la conversación naturalmente`);
      logger.info(`📱 Plataforma: ${platform.toUpperCase()} → Flow ID: ${flowId}`);

      // Activar flow con respuesta de IA
      const flowActivated = await manychatAPI.sendFlow(
        subscriberId,
        flowId,
        finalResponse
      );

      if (flowActivated) {
        logger.info(`✅ ${flowType} activado exitosamente`);
      } else {
        logger.error(`❌ Error al activar ${flowType}`);
      }
    }

    logger.info('✅ Procesamiento completado con memoria completa');

    // Redis ya limpió los mensajes al llamar getAndClearMessages()
  } catch (error: any) {
    logger.error('❌ Error procesando mensajes en cola:', error);

    // Intentar enviar mensaje de error via sendTextMessage (fallback)
    try {
      await manychatAPI.sendTextMessage(
        subscriberId,
        'Disculpa, tuve un problema técnico. ¿Podrías repetir tu mensaje?'
      );
    } catch (fallbackError) {
      logger.error('❌ Falló también el mensaje de error:', fallbackError);
    }

    // Redis ya limpió los mensajes al llamar getAndClearMessages()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Obtener Flow ID según plataforma
// ─────────────────────────────────────────────────────────────────────────────

function getFlowIdForPlatform(platform: string): string {
  switch (platform) {
    case 'instagram':
      return process.env.MANYCHAT_RESPONSE_FLOW_INSTAGRAM || 'INSTAGRAM_FLOW_ID';
    case 'messenger':
    case 'facebook':
      return process.env.MANYCHAT_RESPONSE_FLOW_MESSENGER || 'MESSENGER_FLOW_ID';
    case 'telegram':
      return process.env.MANYCHAT_RESPONSE_FLOW_TELEGRAM || 'TELEGRAM_FLOW_ID';
    case 'whatsapp':
    default:
      return process.env.MANYCHAT_RESPONSE_FLOW_NS || 'WHATSAPP_FLOW_ID_DEFAULT';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏥 HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

export function healthCheck(req: Request, res: Response) {
  return res.json({
    status: 'OK',
    service: 'Lima Airport Hostel AI',
    timestamp: new Date().toISOString(),
    version: '5.0.0 - sendContent API',
    pattern: 'sendContent API (envío directo de texto + imágenes)',
  });
}
