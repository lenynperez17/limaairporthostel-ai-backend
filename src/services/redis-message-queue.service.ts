// ═══════════════════════════════════════════════════════════════════════════
// 🔴 REDIS MESSAGE QUEUE SERVICE - LIMA AIRPORT HOSTEL
// ═══════════════════════════════════════════════════════════════════════════
// Servicio para manejar cola de mensajes COMPARTIDA entre workers de PM2
//
// PROBLEMA RESUELTO:
// - PM2 cluster mode (8 workers) → cada worker tiene su propia memoria
// - Map local no funciona → mensajes van a workers diferentes
// - Redis centraliza el estado → todos los workers ven los mismos mensajes
//
// FUNCIONALIDAD:
// - Almacena mensajes pendientes en Redis (compartido entre workers)
// - Maneja timeout de 2 segundos 🚀 (respuesta rápida para mejor UX)
// - Garantiza que solo un worker procese cuando expire el timeout
// - Auto-limpieza de mensajes antiguos

import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

interface QueuedMessage {
  text: string;
  timestamp: number;
}

interface MessageQueueData {
  subscriberId: string;
  messages: QueuedMessage[];
  payload: any; // ManyChatWebhookPayload original
  expiresAt: number; // Unix timestamp cuando debe procesarse
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis Message Queue Service
// ─────────────────────────────────────────────────────────────────────────────

class RedisMessageQueueService {
  private redisClient: Redis | null = null;
  private isConnected: boolean = false;
  private readonly TIMEOUT_MS = 1000; // 🚀 1 segundo - respuesta SUPER rápida
  private readonly KEY_PREFIX = 'hotel:msgqueue:'; // Prefijo para keys de Redis
  private readonly LOCK_PREFIX = 'hotel:msglock:'; // Prefijo para locks
  private readonly KEY_EXPIRY = 300; // 5 minutos de expiración en Redis
  private readonly LOCK_EXPIRY = 30; // 30 segundos de expiración para locks
  private activeTimers: Map<string, NodeJS.Timeout> = new Map(); // Timers activos por subscriber

  /**
   * Inicializa conexión a Redis
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const redisPassword = process.env.REDIS_PASSWORD || '';

      logger.info('🔴 Conectando a Redis para message queue...');

      this.redisClient = new Redis(redisUrl, {
        password: redisPassword || undefined,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      this.redisClient.on('error', (err) => {
        logger.error('❌ Redis Client Error:', err);
        this.isConnected = false;
      });

      this.redisClient.on('connect', () => {
        logger.info('✅ Redis conectado exitosamente');
        this.isConnected = true;
      });

      this.redisClient.on('ready', () => {
        this.isConnected = true;
        logger.info('✅ RedisMessageQueue service inicializado');
      });

      // ioredis se conecta automáticamente
    } catch (error) {
      logger.error('❌ Error conectando a Redis:', error);
      this.isConnected = false;
    }
  }

  /**
   * 🔒 Intenta adquirir un lock distribuido en Redis
   * Retorna true si adquirió el lock, false si otro worker ya lo tiene
   */
  private async acquireLock(subscriberId: string): Promise<boolean> {
    if (!this.redisClient) return false;

    try {
      const lockKey = this.LOCK_PREFIX + subscriberId;
      const workerId = process.pid.toString(); // ID único de este worker

      // SET NX (set if not exists) con expiración automática
      const result = await this.redisClient.set(
        lockKey,
        workerId,
        'EX',
        this.LOCK_EXPIRY,
        'NX'
      );

      if (result === 'OK') {
        logger.info(`🔒 Lock adquirido por worker ${workerId} para ${subscriberId}`);
        return true;
      } else {
        logger.info(`⏭️  Otro worker ya tiene el lock para ${subscriberId}`);
        return false;
      }
    } catch (error) {
      logger.error('❌ Error adquiriendo lock:', error);
      return false;
    }
  }

  /**
   * 🔓 Libera el lock distribuido
   */
  private async releaseLock(subscriberId: string): Promise<void> {
    if (!this.redisClient) return;

    try {
      const lockKey = this.LOCK_PREFIX + subscriberId;
      await this.redisClient.del(lockKey);
      logger.info(`🔓 Lock liberado para ${subscriberId}`);
    } catch (error) {
      logger.error('❌ Error liberando lock:', error);
    }
  }

