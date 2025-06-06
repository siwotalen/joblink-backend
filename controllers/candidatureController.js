const Candidature = require('../models/candidatureModel');
const Annonce = require('../models/annonceModel');
const User = require('../models/usersModel'); // Pour les notifications
// const Notification = require('../models/notificationModel'); // À créer si pas déjà fait
const { createCandidatureSchema, updateStatutCandidatureSchema } = require('../middlewares/validator');
const mongoose = require('mongoose');
const { createNotificationJobLink,createAdminNotificationJobLink } = require('../utils/notificationManager');

// Travailleur: Postuler à une annonce
exports.postulerAnnonce = async (req, res) => {
    try {
        const { error, value } = createCandidatureSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const { annonceId, lettreMotivation } = value;
        const travailleurId = req.user.userId;

        const annonce = await Annonce.findById(annonceId).select('titre employeurId');;
        if (!annonce || annonce.statut !== 'active' || annonce.dateExpiration < new Date()) {
            return res.status(404).json({ success: false, message: 'Annonce non trouvée, inactive ou expirée.' });
        }

        // Vérifier si le travailleur a déjà postulé
        const candidatureExistante = await Candidature.findOne({ annonceId, travailleurId });
        if (candidatureExistante) {
            return res.status(409).json({ success: false, message: 'Vous avez déjà postulé à cette annonce.' });
        }
        
        // Vérifier si l'utilisateur est bien un travailleur
        if (req.user.role !== 'travailleur') {
             return res.status(403).json({ success: false, message: 'Seuls les travailleurs peuvent postuler.' });
        }

        const nouvelleCandidature = new Candidature({
            annonceId,
            travailleurId,
            employeurId: annonce.employeurId, // Récupérer l'ID de l'employeur depuis l'annonce
            lettreMotivation,
        });

        await nouvelleCandidature.save();
        const travailleur = await User.findById(travailleurId).select('nom prenom email');
        await createNotificationJobLink(
            annonce.employeurId,
            'NOUVELLE_CANDIDATURE_EMPLOYEUR',
            `Vous avez reçu une nouvelle candidature de ${travailleur.nom || travailleur.email} pour votre annonce : "${annonce.titre}".`,
            `/tableau-de-bord/employeur/annonces/${annonceId}/candidatures/${nouvelleCandidature._id}`,
            { nomAnnonce: annonce.titre, nomCandidat: travailleur.nom || travailleur.email }
        );
        res.status(201).json({ success: true, message: 'Candidature envoyée avec succès.', candidature: nouvelleCandidature });

    } catch (err) {
        console.error("Erreur postulerAnnonce:", err);
         if (err.code === 11000) { // Erreur d'index unique (double postulation)
            return res.status(409).json({ success: false, message: 'Vous avez déjà postulé à cette annonce.' });
        }
        res.status(500).json({ success: false, message: 'Erreur serveur lors de l\'envoi de la candidature.' });
    }
};

