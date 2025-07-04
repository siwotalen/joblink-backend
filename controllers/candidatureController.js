const Candidature = require('../models/candidatureModel');
const Annonce = require('../models/annonceModel');
const User = require('../models/usersModel'); // Pour les notifications
// const Notification = require('../models/notificationModel'); // À créer si pas déjà fait
const { createCandidatureSchema, updateStatutCandidatureSchema } = require('../middlewares/validator');
const mongoose = require('mongoose');
const { createNotificationJobLink,createAdminNotificationJobLink } = require('../utils/notificationManager');
const logger = require('../utils/logger'); // Assurez-vous que logger est importé
const AppError = require('../utils/appError');
// Travailleur: Postuler à une annonce
exports.postulerAnnonce = async (req, res) => {
    try {
        const { error, value } = createCandidatureSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const { annonceId, lettreMotivation } = value;
        const travailleurId = req.user.userId;
        const annonce = await Annonce.findById(annonceId).select('titre employeurId statut');;
            if (!annonce) {
            return res.status(404).json({ success: false, message: 'Annonce non trouvée.' }); // Message plus précis
        }
        
            if (annonce.statut !== 'active') {
            return res.status(404).json({ success: false, message: `Cette annonce n'est plus active.` }); // Message plus précis
        }

        if (annonce.dateExpiration < new Date()) {
            return res.status(404).json({ success: false, message: 'Cette annonce a expiré.' }); // Message plus précis
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
        const { page = 1, limit = 10, statut } = req.query; // <<< On récupère le paramètre 'statut'
        const skip = (page - 1) * limit;

        const queryFilters = { 
            travailleurId: travailleurId 
        };
        
        // --- CORRECTION : AJOUTER LE FILTRE DE STATUT ---
        if (statut) {
            // S'assurer que le statut est valide pour éviter des injections,
            // bien que Mongoose devrait le rejeter si ce n'est pas dans l'enum.
            const statutsValides = ['en_attente', 'vue', 'preselectionnee', 'rejete', 'acceptee', 'terminee_automatiquement', 'terminee_manuellement'];
            if (statutsValides.includes(statut)) {
                queryFilters.statut = statut;
            } else {
                // Optionnel: renvoyer une erreur si le statut n'est pas valide
                return next(new AppError(`Le statut de filtre '${statut}' n'est pas valide.`, 400));
            }
        }
        // --- FIN DE LA CORRECTION ---

        const countPromise = Candidature.countDocuments(queryFilters);
        const candidaturesPromise = Candidature.find(queryFilters)
            .populate({
                path: 'annonceId',
                select: 'titre localisation.ville remuneration typeContrat',
                // Populer l'employeur à travers l'annonce pour avoir son nom et logo
                populate: {
                    path: 'employeurId',
                    select: 'profil.nomEntreprise nom prenom profil.logoEntreprise'
                }
            })
            .sort({ createdAt: -1 }) // Trier par date de création de la candidature
            .skip(skip)
            .limit(parseInt(limit));

        const [count, candidatures] = await Promise.all([countPromise, candidaturesPromise]);

        res.status(200).json({ 
            success: true, 
            candidatures,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalCandidatures: count
        });
    } catch (error) {
        logger.error("Erreur getMesCandidatures:", error);
        next(error);
    }
};

// Employeur: Mettre à jour le statut d'une candidature
exports.updateStatutCandidature = async (req, res, next) => {
    try {
        const candidatureId = req.params.id;
        const employeurId = req.user.userId;
        const DELAI_AVIS_JOURS = parseInt(process.env.DELAI_AVIS_JOURS) || 7;

        const { error, value } = updateStatutCandidatureSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        const { statut } = value;

        const candidature = await Candidature.findOne({ _id: candidatureId, employeurId });
        if (!candidature) {
            return res.status(404).json({ success: false, message: 'Candidature non trouvée ou non accessible.' });
        }

        // Cas spécial : terminer manuellement
        if (statut === 'terminee_manuellement') {
            if (candidature.statut !== 'acceptee') {
                return res.status(400).json({ success: false, message: 'Seules les candidatures acceptées peuvent être marquées comme terminées.' });
            }
            candidature.statut = 'terminee_manuellement';
            candidature.datePrestationEffectivementTerminee = new Date();
            candidature.avisPeriodeOuverteJusquau = new Date(Date.now() + DELAI_AVIS_JOURS * 24 * 60 * 60 * 1000);
            await candidature.save();

            // Notifier les deux parties
            const annonce = await Annonce.findById(candidature.annonceId).select('titre');
            await createNotificationJobLink(
                candidature.travailleurId,
                'PRESTATION_TERMINEE_AVIS_OUVERT',
                `La prestation pour l'annonce "${annonce.titre}" a été marquée comme terminée. Vous avez ${DELAI_AVIS_JOURS} jours pour laisser un avis.`,
                `/avis/laisser?candidatureId=${candidature._id}`
            );
            await createNotificationJobLink(
                employeurId,
                'PRESTATION_TERMINEE_AVIS_OUVERT',
                `Vous avez marqué la prestation pour "${annonce.titre}" comme terminée. Vous avez ${DELAI_AVIS_JOURS} jours pour laisser un avis.`,
                `/avis/laisser?candidatureId=${candidature._id}`
            );
            return res.status(200).json({ success: true, message: 'Prestation marquée comme terminée. La période d\'avis est ouverte.', candidature });
        }

        // Cas classique : accepter, rejeter, etc.
        if (statut === 'acceptee' && candidature.statut !== 'acceptee') {
            candidature.dateAcceptation = Date.now();
            // Récupérer l'annonce pour copier dateFinPrestationEstimee
            const annonceLiee = await Annonce.findById(candidature.annonceId).select('dateFinPrestationEstimee');
            if (annonceLiee && annonceLiee.dateFinPrestationEstimee) {
                candidature.dateFinPrestationEstimeeCandidature = annonceLiee.dateFinPrestationEstimee;
            } else {
                logger.warn(`L'annonce ${candidature.annonceId} n'a pas de dateFinPrestationEstimee pour la candidature ${candidature._id}`);
            }
        }
        candidature.statut = statut;
        candidature.dateMiseAJourStatut = Date.now();
        await candidature.save();

        const annonceInfo = await Annonce.findById(candidature.annonceId).select('titre');
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

exports.getMaCandidatureDetail = async (req, res, next) => {
    try {
        const { candidatureId } = req.params;
        const travailleurId = req.user.userId;

        if (!mongoose.Types.ObjectId.isValid(candidatureId)) {
            return next(new AppError("ID de candidature invalide.", 400));
        }

        const candidature = await Candidature.findOne({ _id: candidatureId, travailleurId: travailleurId })
            .populate({
                path: 'annonceId',
                select: 'titre description localisation remuneration dateDebutSouhaitee dureeMission employeurId',
                populate: {
                    path: 'employeurId',
                    select: 'nom prenom profil.nomEntreprise'
                }
            })
            .populate({
                path: 'annonceId',
                populate: {
                    path: 'categorieId',
                    select: 'nom'
                }
            });
            

        if (!candidature) {
            return next(new AppError('Candidature non trouvée ou vous n\'êtes pas autorisé à la voir.', 404));
        }

        res.status(200).json({ success: true, candidature });
    } catch (error) {
        logger.error("Erreur getMaCandidatureDetail:", error);
        next(error);
    }
};

exports.retirerCandidature = async (req, res, next) => {
    try {
        const { id } = req.params; // ID de la candidature à supprimer
        const travailleurId = req.user.userId; // ID de l'utilisateur authentifié

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new AppError('ID de candidature invalide.', 400));
        }

        // 1. Trouver la candidature
        const candidature = await Candidature.findById(id);

        if (!candidature) {
            return next(new AppError('Candidature non trouvée.', 404));
        }

        // 2. Vérifier que l'utilisateur est bien le propriétaire de la candidature
        if (candidature.travailleurId.toString() !== travailleurId) {
            return next(new AppError('Action non autorisée. Vous ne pouvez retirer que vos propres candidatures.', 403));
        }

        // 3. (Optionnel) Vérifier si la candidature peut encore être retirée.
        // Par exemple, vous pourriez interdire le retrait si la prestation est déjà "terminée".
        const statutsNonRetirables = ['terminee_automatiquement', 'terminee_manuellement'];
        if (statutsNonRetirables.includes(candidature.statut)) {
            return next(new AppError(`Vous ne pouvez pas retirer une candidature pour une prestation déjà marquée comme terminée.`, 400));
        }

        // 4. Supprimer la candidature
        await Candidature.findByIdAndDelete(id);

        // 5. (Optionnel) Notifier l'employeur que la candidature a été retirée.
        // C'est une bonne pratique pour qu'il ne voie pas une candidature "fantôme".
        const annonce = await Annonce.findById(candidature.annonceId).select('titre');
        const travailleur = await User.findById(travailleurId).select('nom prenom email');
        if (candidature.employeurId) {
            await createNotificationJobLink( // Assurez-vous que le nom de la fonction est correct
                candidature.employeurId,
                'CANDIDATURE_RETIREE_EMPLOYEUR', // Nouveau type de notification à ajouter
                `Le candidat ${travailleur.nom || travailleur.email} a retiré sa candidature pour votre annonce "${annonce ? annonce.titre : 'une de vos annonces'}".`,
                `/dashboard/employeur/annonces/${candidature.annonceId}/candidatures`, // Lien vers la liste des candidatures de l'annonce
                { nomCandidat: travailleur.nom || travailleur.email, titreAnnonce: annonce ? annonce.titre : '' }
            );
        }

        // 6. Renvoyer une réponse de succès
        res.status(200).json({ success: true, message: 'Candidature retirée avec succès.' });

    } catch (error) {
        logger.error("Erreur retirerCandidature:", error);
        next(error);
    }
};
// controllers/candidatureController.js (Backend)
exports.getRecentesCandidaturesPourEmployeur = async (req, res, next) => {
    try {
        const employeurId = req.user.userId;
        const limit = parseInt(req.query.limit) || 3;

        const candidatures = await Candidature.find({ employeurId })
            .sort({ createdAt: -1 }) // Trier par date de candidature
            .limit(limit)
            .populate({ path: 'travailleurId', select: 'nom prenom photoDeProfil.cheminAcces' })
            .populate({ path: 'annonceId', select: 'titre' });

        res.status(200).json({ success: true, candidatures });
    } catch (error) {
        logger.error("Erreur getRecentesCandidaturesPourEmployeur:", error);
        next(error);
    }
};
exports.getCandidatureDetailPourEmployeur = async (req, res, next) => {
    try {
        const { id } = req.params;
        const employeurId = req.user.userId;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new AppError("ID de candidature invalide.", 400));
        }

        // On vérifie que la candidature appartient bien à une annonce de cet employeur
        const candidature = await Candidature.findOne({ _id: id, employeurId })
            .populate({
                path: 'travailleurId',
                select: 'nom prenom email ville quartier profil competences experiences documents photoDeProfil avisRecus'
            })
           .populate({
                path: 'annonceId',
                select: 'titre description localisation remuneration typeContrat dateDebutSouhaitee dureeMission'
            })

        if (!candidature) {
            return next(new AppError('Candidature non trouvée ou non accessible.', 404));
        }

        res.status(200).json({ success: true, candidature });
    } catch (error) {
        logger.error("Erreur getCandidatureDetailPourEmployeur:", error);
        next(error);
    }
};