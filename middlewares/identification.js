const jwt = require('jsonwebtoken');
const User = require('../models/usersModel');

exports.identifier = async (req, res, next) => {
    let token;
    if (req.headers.client === 'not browser') {
        token = req.headers.authorization;
    } else {
        token = req.cookies['Authorization'];
    }

    if (!token) {
        return res
            .status(403)
            .json({ success: false, message: 'Accès non autorisé. Token manquant.' });
    }

    try {
         // S'assurer que le token commence bien par "Bearer "
        if (!token.startsWith('Bearer ')) {
            return res
                .status(403)
                .json({ success: false, message: 'Format de token invalide. "Bearer " attendu.' });
        }
        const usertoken = token.split(' ')[1];

        if (!usertoken) {
            return res
                .status(403)
                .json({ success: false, message: 'Token malformed' });
        }

        const jwtVerified = jwt.verify(usertoken, process.env.TOKEN_SECRET);

        if (jwtVerified) {
            req.user = jwtVerified;
             // Vérifier l'expiration de l'abonnement si l'utilisateur est premium
            if (req.user.typeAbonnement !== 'gratuit' && req.user.dateFinAbonnement) {
                if (new Date(req.user.dateFinAbonnement) < new Date()) {
                    // L'abonnement a expiré, repasser en gratuit
                    await User.findByIdAndUpdate(req.user.userId, { 
                        typeAbonnement: 'gratuit', 
                        // dateFinAbonnement: null // Optionnel de le nullifier
                    });
                    await createNotificationJobLink( // Utilisez la version JobLink
                        req.user.userId,
                        'ABONNEMENT_PREMIUM_EXPIRE_UTILISATEUR',
                        'Votre abonnement Premium JobLink a expiré. Vous êtes repassé à un compte gratuit. Pour continuer à bénéficier des avantages premium, veuillez renouveler votre abonnement.',
                        '/premium', // Lien vers la page pour se réabonner
                        { ancienAbonnement: 'premium' } // Ou le type premium spécifique
                    );
                    // Mettre à jour req.user pour refléter le changement immédiat
                    req.user.typeAbonnement = 'gratuit'; 
                    // On pourrait aussi déconnecter l'utilisateur ou lui envoyer une notification
                }
            }
            next();
        } else {
            throw new Error('error in the token');
        }
    } catch (error) {
        // Gérer les erreurs de jwt.verify (token expiré, invalide, etc.)
        console.error("Erreur d'identification (token):", error.message);
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
};
