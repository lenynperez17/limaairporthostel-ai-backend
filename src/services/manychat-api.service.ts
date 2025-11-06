// ═══════════════════════════════════════════════════════════════════════════
// 🤖 MANYCHAT API SERVICE - LIMA AIRPORT HOSTEL
// ═══════════════════════════════════════════════════════════════════════════
// Servicio profesional para comunicación con ManyChat API
// Basado en el patrón del backend de Nynel

import { logger } from '../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

interface ManyChatMessage {
  type: 'text' | 'image';
  text?: string;
  url?: string;
  buttons?: any[];
}

interface SendContentPayload {
  subscriber_id: string;
  data: {
    version: string;
    content: {
      messages: ManyChatMessage[];
    };
  };
}

interface SendFlowPayload {
  subscriber_id: string;
  flow_ns: string;
}

interface SetCustomFieldPayload {
  subscriber_id: string;
  field_name: string;
  field_value: string;
}

interface ManyChatResponse {
  status: string;
  data?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// ManyChat API Service Class
// ─────────────────────────────────────────────────────────────────────────────

class ManyChatAPIService {
  private apiToken: string;
  private baseURL = 'https://api.manychat.com/fb';

  constructor() {
    this.apiToken = '';
  }

  // Inicializa el token lazy (solo cuando se necesita)
  private ensureToken(): void {
    if (!this.apiToken) {
      this.apiToken = process.env.MANYCHAT_API_KEY || process.env.MANYCHAT_API_TOKEN || '';

      if (!this.apiToken) {
        logger.error('❌ MANYCHAT_API_KEY no está configurado en .env');
        logger.error('   Asegúrate de definir MANYCHAT_API_KEY en tu archivo .env');
      } else {
        logger.info('✅ ManyChat API Service inicializado');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔄 MÉTODO PRINCIPAL: sendFlow (RECOMENDADO PARA WHATSAPP)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Activa un Flow para un subscriber con Custom Field Set
   * Este es el método PROFESIONAL para enviar mensajes en WhatsApp
   *
   * PASOS:
   * 1. Establece custom field "ai_response" con el mensaje
   * 2. Activa el flow configurado en ManyChat
   * 3. El flow lee el custom field y lo envía al usuario
   */
  async sendFlow(subscriberId: string, flowNs: string, customFieldValue?: string): Promise<boolean> {
    this.ensureToken(); // Lazy initialization
    try {
      logger.info(`🔄 Activando flow '${flowNs}' para ${subscriberId}`);

      // ───────────────────────────────────────────────────────────────
      // PASO 1: Establecer Custom Field con el mensaje
      // ───────────────────────────────────────────────────────────────
      if (customFieldValue) {
        logger.info('📝 Estableciendo custom field "ai_response"...');
        const fieldSet = await this.setCustomFieldByName(
          subscriberId,
          'ai_response',
          customFieldValue
        );

        if (!fieldSet) {
          logger.warn('⚠️  Custom field no establecido, pero continuando con Flow');
        } else {
          logger.info('✅ Custom field "ai_response" establecido correctamente');
        }
      }

      // ───────────────────────────────────────────────────────────────
      // PASO 2: Activar Flow
      // ───────────────────────────────────────────────────────────────
      const payload: SendFlowPayload = {
        subscriber_id: subscriberId,
        flow_ns: flowNs,
      };

      logger.info(`📤 POST ${this.baseURL}/sending/sendFlow`);
      logger.info(`   Payload: ${JSON.stringify(payload, null, 2)}`);

      const response = await fetch(`${this.baseURL}/sending/sendFlow`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json() as ManyChatResponse;

      if (response.ok && result.status === 'success') {
        logger.info(`✅ Flow '${flowNs}' activado exitosamente`);
        logger.info(`   Response: ${JSON.stringify(result, null, 2)}`);
        return true;
      } else {
        logger.error(`❌ Error al activar flow:`);
        logger.error(`   Status: ${response.status}`);
        logger.error(`   Response: ${JSON.stringify(result, null, 2)}`);
        return false;
      }
    } catch (error: any) {
      logger.error(`❌ Exception al llamar sendFlow:`, {
        message: error.message,
        stack: error.stack,
      });
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📝 MÉTODO: setCustomFieldByName
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Establece un Custom Field para un subscriber
   * Usado para pasar datos al Flow antes de activarlo
   */
  async setCustomFieldByName(subscriberId: string, fieldName: string, value: string): Promise<boolean> {
    this.ensureToken(); // Lazy initialization
    try {
      logger.info(`📝 Estableciendo custom field '${fieldName}'`);
      logger.info(`   Valor: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);

      const payload: SetCustomFieldPayload = {
        subscriber_id: subscriberId,
        field_name: fieldName,
        field_value: value,
      };

      const response = await fetch(`${this.baseURL}/subscriber/setCustomFieldByName`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json() as ManyChatResponse;

      if (response.ok && result.status === 'success') {
        logger.info(`✅ Custom field '${fieldName}' establecido exitosamente`);
        return true;
      } else {
        logger.error(`❌ Error al establecer custom field:`);
        logger.error(`   Status: ${response.status}`);
        logger.error(`   Response: ${JSON.stringify(result, null, 2)}`);
        return false;
      }
    } catch (error: any) {
      logger.error(`❌ Exception al llamar setCustomFieldByName:`, {
        message: error.message,
        stack: error.stack,
      });
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📤 MÉTODO FALLBACK: sendTextMessage (SOLO FUNCIONA EN INSTAGRAM/MESSENGER)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Envía mensaje de texto vía sendContent
   * ⚠️ IMPORTANTE: NO funciona para WhatsApp (solo Instagram/Messenger)
   * Para WhatsApp usar sendFlow en su lugar
   */
  async sendTextMessage(subscriberId: string, text: string): Promise<boolean> {
    this.ensureToken(); // Lazy initialization
    try {
      logger.info(`📤 Enviando mensaje vía sendContent a ${subscriberId}`);
      logger.warn('⚠️  NOTA: sendContent NO funciona para WhatsApp, solo Instagram/Messenger');

      const payload: SendContentPayload = {
        subscriber_id: subscriberId,
        data: {
          version: 'v2',
          content: {
            messages: [
              {
                type: 'text',
                text: text,
              },
            ],
          },
        },
      };

      const response = await fetch(`${this.baseURL}/sending/sendContent`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json() as ManyChatResponse;

      if (response.ok && result.status === 'success') {
        logger.info(`✅ Mensaje enviado exitosamente`);
        return true;
      } else {
        logger.error(`❌ Error al enviar mensaje:`);
        logger.error(`   Status: ${response.status}`);
        logger.error(`   Response: ${JSON.stringify(result, null, 2)}`);
        return false;
      }
    } catch (error: any) {
      logger.error(`❌ Exception al llamar sendContent:`, {
        message: error.message,
        stack: error.stack,
      });
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🖼️ MÉTODO: sendImageMessage - Envía una imagen vía sendContent
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Envía una imagen vía sendContent API
   * Funciona para WhatsApp, Instagram y Messenger
   */
  async sendImageMessage(subscriberId: string, imageUrl: string): Promise<boolean> {
    this.ensureToken(); // Lazy initialization
    try {
      logger.info(`📸 Enviando imagen vía sendContent a ${subscriberId}`);
      logger.info(`   URL: ${imageUrl}`);

      const payload: SendContentPayload = {
        subscriber_id: subscriberId,
        data: {
          version: 'v2',
          content: {
            messages: [
              {
                type: 'image',
                url: imageUrl,
                buttons: [],
              },
            ],
          },
        },
      };

      const response = await fetch(`${this.baseURL}/sending/sendContent`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json() as ManyChatResponse;

      if (response.ok && result.status === 'success') {
        logger.info(`✅ Imagen enviada exitosamente`);
        return true;
      } else {
        logger.error(`❌ Error al enviar imagen:`);
        logger.error(`   Status: ${response.status}`);
        logger.error(`   Response: ${JSON.stringify(result, null, 2)}`);
        return false;
      }
    } catch (error: any) {
      logger.error(`❌ Exception al enviar imagen:`, {
        message: error.message,
        stack: error.stack,
      });
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🖼️ MÉTODO: sendMultipleImages - Envía múltiples imágenes secuencialmente
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Envía múltiples imágenes una tras otra
   * Agrega un delay de 500ms entre cada imagen para evitar rate limiting
   */
  async sendMultipleImages(subscriberId: string, imageUrls: string[]): Promise<boolean> {
    try {
      logger.info(`📸 Enviando ${imageUrls.length} imágenes a ${subscriberId}`);

      let successCount = 0;
      for (let i = 0; i < imageUrls.length; i++) {
        const imageUrl = imageUrls[i];
        logger.info(`   [${i + 1}/${imageUrls.length}] ${imageUrl}`);

        const success = await this.sendImageMessage(subscriberId, imageUrl);
        if (success) {
          successCount++;
        }

        // Delay de 500ms entre imágenes para evitar rate limiting
        if (i < imageUrls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      logger.info(`✅ ${successCount}/${imageUrls.length} imágenes enviadas exitosamente`);
      return successCount === imageUrls.length;
    } catch (error: any) {
      logger.error(`❌ Exception al enviar múltiples imágenes:`, {
        message: error.message,
        stack: error.stack,
      });
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🏥 HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Verifica si el servicio está configurado correctamente
   */
  isConfigured(): boolean {
    this.ensureToken(); // Lazy initialization
    return !!this.apiToken;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Instance
// ─────────────────────────────────────────────────────────────────────────────

export const manychatAPI = new ManyChatAPIService();
