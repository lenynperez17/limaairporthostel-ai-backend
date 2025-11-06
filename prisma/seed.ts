// ═══════════════════════════════════════════════════════════════════════════
// 🌱 SEED - DATOS INICIALES
// ═══════════════════════════════════════════════════════════════════════════

import { PrismaClient, ServiceCategory, BillingType } from '@prisma/client';
import bcrypt from 'bcrypt';
import { logger } from '../src/utils/logger';

const prisma = new PrismaClient();

async function main() {
  logger.info('🌱 Iniciando seed de datos...\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 1. CREAR USUARIO ADMIN
  // ───────────────────────────────────────────────────────────────────────────
  logger.info('👤 Creando usuario admin...');

  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@nynelmkt.com' },
    update: {},
    create: {
      email: 'admin@nynelmkt.com',
      password: hashedPassword,
      name: 'Administrador',
      role: 'ADMIN',
    },
  });

  logger.info('✅ Usuario admin creado');

  // ───────────────────────────────────────────────────────────────────────────
  // 2. CREAR SERVICIOS DE NYNEL MKT
  // ───────────────────────────────────────────────────────────────────────────
  logger.info('\n📦 Creando servicios...');

  const services = [
    {
      name: 'Software a Medida',
      slug: 'software-medida',
      description: 'Desarrollo de software personalizado según tus necesidades específicas. Sistemas web, desktop o híbridos con las últimas tecnologías.',
      category: ServiceCategory.SOFTWARE_DEVELOPMENT,
      priceMin: 8000,
      priceMax: 150000,
      billingType: BillingType.ONE_TIME,
      features: [
        'Análisis de requerimientos',
        'Diseño de arquitectura',
        'Desarrollo ágil',
        'Testing completo',
        'Deployment',
        '3 meses de soporte',
      ],
      keywords: ['software', 'desarrollo', 'sistema', 'erp', 'crm', 'personalizado'],
      displayOrder: 1,
    },
    {
      name: 'SEO y Marketing Digital',
      slug: 'seo-marketing',
      description: 'Posicionamiento web orgánico y estrategias de marketing digital para aumentar tu visibilidad online.',
      category: ServiceCategory.MARKETING,
      priceMin: 900,
      priceMax: 5000,
      billingType: BillingType.MONTHLY,
      features: [
        'Auditoría SEO',
        'Optimización on-page',
        'Link building',
        'Content marketing',
        'Reportes mensuales',
        'Soporte continuo',
      ],
      keywords: ['seo', 'marketing', 'google', 'posicionamiento', 'tráfico'],
      displayOrder: 2,
    },
    {
      name: 'Email Marketing',
      slug: 'email-marketing',
      description: 'Campañas de email marketing automatizadas para nutrir leads y fidelizar clientes.',
      category: ServiceCategory.MARKETING,
      priceMin: 500,
      priceMax: 3000,
      billingType: BillingType.MONTHLY,
      features: [
        'Diseño de templates',
        'Automatización',
        'Segmentación',
        'A/B testing',
        'Analytics',
        'Gestión de listas',
      ],
      keywords: ['email', 'newsletter', 'automatización', 'leads'],
      displayOrder: 3,
    },
    {
      name: 'Páginas Web Profesionales',
      slug: 'paginas-web',
      description: 'Diseño y desarrollo de páginas web profesionales, responsivas y optimizadas para conversión.',
      category: ServiceCategory.WEB_DESIGN,
      priceMin: 1500,
      priceMax: 25000,
      billingType: BillingType.ONE_TIME,
      features: [
        'Diseño responsive',
        'SEO básico',
        'Formularios de contacto',
        'Integración redes sociales',
        'Panel de administración',
        'Hosting primer año',
      ],
      keywords: ['web', 'página', 'sitio', 'landing', 'website'],
      displayOrder: 4,
    },
    {
      name: 'Automatización de Procesos',
      slug: 'automatizacion',
      description: 'Automatización de procesos empresariales con herramientas no-code y low-code para aumentar eficiencia.',
      category: ServiceCategory.AUTOMATION,
      priceMin: 800,
      priceMax: 8000,
      billingType: BillingType.ONE_TIME,
      features: [
        'Análisis de procesos',
        'Diseño de workflows',
        'Implementación',
        'Integraciones',
        'Capacitación',
        '2 meses de soporte',
      ],
      keywords: ['automatización', 'workflow', 'zapier', 'n8n', 'proceso'],
      displayOrder: 5,
    },
    {
      name: 'Aplicaciones Móviles',
      slug: 'apps-moviles',
      description: 'Desarrollo de aplicaciones móviles nativas o híbridas para iOS y Android.',
      category: ServiceCategory.MOBILE_APP,
      priceMin: 15000,
      priceMax: 120000,
      billingType: BillingType.ONE_TIME,
      features: [
        'Diseño UX/UI',
        'Desarrollo iOS/Android',
        'API backend',
        'Push notifications',
        'Publicación en stores',
        '6 meses de soporte',
      ],
      keywords: ['app', 'móvil', 'aplicación', 'ios', 'android', 'flutter'],
      displayOrder: 6,
    },
    {
      name: 'Analítica y Business Intelligence',
      slug: 'analitica-bi',
      description: 'Implementación de dashboards y reportes para toma de decisiones basada en datos.',
      category: ServiceCategory.ANALYTICS,
      priceMin: 2000,
      priceMax: 15000,
      billingType: BillingType.ONE_TIME,
      features: [
        'Conexión de fuentes de datos',
        'Dashboards interactivos',
        'Reportes automatizados',
        'KPIs personalizados',
        'Capacitación',
        'Soporte',
      ],
      keywords: ['analítica', 'dashboard', 'bi', 'reportes', 'datos', 'kpi'],
      displayOrder: 7,
    },
    {
      name: 'Campañas Publicitarias',
      slug: 'campanas-publicitarias',
      description: 'Gestión de campañas publicitarias en Google Ads, Facebook Ads, Instagram Ads y LinkedIn Ads.',
      category: ServiceCategory.ADVERTISING,
      priceMin: 1200,
      priceMax: 10000,
      billingType: BillingType.MONTHLY,
      features: [
        'Estrategia publicitaria',
        'Creación de anuncios',
        'Gestión de presupuesto',
        'Optimización continua',
        'Reportes semanales',
        'Análisis de ROI',
      ],
      keywords: ['ads', 'publicidad', 'google', 'facebook', 'campaña', 'anuncios'],
      displayOrder: 8,
    },
  ];

  for (const service of services) {
    await prisma.service.upsert({
      where: { slug: service.slug },
      update: {},
      create: service,
    });
    logger.info(`✅ Servicio creado: ${service.name}`);
  }

  logger.info('\n✅ Seed completado exitosamente!\n');
  logger.info('📊 Resumen:');
  logger.info(`   - 1 usuario admin`);
  logger.info(`   - 8 servicios`);
  logger.info('\n🔑 Credenciales admin:');
  logger.info('   Email: admin@nynelmkt.com');
  logger.info('   Password: admin123\n');
}

main()
  .catch((e) => {
    logger.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
