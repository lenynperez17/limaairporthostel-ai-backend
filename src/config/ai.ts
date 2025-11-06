// ═══════════════════════════════════════════════════════════════════════════
// 🤖 CONFIGURACIÓN DE APIS DE IA - LIMA AIRPORT HOSTEL
// ═══════════════════════════════════════════════════════════════════════════
// SOLO DEEPSEEK VIA OPENROUTER
// ═══════════════════════════════════════════════════════════════════════════

// ✅ CRÍTICO: Cargar dotenv PRIMERO antes de leer process.env
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import OpenAI from 'openai';

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 PROVEEDOR DE IA - SOLO OPENROUTER CON DEEPSEEK
// ═══════════════════════════════════════════════════════════════════════════
const AI_PROVIDER = 'openrouter' as const;

// ═══════════════════════════════════════════════════════════════════════════
// ⚙️ CONFIGURACIONES POR PROVEEDOR
// ═══════════════════════════════════════════════════════════════════════════

const providerConfigs = {
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-chat', // DeepSeek v3
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 CLIENTE DE IA (auto-configura según proveedor)
// ═══════════════════════════════════════════════════════════════════════════
const config = providerConfigs[AI_PROVIDER];

if (!config.apiKey) {
  console.error(`❌ [AI CONFIG] API Key no encontrada`);
  console.error(`   Configura OPENROUTER_API_KEY en el archivo .env`);
}

export const openai = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseURL,
});

// Log del proveedor activo
console.log(`🤖 [AI CONFIG] Proveedor activo: ${AI_PROVIDER.toUpperCase()}`);
console.log(`📊 [AI CONFIG] Modelo: ${config.model}`);
console.log(`🔗 [AI CONFIG] Base URL: ${config.baseURL}`);

// ═══════════════════════════════════════════════════════════════════════════
// ⚙️ CONFIGURACIONES DE MODELOS
// ═══════════════════════════════════════════════════════════════════════════

export const AI_MODELS = {
  // Modelo principal (se adapta según proveedor)
  MAIN: config.model,
  MINI: config.model, // Usar el mismo modelo por ahora
  VISION: config.model, // DeepSeek y Llama también tienen capacidad visual
};

export const AI_CONFIG = {
  temperature: {
    conversational: 0.7, // Para respuestas naturales y amigables
    analytical: 0.3, // Para detección de intenciones y datos estructurados
    creative: 0.9, // Para generación de contenido personalizado
  },
  maxTokens: {
    short: 150,
    medium: 500,
    long: 2000,
    xlarge: 4000, // Para respuestas muy detalladas
  },
  provider: AI_PROVIDER, // Exportar proveedor actual
};
