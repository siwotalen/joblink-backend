// Dans index.js
exports.corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(','); // Ex: http://localhost:3001,https://votre-site.com
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Accès non autorisé par CORS'));
        }
    },
    credentials: true, // Important si vous utilisez des cookies (comme pour le token d'auth)
    optionsSuccessStatus: 200
};