// Employeur: Voir les candidatures pour UNE de SES annonces
exports.getCandidaturesPourAnnonce = async (req, res) => {
    try {
        const { annonceId } = req.params;
        const employeurId = req.user.userId;

        const annonce = await Annonce.findOne({ _id: annonceId, employeurId });
        if (!annonce) {
            return res.status(404).json({ success: false, message: 'Annonce non trouvée ou vous n\'êtes pas le propriétaire.' });
        }

        const candidatures = await Candidature.find({ annonceId })
            .populate('travailleurId', 'nom prenom email profil.competences profil.anneesExperience typeAbonnement ') // Renvoyer infos utiles du travailleur
            .sort({ dateCandidature: -1 });

        res.status(200).json({ success: true, candidatures });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

// Travailleur: Voir SES propres candidatures
exports.getMesCandidatures = async (req, res) => {
    try {
        const travailleurId = req.user.userId;
        const candidatures = await Candidature.find({ travailleurId })
            .populate('annonceId', 'titre localisation.ville remuneration statut') // Renvoyer infos utiles de l'annonce
            .sort({ dateCandidature: -1 });

        res.status(200).json({ success: true, candidatures });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

// Employeur: Mettre à jour le statut d'une candidature
exports.updateStatutCandidature = async (req, res) => {
    try {
        const { candidatureId } = req.params;
        const employeurId = req.user.userId;
        const { error, value } = updateStatutCandidatureSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        const { statut } = value;

        const candidature = await Candidature.findOne({ _id: candidatureId, employeurId });
        if (!candidature) {
            return res.status(404).json({ success: false, message: 'Candidature non trouvée ou non accessible.' });
        }
        if (statut === 'acceptee' && candidature.statut !== 'acceptee') {
            candidature.dateAcceptation = Date.now();
            // Récupérer l'annonce pour copier dateFinPrestationEstimee
            const annonceLiee = await Annonce.findById(candidature.annonceId).select('dateFinPrestationEstimee');
            if (annonceLiee && annonceLiee.dateFinPrestationEstimee) {
                candidature.dateFinPrestationEstimeeCandidature = annonceLiee.dateFinPrestationEstimee;
            } else {
                // Que faire si l'annonce n'a pas de date de fin estimée ?
                // Option 1: Ne pas mettre de date, cette candidature ne sera pas terminée automatiquement
                // Option 2: Mettre une date par défaut (ex: aujourd'hui + 30 jours)
                logger.warn(`L'annonce ${candidature.annonceId} n'a pas de dateFinPrestationEstimee pour la candidature ${candidature._id}`);
            }
        }
        candidature.statut = statut;
        candidature.dateMiseAJourStatut = Date.now();
        await candidature.save();
        const annonceInfo = await Annonce.findById(candidature.annonceId).select('titre');
        const travailleurInfo = await User.findById(candidature.travailleurId).select('nom prenom');
        let messageTravailleur = `Le statut de votre candidature pour l'annonce "${annonceInfo ? annonceInfo.titre : 'une annonce'}" a été mis à jour à : ${statut}.`;
        if (statut === 'acceptee') {
            messageTravailleur += " Félicitations ! L'employeur pourrait vous contacter bientôt.";
        } else if (statut === 'rejete') {
            messageTravailleur += " Ne vous découragez pas, continuez vos recherches !";
        }
        await createNotificationJobLink(
            candidature.travailleurId,
            'MAJ_STATUT_CANDIDATURE_TRAVAILLEUR',
            messageTravailleur,
            `/tableau-de-bord/travailleur/mes-candidatures`,
            { nomAnnonce: annonceInfo ? annonceInfo.titre : 'une annonce', nouveauStatut: statut }
        );
        res.status(200).json({ success: true, message: 'Statut de la candidature mis à jour.', candidature });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};
exports.marquerCandidatureTermineeManuellement = async (req, res, next) => {
    try {
        const { candidatureId } = req.params;
        const employeurId = req.user.userId;
        const DELAI_AVIS_JOURS = parseInt(process.env.DELAI_AVIS_JOURS) || 7;


        const candidature = await Candidature.findOne({ _id: candidatureId, employeurId });
        if (!candidature) return next(new AppError('Candidature non trouvée ou non accessible.', 404));
        if (candidature.statut !== 'acceptee') return next(new AppError('Seules les candidatures acceptées peuvent être marquées comme terminées.', 400));

        candidature.statut = 'terminee_manuellement';
        candidature.datePrestationEffectivementTerminee = new Date();
        candidature.avisPeriodeOuverteJusquau = new Date(Date.now() + DELAI_AVIS_JOURS * 24 * 60 * 60 * 1000);
        await candidature.save();

        // Notifier les deux parties
        const annonce = await Annonce.findById(candidature.annonceId).select('titre');
        await notificationService.createNotificationJobLink(candidature.travailleurId, 'PRESTATION_TERMINEE_AVIS_OUVERT', `La prestation pour l'annonce "${annonce.titre}" a été marquée comme terminée. Vous avez ${DELAI_AVIS_JOURS} jours pour laisser un avis.`, `/avis/laisser?candidatureId=${candidature._id}`);
        await notificationService.createNotificationJobLink(employeurId, 'PRESTATION_TERMINEE_AVIS_OUVERT', `Vous avez marqué la prestation pour "${annonce.titre}" comme terminée. Vous avez ${DELAI_AVIS_JOURS} jours pour laisser un avis.`, `/avis/laisser?candidatureId=${candidature._id}`);
        
        res.status(200).json({ success: true, message: 'Prestation marquée comme terminée. La période d\'avis est ouverte.', candidature });
    } catch (error) {
        next(error);
    }
};