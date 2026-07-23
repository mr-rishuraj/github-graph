import app, { errMsg } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { cleanupStaleCache } from './scanner/RepositoryScanner.js';
import { cleanupResultCache } from './cache/ResultCache.js';

app.listen(config.port, () => {
  logger.info('server', `GitHub Graph backend running on http://localhost:${config.port}`, {
    env: config.nodeEnv,
    corsOrigins: config.corsOrigins,
  });

  cleanupStaleCache().catch(e => logger.warn('startup', 'Extract cache cleanup failed', { error: errMsg(e) }));
  cleanupResultCache().catch(e => logger.warn('startup', 'Result cache cleanup failed', { error: errMsg(e) }));

  setInterval(() => {
    cleanupResultCache().catch(e => logger.warn('cache', 'Periodic cleanup failed', { error: errMsg(e) }));
  }, 60 * 60 * 1000);
});

export default app;
