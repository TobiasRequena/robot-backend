// backend/src/utils/logger.js

// Logger simple con timestamps y colores para consola
import chalk from 'chalk';

export const logger = {
    info: (...args) => console.log(chalk.blue(`[INFO ${new Date().toISOString()}]`), ...args),
    success: (...args) => console.log(chalk.green(`[OK ${new Date().toISOString()}]`), ...args),
    warn: (...args) => console.warn(chalk.yellow(`[WARN ${new Date().toISOString()}]`), ...args),
    error: (...args) => console.error(chalk.red(`[ERROR ${new Date().toISOString()}]`), ...args),
};

// Middleware opcional para Express (para registrar requests)
export const loggerMiddleware = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const color =
            res.statusCode >= 500 ? chalk.red :
            res.statusCode >= 400 ? chalk.yellow :
            chalk.green;

        console.log(color(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${duration} ms)`));
    });
    next();
};

export default logger;
