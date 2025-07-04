// Dans index.js
exports.corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [process.env.ALLOWED_ORIGINS,
            'http://localhost:5173',  // Pour le développement local du frontend
            'http://localhost:5500',  // Pour le développement local du frontend
            'http://172.20.10.6:5173',  // Pour le développement local du frontend
            'http://127.0.0.1:5173' ]
            
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('La politique CORS pour ce site ne permet pas l\'accès depuis l\'origine spécifiée.'));
        }
    },
    credentials: true, // Important si vous utilisez des cookies (comme pour le token d'auth)
    optionsSuccessStatus: 200
};