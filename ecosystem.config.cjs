require('dotenv').config();

module.exports = {
  apps: [{
    name: 'hotel-ai',
    script: './dist/index.js',
    cwd: '/var/www/limaairporthostel',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: process.env.DATABASE_URL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      MANYCHAT_API_KEY: process.env.MANYCHAT_API_KEY,
      MANYCHAT_RESPONSE_FLOW_NS: process.env.MANYCHAT_RESPONSE_FLOW_NS,
      API_PORT: process.env.API_PORT,
      BASE_URL: process.env.BASE_URL
    }
  }]
};
