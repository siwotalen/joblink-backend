const Message = require('../models/messageModel');
const User = require('../models/usersModel'); // Pour vérifier l'existence du destinataire et pour les notifications
const Candidature = require('../models/candidatureModel'); // Pour lier un message à une candidature
const { createMessageSchema } = require('../middlewares/validator');
const mongoose = require('mongoose');
const { createNotificationJobLink,createAdminNotificationJobLink } = require('../utils/notificationManager');
const logger = require('../utils/logger'); // <<< AJOUTEZ CETTE LIGNE
const AppError = require('../utils/appError');
// Envoyer un message
exports.envoyerMessage = async (req, res) => {
    try {
        const { error, value } = createMessageSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const expediteurId = req.user.userId;
        const { destinataireId, contenu, annonceId, candidatureId } = value;

        if (expediteurId === destinataireId) {
            return res.status(400).json({ success: false, message: 'Vous ne pouvez pas vous envoyer de message à vous-même.' });
        }

        const destinataireExiste = await User.findById(destinataireId);
        if (!destinataireExiste) {
            return res.status(404).json({ success: false, message: 'Destinataire non trouvé.' });
        }

        // Logique de restriction : Qui peut envoyer un message à qui ?
        // Exemple: Un employeur ne peut contacter un travailleur que s'il a postulé à une de ses annonces (et que la candidature est présélectionnée?)
        // Ou un travailleur ne peut répondre qu'à un employeur qui l'a contacté.
        // Pour l'instant, on laisse ouvert si authentifié, mais à affiner.
        // Si une candidatureId est fournie, vérifier que l'expéditeur est soit l'employeur, soit le travailleur de cette candidature.
        if (candidatureId) {
            const candidature = await Candidature.findById(candidatureId);
            if (!candidature) return res.status(404).json({ success: false, message: "Candidature associée non trouvée." });
            if (candidature.employeurId.toString() !== expediteurId && candidature.travailleurId.toString() !== expediteurId) {
                return res.status(403).json({ success: false, message: "Vous n'êtes pas autorisé à envoyer un message concernant cette candidature." });
            }
            // S'assurer que le destinataire est bien l'autre partie de la candidature
            if ((candidature.employeurId.toString() === expediteurId && candidature.travailleurId.toString() !== destinataireId) ||
                (candidature.travailleurId.toString() === expediteurId && candidature.employeurId.toString() !== destinataireId)) {
                 return res.status(403).json({ success: false, message: "Le destinataire ne correspond pas à la candidature." });
            }
        }


        const nouveauMessage = new Message({
            expediteurId,
            destinataireId,
            contenu,
            annonceId, // Optionnel
            candidatureId // Optionnel
        });
        await nouveauMessage.save();
         const metadataPourNotif = {
            nomExpediteur: req.user.nom || req.user.email,
            // Si vous avez un ID de conversation explicite sur nouveauMessage, utilisez-le :
            conversationId: nouveauMessage.conversationId //si ce champ existait
        }
        const expediteurInfo = await User.findById(expediteurId).select('nom prenom');
        await createNotificationJobLink(
            destinataireId,
            'NOUVEAU_MESSAGE_UTILISATEUR',
            `Vous avez reçu un nouveau message de ${req.user.nom || req.user.email}. Aperçu : "${contenu.substring(0, 50)}..."`,
            `/messagerie/conversation/${expediteurId}`,
            { nomExpediteur: expediteurInfo.nom || req.user.email, conversationId: metadataPourNotif /* si vous avez un ID de conversation */ }
        );
        res.status(201).json({ success: true, message: 'Message envoyé.', nouveauMessage });
    } catch (err) {
        logger.error("Erreur envoyerMessage:", error); // Assurez-vous que logger est importé/défini
        // next(error); // Si vous utilisez le gestionnaire d'erreurs global
        res.status(500).json({ success: false, message: 'Erreur serveur lors de l\'envoi du message.' });
    }
};

