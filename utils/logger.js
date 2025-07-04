const winston = require('winston');
const path = require('path'); // Pour construire les chemins de log

// Créations du  répertoire de logs s'il n'existe pas.
const fs = require('fs');
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info'), // Plus restrictif en prod
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), // Précision milliseconde
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'joblink-api' },
  transports: [
    new winston.transports.File({ 
        filename: path.join(logDir, 'error.log'), 
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5, // Garder 5 fichiers de log d'erreur
        tailable: true,
    }),
    new winston.transports.File({ 
        filename: path.join(logDir, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true,
    }),
  ],
  exceptionHandlers: [ // Pour attraper les exceptions non gérées
    new winston.transports.File({ filename: path.join(logDir, 'exceptions.log') })
  ],
  rejectionHandlers: [ // Pour attraper les rejets de promesses non gérés
    new winston.transports.File({ filename: path.join(logDir, 'rejections.log') })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, stack, service, ...metadata }) => {
        let log = `${timestamp} [${service}] ${level}: ${message}`;
        if (stack) {
          log += `\n${stack}`;
        } else if (Object.keys(metadata).length) {
          // log += ` ${JSON.stringify(metadata)}`; // Optionnel: logguer les métadonnées
        }
        return log;
      })
    ),
  }));
}

module.exports = logger;