  /**
   * Agrega un mensaje a la cola Y maneja el timer de debounce
   * Retorna callback para procesamiento cuando expire el tiempo
   */
  async addMessage(
    subscriberId: string,
    messageText: string,
    payload: any,
    processCallback: () => Promise<void>
  ): Promise<void> {
    if (!this.isConnected || !this.redisClient) {
      logger.warn('⚠️ Redis no conectado, procesando inmediatamente');
      await processCallback();
      return;
    }

    try {
      const key = this.KEY_PREFIX + subscriberId;
      const existingData = await this.redisClient.get(key);

      const now = Date.now();
      const expiresAt = now + this.TIMEOUT_MS;

      if (existingData) {
        // Ya existe entrada, agregar mensaje y REINICIAR timer
        const queueData: MessageQueueData = JSON.parse(existingData);
        queueData.messages.push({
          text: messageText,
          timestamp: now,
        });
        queueData.expiresAt = expiresAt;

        await this.redisClient.setex(
          key,
          this.KEY_EXPIRY,
          JSON.stringify(queueData)
        );

        logger.info(`⏱️  Mensaje ${queueData.messages.length} agregado, reiniciando timer (2s)`);

        // CANCELAR timer anterior y crear uno nuevo (DEBOUNCE)
        if (this.activeTimers.has(subscriberId)) {
          clearTimeout(this.activeTimers.get(subscriberId)!);
        }
      } else {
        // Nueva entrada, crear cola
        const queueData: MessageQueueData = {
          subscriberId,
          messages: [
            {
              text: messageText,
              timestamp: now,
            },
          ],
          payload,
          expiresAt,
        };

        await this.redisClient.setex(
          key,
          this.KEY_EXPIRY,
          JSON.stringify(queueData)
        );

        logger.info('⏱️  Primer mensaje recibido, iniciando timer (2 segundos)');
      }

      // Crear nuevo timer (se ejecuta después de 2s sin nuevos mensajes)
      const timer = setTimeout(async () => {
        this.activeTimers.delete(subscriberId);

        // 🔒 LOCK DISTRIBUIDO: Solo procesa si este worker adquiere el lock
        const lockAcquired = await this.acquireLock(subscriberId);

        if (lockAcquired) {
          try {
            await processCallback();
          } finally {
            // Siempre libera el lock, incluso si hay error
            await this.releaseLock(subscriberId);
          }
        } else {
          logger.info(`⏭️  Worker ${process.pid} omite procesamiento (otro worker ya procesó)`);
        }
      }, this.TIMEOUT_MS);

      this.activeTimers.set(subscriberId, timer);
    } catch (error) {
      logger.error('❌ Error agregando mensaje a Redis:', error);
      await processCallback(); // Fallback: procesar inmediatamente
    }
  }

  /**
   * Obtiene y ELIMINA los mensajes de la cola
   * Retorna null si no hay mensajes o aún no es tiempo
   */
  async getAndClearMessages(subscriberId: string): Promise<MessageQueueData | null> {
    if (!this.isConnected || !this.redisClient) {
      return null;
    }

    try {
      const key = this.KEY_PREFIX + subscriberId;
      const existingData = await this.redisClient.get(key);

      if (!existingData) {
        return null;
      }

      const queueData: MessageQueueData = JSON.parse(existingData);

      // Verificar si ya es tiempo de procesar
      const now = Date.now();
      if (now < queueData.expiresAt) {
        // Aún no es tiempo
        logger.info(`⏱️  Aún no es tiempo de procesar (faltan ${queueData.expiresAt - now}ms)`);
        return null;
      }

      // Es tiempo de procesar, eliminar de Redis
      await this.redisClient.del(key);

      logger.info(`🚀 Procesando ${queueData.messages.length} mensaje(s) concatenado(s)`);
      return queueData;
    } catch (error) {
      logger.error('❌ Error obteniendo mensajes de Redis:', error);
      return null;
    }
  }

  /**
   * Verifica si hay mensajes en cola para un subscriber
   */
  async hasMessages(subscriberId: string): Promise<boolean> {
    if (!this.isConnected || !this.redisClient) {
      return false;
    }

    try {
      const key = this.KEY_PREFIX + subscriberId;
      const exists = await this.redisClient.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('❌ Error verificando mensajes en Redis:', error);
      return false;
    }
  }

  /**
   * Limpia mensajes de un subscriber (útil para limpieza manual)
   */
  async clearMessages(subscriberId: string): Promise<void> {
    if (!this.isConnected || !this.redisClient) {
      return;
    }

    try {
      const key = this.KEY_PREFIX + subscriberId;
      await this.redisClient.del(key);
      logger.info(`🗑️  Mensajes limpiados para ${subscriberId}`);
    } catch (error) {
      logger.error('❌ Error limpiando mensajes de Redis:', error);
    }
  }

  /**
   * Cierra conexión a Redis (para cleanup)
   */
  async disconnect(): Promise<void> {
    if (this.redisClient && this.isConnected) {
      await this.redisClient.quit();
      this.isConnected = false;
      logger.info('🔴 Redis desconectado');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Export
// ─────────────────────────────────────────────────────────────────────────────

const redisMessageQueue = new RedisMessageQueueService();

// Auto-conectar al importar
redisMessageQueue.connect().catch((err) => {
  logger.error('❌ Error auto-conectando Redis Message Queue:', err);
});

export default redisMessageQueue;
