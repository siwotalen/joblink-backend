// middlewares/authorization.js (nouveau fichier)

// Middleware pour vérifier si l'utilisateur a un des rôles spécifiés
exports.authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) { // req.user doit être défini par le middleware 'identifier'
            return res.status(401).json({ success: false, message: 'Authentification requise.' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: `Accès refusé. Rôle '${req.user.role}' non autorisé pour cette ressource.` 
            });
        }
        next();
    };
};
// Middleware spécifique pour vérifier si l'utilisateur est un admin
exports.isAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Accès refusé. Administrateurs uniquement.' });
    }
    next();
};
// ... d'autres middlewares spécifiques si besoin (isEmployeur, isTravailleur, isModerateur)
exports.isEmployeur = (req, res, next) => {
    if (!req.user || req.user.role !== 'employeur') {
        return res.status(403).json({ success: false, message: 'Accès réservé aux employeurs.' });
    }
    next();
};

exports.isTravailleur = (req, res, next) => {
    if (!req.user || req.user.role !== 'travailleur') {
        return res.status(403).json({ success: false, message: 'Accès réservé aux travailleurs.' });
    }
    next();
};

exports.isModerateur = (req, res, next) => {
    if (!req.user || req.user.role !== 'moderateur') {
        return res.status(403).json({ success: false, message: 'Accès réservé aux moderateurs.' });
    }
    next();
};
