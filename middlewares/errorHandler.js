// middlewares/errorHandler.js
const AppError = require('../utils/appError');
const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Logguer l'erreur
    if (process.env.NODE_ENV === 'development') {
        logger.error('DEV ERROR:', { 
            message: err.message, 
            stack: err.stack 
        });
    } else if (err.isOperational) {
        logger.warn(`OPERATIONAL ERROR: ${err.statusCode} - ${err.message}`);
    } else {
        logger.error('PROGRAMMING ERROR:', err);
    }

    // Gestion des erreurs spécifiques
    let error = { ...err };
    error.message = err.message;

    if (err.name === 'CastError') error = handleCastErrorDB(error);
    if (err.code === 11000) error = handleDuplicateFieldsDB(error);
    if (err.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

    // Réponse finale
    res.status(error.statusCode).json({
        success: false,
        status: error.status,
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
};

// Fonctions helpers (déplacez-les ici)
function handleCastErrorDB(err) {
    const message = `Valeur invalide ${err.value} pour le champ ${err.path}.`;
    return new AppError(message, 400);
}

function handleDuplicateFieldsDB(err) {
    const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
    const message = `Valeur dupliquée: ${value}. Veuillez utiliser une autre valeur.`;
    return new AppError(message, 400);
}

function handleValidationErrorDB(err) {
    const errors = Object.values(err.errors).map(el => el.message);
    const message = `Données d'entrée invalides. ${errors.join('. ')}`;
    return new AppError(message, 400);
}

function handleJWTError() {
    return new AppError('Token invalide. Veuillez vous reconnecter.', 401);
}

function handleJWTExpiredError() {
    return new AppError('Votre session a expiré. Veuillez vous reconnecter.', 401);
}