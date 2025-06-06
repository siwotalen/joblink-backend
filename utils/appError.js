class AppError extends Error {
    constructor(message, statusCode) {
        super(message); // Appelle du constructeur de la classe Error parente

        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error'; // 'fail' pour les erreurs client, 'error' pour serveur
        this.isOperational = true; // Pour distinguer les erreurs opérationnelles des bugs de programmation

        Error.captureStackTrace(this, this.constructor); // Pour Capturer la stack trace correcte
    }
}

module.exports = AppError;