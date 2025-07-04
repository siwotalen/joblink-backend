// controllers/employeurController.js (Backend)
const Annonce = require('../models/annonceModel');
const Candidature = require('../models/candidatureModel');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const User = require('../models/usersModel'); // Pour vérifier le type d'abonnement
const Avis = require('../models/avisModel');

exports.getDashboardStatsEmployeur = async (req, res, next) => {
    try {
        const employeurId = req.user.userId;

        const [annoncesActives, candidaturesTotal] = await Promise.all([
            Annonce.countDocuments({ 
                employeurId: employeurId, 
                statut: 'active',
                dateExpiration: { $gte: new Date() } 
            }),
            Candidature.countDocuments({ employeurId: employeurId }) // Toutes les candidatures reçues par cet employeur
        ]);

        res.status(200).json({
            success: true,
            stats: {
                annoncesActives,
                candidaturesTotal
            }
        });

    } catch (error) {
        logger.error("Erreur getDashboardStatsEmployeur:", error);
        next(error);
    }
};

exports.getProfilPublicEmployeur = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new AppError("ID d'employeur invalide.", 400));
        }

        // 1. Récupérer l'employeur
        const employeur = await User.findOne({ _id: id, role: 'employeur', estActif: true })
            .select('-password -verificationCode -forgotPasswordCode'); // Exclure les champs sensibles

        if (!employeur) {
            return next(new AppError("Profil d'employeur non trouvé ou inactif.", 404));
        }

        // 2. Récupérer les annonces actives de cet employeur (ex: les 5 plus récentes)
        const annoncesActives = await Annonce.find({
            employeurId: id,
            statut: 'active',
            dateExpiration: { $gte: new Date() }
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('titre localisation.ville typeContrat createdAt');

        // 3. Récupérer les avis pour cet employeur (paginés, les 5 plus récents pour commencer)
        const avisRecus = await Avis.find({
            cibleId: id,
            estApprouve: true,
            estVisible: true
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('auteurId', 'nom prenom role'); // Infos de l'auteur de l'avis

        // 4. (Optionnel) Récupérer quelques membres de l'équipe si vous stockez cette info
        // Pour l'instant, on laisse de côté.

        // Les stats (noteMoyenne, nombreAvis) sont déjà sur le profil de l'employeur.

        res.status(200).json({
            success: true,
            profilEmployeur: employeur,
            annoncesActives,
            avisRecus
        });

    } catch (error) {
        logger.error("Erreur getProfilPublicEmployeur:", error);
        next(error);
    }
};