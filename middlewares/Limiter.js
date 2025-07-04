// middlewares/loginLimiter.js
const rateLimit = require('express-rate-limit');

exports.loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,// Fenêtre de 15 minutes  
    max: 5,// Limiter chaque IP à 5 requêtes par fenêtre pour ces routes
    message: { 
        success: false, 
        message: 'Trop de tentatives de connexion depuis cette IP, veuillez réessayer après 15 minutes.' 
    },
    standardHeaders: true,  // Retourner les infos de limite dans les headers `RateLimit-*`
    legacyHeaders: false, // Désactiver les headers `X-RateLimit-*` (obsolètes)
    skipSuccessfulRequests: false,// Compter aussi les requêtes réussies dans la limite pour le login
});

// Limiteur plus général pour les autres routes API
exports.apiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS) || 1000, 
    standardHeaders: true,
    legacyHeaders: false,
});