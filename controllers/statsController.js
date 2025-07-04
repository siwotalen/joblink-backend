// controllers/statsController.js (côté backend)
const User = require('../models/usersModel');
const Annonce = require('../models/annonceModel');
const logger = require('../utils/logger');

exports.getStatsPlateforme = async (req, res, next) => {
    try {
        const [nombreEmployeurs, nombreTravailleurs, nombreAnnoncesActives] = await Promise.all([
            User.countDocuments({ role: 'employeur', estActif: true }),
            User.countDocuments({ role: 'travailleur', estActif: true }),
            Annonce.countDocuments({ statut: 'active', dateExpiration: { $gte: new Date() } })
        ]);

        res.status(200).json({
            success: true,
            stats: {
                employeurs: nombreEmployeurs,
                travailleurs: nombreTravailleurs,
                annonces: nombreAnnoncesActives
            }
        });
    } catch (error) {
        logger.error("Erreur getStatsPlateforme:", error);
        next(error);
    }
};