// controllers/avisController.js
const Avis = require('../models/avisModel');
const User = require('../models/usersModel');
const Annonce = require('../models/annonceModel'); // Pour le titre dans la notification
const Candidature = require('../models/candidatureModel');
const { createAvisSchema } = require('../middlewares/validator');
const notificationService = require('../utils/notificationManager'); // Adaptez le nom
const AppError = require('../utils/appError');
const logger = require('../utils/logger'); // Assurez-vous que logger est importé
const mongoose = require('mongoose');

exports.laisserAvis = async (req, res, next) => {
    try {
        const { error, value } = createAvisSchema.validate(req.body); // Valide candidatureId, note, commentaire
        if (error) {
            return next(new AppError(error.details[0].message, 400));
        }

        const auteurId = req.user.userId;
        const auteurRole = req.user.role; // 'travailleur' ou 'employeur'
        const { candidatureId, note, commentaire } = value;

        const candidature = await Candidature.findById(candidatureId)
            .populate('annonceId', 'titre') // Pour le titre dans la notif
            .populate('travailleurId', '_id role') // Pour vérifier l'ID et le rôle
            .populate('employeurId', '_id role');  // Pour vérifier l'ID et le rôle

        if (!candidature) {
            return next(new AppError('Candidature introuvable.', 404));
        }

        // 1. Vérifier le statut de la candidature et la période d'avis
        if (candidature.statut !== 'terminee_automatiquement' && candidature.statut !== 'terminee_manuellement') {
            return next(new AppError('Vous ne pouvez laisser un avis que pour une prestation marquée comme terminée.', 403));
        }
        if (!candidature.avisPeriodeOuverteJusquau || new Date() > new Date(candidature.avisPeriodeOuverteJusquau)) {
            return next(new AppError('La période pour laisser un avis pour cette prestation est expirée.', 403));
        }

        // 2. Déterminer la cible de l'avis et vérifier les permissions
        let cibleId;
        let cibleRole;
        let aDejaLaisseAvis = false;

        if (auteurRole === 'employeur' && auteurId === candidature.employeurId._id.toString()) {
            cibleId = candidature.travailleurId._id;
            cibleRole = candidature.travailleurId.role; // Devrait être 'travailleur'
            aDejaLaisseAvis = candidature.avisEmployeurLaisse;
        } else if (auteurRole === 'travailleur' && auteurId === candidature.travailleurId._id.toString()) {
            cibleId = candidature.employeurId._id;
            cibleRole = candidature.employeurId.role; // Devrait être 'employeur'
            aDejaLaisseAvis = candidature.avisTravailleurLaisse;
        } else {
            return next(new AppError('Vous n\'êtes pas autorisé à laisser un avis pour cette candidature (incohérence auteur/rôle).', 403));
        }
        
        if (cibleRole !== 'travailleur' && cibleRole !== 'employeur') {
             return next(new AppError('Le rôle de la cible de l\'avis est invalide.', 500)); // Erreur interne logique
        }

        if (aDejaLaisseAvis) {
            return next(new AppError('Vous avez déjà soumis un avis pour cette candidature.', 409));
        }

        // L'index unique sur (auteurId, candidatureId) dans le modèle Avis gèrera aussi la prévention de double avis.

        const nouvelAvis = new Avis({
            auteurId,
            auteurRole,
            cibleId,
            cibleRole,
            annonceId: candidature.annonceId._id, // Extraire l'ID de l'annonce de la candidature populée
            candidatureId: candidature._id,
            note,
            commentaire,
        });

        await nouvelAvis.save(); // Le hook post-save mettra à jour les stats de `cibleId`

        // Mettre à jour la candidature pour marquer que l'avis a été laissé
        const updateCandidature = {};
        if (auteurRole === 'employeur') updateCandidature.avisEmployeurLaisse = true;
        if (auteurRole === 'travailleur') updateCandidature.avisTravailleurLaisse = true;
        await Candidature.findByIdAndUpdate(candidature._id, updateCandidature);

        // Notifier l'utilisateur qui a été noté
        const auteurInfo = await User.findById(auteurId).select('nom email'); // Pour le message de notif
        await notificationService.createNotificationJobLink(
            cibleId,
            'NOUVEL_AVIS_RECU', // Assurez-vous que ce type est dans votre notificationModel.js
            `${auteurInfo.nom || auteurInfo.email} a laissé un avis (note: ${note}/5) vous concernant pour la prestation liée à l'annonce "${candidature.annonceId.titre}".`,
            `/profil/${cibleId}#avis`, // Ou un lien plus spécifique si vous avez une page d'avis détaillée
            { nomAuteur: auteurInfo.nom || auteurInfo.email, noteRecue: note, nomAnnonce: candidature.annonceId.titre }
        );

        res.status(201).json({ success: true, message: 'Avis soumis avec succès.', avis: nouvelAvis });

    } catch (error) {
        logger.error("Erreur laisserAvis:", error);
        if (error.code === 11000 && error.keyPattern && error.keyPattern.candidatureId && error.keyPattern.auteurId) {
            return next(new AppError('Vous avez déjà soumis un avis pour cette candidature (erreur DB).', 409));
        }
        next(error); // Déléguer au gestionnaire d'erreurs global
    }
};

exports.getAvisPourUtilisateur = async (req, res, next) => {
    try {
        const { utilisateurId } = req.params;
        const { page = 1, limit = 5, note } = req.query;

        if (!mongoose.Types.ObjectId.isValid(utilisateurId)) {
            return next(new AppError("ID d'utilisateur invalide.", 400));
        }

        const queryFilters = { 
            cibleId: utilisateurId, 
            estApprouve: true, 
            estVisible: true 
        };
        if (note && !isNaN(parseInt(note)) && parseInt(note) >= 1 && parseInt(note) <= 5) {
            queryFilters.note = parseInt(note);
        }
        
        const countPromise = Avis.countDocuments(queryFilters);
        const avisRecusPromise = Avis.find(queryFilters)
            .populate('auteurId', 'nom prenom photoDeProfil.cheminAcces role')
            .populate('annonceId', 'titre')
            .populate('candidatureId', '_id') // Optionnel: pour référence
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        
        const utilisateurPromise = User.findById(utilisateurId).select('profil.noteMoyenne profil.nombreAvis');

        const [count, avisRecus, utilisateur] = await Promise.all([countPromise, avisRecusPromise, utilisateurPromise]);

        res.status(200).json({
            success: true,
            avis: avisRecus,
            noteMoyenne: utilisateur && utilisateur.profil ? utilisateur.profil.noteMoyenne || 0 : 0,
            nombreTotalAvis: utilisateur && utilisateur.profil ? utilisateur.profil.nombreAvis || 0 : 0,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalAvisSurCettePage: avisRecus.length,
        });

    } catch (error) {
        logger.error("Erreur getAvisPourUtilisateur:", error);
        next(error);
    }
};
exports.getAvisRecus = async (req, res) => {
    try {
        const userId = req.user.userId;
        const avis = await Avis.find({ 
            cibleId: userId,
            estApprouve: true,
            estVisible: true 
        })
        .populate('auteurId', 'nom prenom photoDeProfil.cheminAcces role')
        .populate('annonceId', 'titre')
        .sort({ createdAt: -1 })
        .lean();
        
        res.json({ success: true, avis });
    } catch (err) {
        console.error('Erreur getAvisRecus:', err);
        res.status(500).json({ success: false, message: "Erreur serveur." });
    }
};