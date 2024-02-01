import { default as Pino } from 'pino';

export const logger = Pino({
  base: undefined,
  formatters: {
    level(level) {
      return { level };
    },
  },
  level: process.env.LOG_LEVEL || 'info',
  name: process.env.APP_NAME || 'api',
  transport: 
    process.env.ENV !== 'local'
      ? undefined
      : {
          options: {
            colorize: true,
            ignore: 'time,name,hostname,pid,baseUrl,fullUrl,requestId,chain',
            messageFormat: '\u001b[35m{baseUrl}\u001b[39m \u001b[33m{chain}\u001b[39m {msg}',
          },
          target: 'pino-pretty',
        },
});

const logConstructor = (type: string, message: string, errorMessage?: any, onlyDev?: boolean, service?: string, url?: string) => {
  if (onlyDev && process.env.ENV !== 'local') return;
  if (type === 'error') {
    if (!!service && !!url) {
      logger.child({ service, url }).error(errorMessage, message);
    } else if (!!service) {
      logger.child({ service }).error(errorMessage, message);
    } else {
      logger.error(errorMessage, message);
    }
  } else if (type === 'warn') {
    logger.warn(message);
  } else if (type === 'debug') {
    logger.debug(message);
  } else {
    logger.info(message);
  }
};

export const log = {
  debug: (message: string) => logConstructor('debug', message),
  error: (message: string, errorMessage: any, service?: string, url?: string) =>
    logConstructor('error', message, errorMessage, false, service, url),
  info: (message: string) => logConstructor('info', message),
  local: (message: string) => logConstructor('info', message, undefined, true),
  warn: (message: string) => logConstructor('warn', message),
};
