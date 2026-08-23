import pino from 'pino';
import path from 'node:path';
import fs from 'node:fs';

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const LOG_DIR = process.env.LOG_DIR || path.resolve(process.cwd(), 'logs');

let fileTarget = null;
if (IS_PROD) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fileTarget = pino.destination({ dest: path.join(LOG_DIR, 'app.log'), sync: false, mkdir: true });
  } catch {
    fileTarget = process.stdout;
  }
}

export default pino(
  {
    level: process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug'),
    base: { service: 'yourday-api', env: NODE_ENV },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.password_hash',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  fileTarget || pino.destination(1)
);