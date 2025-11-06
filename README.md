# 🏨 Lima Airport Hostel - Sistema de IA Conversacional

Sistema completo de IA conversacional para reservas de hotel con:
- ✅ Memoria completa de conversación (200 mensajes)
- ✅ Disponibilidad real con Google Calendar
- ✅ Envío automático de imágenes de habitaciones
- ✅ Ventana de concatenación de 15 segundos
- ✅ Patrón profesional escalable

---

## 🚀 DEPLOYMENT RÁPIDO

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar .env (copiar de .env.example y completar)
cp .env.example .env

# 3. Ejecutar deployment completo
chmod +x deploy.sh
./deploy.sh
```

El script `deploy.sh` hace TODO automáticamente:
- ✅ Build del proyecto
- ✅ Genera Prisma Client
- ✅ Sube imágenes de habitaciones al VPS
- ✅ Sube código al VPS
- ✅ Instala dependencias en VPS
- ✅ Ejecuta migraciones de BD
- ✅ Reinicia servicio con PM2

---

## 📋 CONFIGURACIÓN MANUAL (si necesitas hacerlo paso a paso)

### 1. Variables de Entorno (.env)

```bash
# Servidor
API_PORT=3002
NODE_ENV=production
BASE_URL=https://hotel.perubestprice.com

# Database (PostgreSQL)
DATABASE_URL="postgresql://usuario:password@localhost:5432/hotel_db?schema=public"

# ManyChat
MANYCHAT_API_KEY="3761422:8c32cb0219cbc97aca5367d935b5af98"
MANYCHAT_RESPONSE_FLOW_NS="content20251030165627_872617"  # Actualizar con tu Flow NS

# OpenAI / Groq
OPENAI_API_KEY="tu_openai_key"
GROQ_API_KEY="tu_groq_key"

# Google Calendar (opcional)
GOOGLE_CALENDAR_ID="primary"
GOOGLE_CALENDAR_TIMEZONE="America/Lima"
GOOGLE_CREDENTIALS_PATH="config/google/credentials.json"
GOOGLE_TOKEN_PATH="config/google/token.json"
```

### 2. Configurar Base de Datos

```bash
# Generar Prisma Client
npx prisma generate

# Ejecutar migraciones
npx prisma migrate deploy
```

### 3. Configurar Flow en ManyChat

Ver **MANYCHAT_FLOW_SETUP.md** para instrucciones completas.

---

## 🏗️ ARQUITECTURA

```
┌─────────────────┐
│   WhatsApp      │
│   (Usuario)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│   ManyChat      │─────▶│ Webhook Backend  │
│   Webhook       │      │ (15 seg window)  │
└─────────────────┘      └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
            ┌────────────┐ ┌──────────┐ ┌──────────────┐
            │ PostgreSQL │ │ OpenAI   │ │ Google       │
            │ (Prisma)   │ │ GPT-4    │ │ Calendar     │
            └────────────┘ └──────────┘ └──────────────┘
                    │
                    ▼
            ┌────────────────┐
            │ Room Images    │
            │ Service        │
            └────────┬───────┘
                     │
                     ▼
            ┌────────────────┐
            │ ManyChat Flow  │
            │ + Imágenes     │
            └────────────────┘
```

---

## 📂 ESTRUCTURA DEL PROYECTO

```
backend-hotel/
├── src/
│   ├── controllers/
│   │   └── webhook.controller.ts     # 🎯 NÚCLEO: Manejo completo del webhook
│   ├── services/
│   │   ├── hotel-conversational-ai.service.ts  # IA conversacional
│   │   ├── manychat-api.service.ts            # API de ManyChat
│   │   ├── google-calendar.service.ts         # Disponibilidad real
│   │   └── room-images.service.ts             # Gestión de imágenes
│   ├── config/
│   │   ├── database.ts                # Prisma Client
│   │   ├── ai.ts                     # Configuración de IA
│   │   └── super-intelligent-prompt.ts # Prompt del asistente
│   └── utils/
│       └── logger.ts                 # Logging
├── prisma/
│   ├── schema.prisma                 # Schema de BD adaptado para hotel
│   └── migrations/                   # Migraciones
├── deploy.sh                         # 🚀 Script de deployment automático
├── MANYCHAT_FLOW_SETUP.md           # Guía para configurar Flow
└── README.md                         # Este archivo
```

---

## ✨ CARACTERÍSTICAS PRINCIPALES

### 1. Memoria Completa de Conversación
- Almacena TODOS los mensajes en PostgreSQL
- Recupera últimos 200 mensajes
- Envía últimos 100 a la IA como contexto
- El asistente NUNCA olvida la conversación

### 2. Disponibilidad Real con Google Calendar
- Verifica disponibilidad real en Google Calendar
- Retorna habitaciones disponibles
- Integración bidireccional (crear/editar/cancelar reservas)

### 3. Envío Automático de Imágenes
- Detecta cuando usuario pregunta por habitaciones
- Verifica disponibilidad
- Prepara URLs de imágenes
- Setea custom fields en ManyChat
- Flow envía imágenes automáticamente

### 4. Ventana de Concatenación de 15 Segundos
- Usuario puede escribir múltiples mensajes
- Sistema espera 15 segundos antes de procesar
- Todos los mensajes se concatenan
- Respuesta única y coherente

---

## 🧪 TESTING

### Test Local
```bash
# Iniciar en desarrollo
npm run dev

# Probar webhook
curl -X POST http://localhost:3002/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "subscriber_id": "test123",
    "text": "Hola, quiero ver habitaciones disponibles",
    "platform": "whatsapp"
  }'
```

### Test en VPS
```bash
# Ver logs en tiempo real
ssh root@161.132.39.26 "pm2 logs hotel-ai"

# Ver estado del servicio
ssh root@161.132.39.26 "pm2 status"

# Probar webhook en producción
curl https://hotel.perubestprice.com/health
```

---

## 📞 SOPORTE

- **Logs del servidor:** `pm2 logs hotel-ai`
- **Restart del servicio:** `pm2 restart hotel-ai`
- **Ver BD:** `npx prisma studio`
- **Ver migraciones:** `npx prisma migrate status`

---

## 🎉 ¡TODO LISTO!

Sigue los pasos del **MANYCHAT_FLOW_SETUP.md** para completar la configuración del Flow en ManyChat.

Una vez configurado, tu sistema tendrá:
- ✅ Memoria completa
- ✅ Disponibilidad real
- ✅ Imágenes automáticas
- ✅ Respuestas inteligentes
- ✅ Patrón profesional
