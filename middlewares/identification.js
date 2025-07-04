// middlewares/identification.js
const jwt = require('jsonwebtoken');
const User = require('../models/usersModel'); 
const logger = require('../utils/logger'); // Assurez-vous d'importer logger ici aussi

exports.identifier = async (req, res, next) => { 
    let tokenValue; // Le token JWT lui-même, sans "Bearer "

    // 1. Essayer de récupérer depuis le header Authorization
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        tokenValue = authHeader.split(' ')[1];
    } 
    // 2. Sinon, essayer de récupérer depuis les cookies (si vous prévoyez de l'utiliser)
    else if (req.cookies && req.cookies['Authorization']) {
        const cookieToken = req.cookies['Authorization'];
         if (cookieToken.startsWith('Bearer ')) {
            tokenValue = cookieToken.split(' ')[1];
        } else {
            tokenValue = cookieToken; // Si le cookie ne contient que le token
            logger.info('IDENTIFIER: Token trouvé dans le cookie Authorization (sans Bearer prefix).');
        }
    }
    // 3. Optionnellement, si vous aviez une logique pour req.headers.client
    else if (req.headers.client === 'not browser' && authHeader) { // S'assurer que authHeader est défini
        // Cette logique devient redondante si on vérifie authHeader en premier
        // On pourrait la supprimer ou la garder si 'client' a une signification spéciale
         if (authHeader.startsWith('Bearer ')) {
            tokenValue = authHeader.split(' ')[1];
        } else {
            tokenValue = authHeader; // Si le header ne contient que le token
        }
        logger.info('IDENTIFIER: Token trouvé via req.headers.client.');
    }


    if (!tokenValue) {
        logger.warn('IDENTIFIER: Token manquant dans la requête.');
        return res
            .status(401) // 401 Unauthorized est plus sémantique pour un token manquant/invalide
            .json({ success: false, message: 'Accès non autorisé. Authentification requise.' });
    }

    try {
        const jwtVerified = jwt.verify(tokenValue, process.env.TOKEN_SECRET);
        req.user = jwtVerified;
        
        // ... (votre logique de vérification d'expiration d'abonnement) ...
        // Assurez-vous que cette partie est correcte et ne lance pas d'erreur non gérée
        if (req.user.userId && req.user.typeAbonnement && req.user.typeAbonnement !== 'gratuit') {
            const utilisateurFromDB = await User.findById(req.user.userId).select('dateFinAbonnement typeAbonnement');
            if (utilisateurFromDB && utilisateurFromDB.typeAbonnement !== 'gratuit' && utilisateurFromDB.dateFinAbonnement) {
                if (new Date(utilisateurFromDB.dateFinAbonnement) < new Date()) {
                    await User.findByIdAndUpdate(req.user.userId, { typeAbonnement: 'gratuit' });
                    req.user.typeAbonnement = 'gratuit'; 
                    logger.info(`IDENTIFIER: Abonnement premium expiré pour ${req.user.userId}. Repassé en gratuit.`);
                }
            }
        }
        
        next();

    } catch (error) {
        logger.error("IDENTIFIER: Erreur de vérification du token:", error.message);
        let messageErreur = 'Token invalide ou expiré.';
        if (error.name === 'TokenExpiredError') {
            messageErreur = 'Votre session a expiré, veuillez vous reconnecter.';
        } else if (error.name === 'JsonWebTokenError') {
            messageErreur = 'Token invalide.';
        }
        return res
            .status(401)
            .json({ success: false, message: messageErreur });
    }
}