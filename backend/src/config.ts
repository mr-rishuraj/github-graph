export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? '20', 10),
  maxFiles: parseInt(process.env.MAX_FILES ?? '5000', 10),
  downloadTimeoutMs: parseInt(process.env.DOWNLOAD_TIMEOUT_MS ?? '120000', 10),
  sentryDsn: process.env.SENTRY_DSN,
  githubClientId: process.env.GITHUB_CLIENT_ID ?? '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
};