exports.getConversation = async (req, res) => {
    try {
        const utilisateurConnecteId = req.user.userId;
        const autreUtilisateurId = req.params.autreUtilisateurId;


        if (!mongoose.Types.ObjectId.isValid(autreUtilisateurId)) {
             return res.status(400).json({ success: false, message: "ID de l'autre utilisateur invalide." });
        }

        const { page = 1, limit = 20, apresTimestamp } = req.query; // Nouveau paramètre query


        // Messages où l'utilisateur connecté est l'expéditeur ET l'autre est le destinataire
        // OU l'utilisateur connecté est le destinataire ET l'autre est l'expéditeur
        const query = {
            $or: [
                { expediteurId: utilisateurConnecteId, destinataireId: autreUtilisateurId },
                { expediteurId: autreUtilisateurId, destinataireId: utilisateurConnecteId },
            ]
        };
        if (apresTimestamp) {
    // S'assurer que le timestamp est valide
            const dateFiltre = new Date(parseInt(apresTimestamp));
            if (!isNaN(dateFiltre.getTime())) {
                query.createdAt = { $gt: dateFiltre };
            } else {
                logger.warn(`Timestamp invalide reçu pour le filtre 'apresTimestamp': ${apresTimestamp}`);
            }
        }
        const count = await Message.countDocuments(query);
        const messages = await Message.find(query)
            .populate('expediteurId', 'nom prenom email role photoDeProfil.cheminAcces')
            .populate('annonceId', 'titre _id') // Populer le titre de l'annonce si liée
            .populate({ // Populer l'annonce liée à la candidature si le message est lié à une candidature
                path: 'candidatureId',
                select: 'annonceId', // Sélectionner seulement l'ID de l'annonce
                populate: { path: 'annonceId', select: 'titre _id' } // Populer l'annonce depuis la candidature
            })
            .sort({ createdAt: apresTimestamp ? 1 : -1 })
        // Marquer les messages comme lus (ceux où l'utilisateur connecté est le destinataire)
        await Message.updateMany(
            { destinataireId: utilisateurConnecteId, expediteurId: autreUtilisateurId, lu: false },
            { $set: { lu: true, dateLecture: Date.now() } }
        );

        res.status(200).json({ 
            success: true, 
            messages: apresTimestamp ? messages : messages.reverse(), // Inverser seulement si pas de 'apresTimestamp'
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

// Récupérer la liste des conversations (dernier message de chaque interlocuteur)
exports.getListeConversations = async (req, res) => {
    try {
        const utilisateurConnecteId = req.user.userId;

        // Agrégation pour obtenir le dernier message de chaque conversation
        const conversations = await Message.aggregate([
            {
                $match: { // Messages impliquant l'utilisateur connecté
                    $or: [
                        { expediteurId: new mongoose.Types.ObjectId(utilisateurConnecteId) },
                        { destinataireId: new mongoose.Types.ObjectId(utilisateurConnecteId) }
                    ]
                }
            },
            { $sort: { createdAt: -1 } }, // Trier par date pour obtenir le dernier message
            {
                $group: { // Grouper par interlocuteur
                    _id: {
                        $cond: [ // Déterminer l'ID de l'interlocuteur
                            { $eq: ["$expediteurId", new mongoose.Types.ObjectId(utilisateurConnecteId)] },
                            "$destinataireId",
                            "$expediteurId"
                        ]
                    },
                    dernierMessage: { $first: "$$ROOT" }, // Prendre le premier document (le plus récent) du groupe
                    nombreNonLus: { // Compter les messages non lus de cet interlocuteur vers l'utilisateur connecté
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$destinataireId", new mongoose.Types.ObjectId(utilisateurConnecteId)] },
                                        { $eq: ["$lu", false] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            { $sort: { "dernierMessage.createdAt": -1 } }, // Trier les conversations par le dernier message
            {
                $lookup: { // Populer les informations de l'interlocuteur
                    from: 'users', // Nom de la collection des utilisateurs
                    localField: '_id',
                    foreignField: '_id',
                    as: 'interlocuteurInfo'
                }
            },
            { $unwind: "$interlocuteurInfo" }, // Dénormaliser pour avoir un objet unique
            {
                $project: { // Sélectionner les champs à retourner
                    _id: 0, // Exclure l'ID du groupe d'agrégation (qui est l'ID de l'interlocuteur)
                    interlocuteur: {
                        _id: "$interlocuteurInfo._id",
                        nom: "$interlocuteurInfo.nom",
                        prenom: "$interlocuteurInfo.prenom",
                        email: "$interlocuteurInfo.email",
                        role: "$interlocuteurInfo.role",
                        profil: "$interlocuteurInfo.profil"
                    },
                    dernierMessageContenu: "$dernierMessage.contenu",
                    dateDernierMessage: "$dernierMessage.createdAt",
                    estEnvoyeParMoi: {
                        $eq: ["$dernierMessage.expediteurId", new mongoose.Types.ObjectId(utilisateurConnecteId)]
                    },
                    nombreNonLus: "$nombreNonLus"
                }
            }
        ]);

        res.status(200).json({ success: true, conversations });
    } catch (err) {
        console.error("Erreur getListeConversations:", err);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

exports.getNombreTotalMessagesNonLus = async (req, res, next) => {
    try {
        const utilisateurConnecteId = req.user.userId;
        const count = await Message.countDocuments({
            destinataireId: utilisateurConnecteId,
            lu: false
        });
        res.status(200).json({ success: true, nombreTotalNonLus: count });
    } catch (error) {
        logger.error("Erreur getNombreTotalMessagesNonLus:", error);
        next(error);
    }
};
exports.getConversationWithUser = async (req, res, next) => {
    try {
        const userId = req.user.userId; // utilisateur connecté
        const otherUserId = req.params.userId; // l'autre utilisateur

        // Vérifie s'il existe AU MOINS UN message entre les deux utilisateurs
        const message = await Message.findOne({
            $or: [
                { expediteurId: userId, destinataireId: otherUserId },
                { expediteurId: otherUserId, destinataireId: userId }
            ]
        });

        if (message) {
            // Utilise l'id de l'autre utilisateur comme "conversationId" pour le frontend
            return res.json({ success: true, conversationId: otherUserId });
        } else {
            return res.json({ success: false, message: "Aucune conversation trouvée." });
        }
    } catch (err) {
        next(err);
    }
};