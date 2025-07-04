const Signalement = require('../models/signalementModel');
const Annonce = require('../models/annonceModel');
const User = require('../models/usersModel');
const { createSignalementSchema } = require('../middlewares/validator');
const mongoose = require('mongoose');
const { createNotificationJobLink,createAdminNotificationJobLink } = require('../utils/notificationManager');


exports.createSignalement = async (req, res) => {
    try {
        const { error, value } = createSignalementSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const { cibleType, cibleId, raison, commentaire } = value;
        const signaleParUserId = req.user.userId;

        // Vérifier que la cible existe
        let cibleExiste;
        if (cibleType === 'Annonce') {
            cibleExiste = await Annonce.findById(cibleId);
        } else if (cibleType === 'User') {
            cibleExiste = await User.findById(cibleId);
            if (cibleExiste && cibleExiste._id.toString() === signaleParUserId) {
                return res.status(400).json({ success: false, message: "Vous ne pouvez pas vous signaler vous-même." });
            }
        }

        if (!cibleExiste) {
            return res.status(404).json({ success: false, message: `${cibleType} non trouvé(e).` });
        }

        // Vérifier si un signalement similaire existe déjà par cet utilisateur pour cette cible (optionnel)
        const signalementExistant = await Signalement.findOne({
            signaleParUserId,
            cibleId,
            cibleType,
            raison, // Peut-être trop restrictif, on pourrait enlever 'raison'
            statut: 'nouveau' // Ne pas permettre de recréer si un est déjà en 'nouveau'
        });
        if (signalementExistant) {
            return res.status(409).json({ success: false, message: "Vous avez déjà signalé ce contenu pour une raison similaire et il est en attente de traitement." });
        }


        const nouveauSignalement = new Signalement({
            signaleParUserId,
            cibleType,
            cibleId,
            raison,
            commentaire,
        });

        await nouveauSignalement.save();
        await createAdminNotificationJobLink(
            'SIGNALEMENT_RECU_ADMIN',
            `Nouveau signalement (${raison}) pour ${cibleType} ID: ${cibleId}. Signalé par ${req.user.email}.`,
            null, // Pas forcément de lien direct, ou un lien vers "Mes signalements" si cela existe
            { statutSignalement: statut, cibleType: updatedSignalement.cibleType }
        );
        res.status(201).json({ success: true, message: 'Signalement envoyé avec succès. Il sera examiné par notre équipe.', signalement: nouveauSignalement });

    } catch (error) {
        console.error("Erreur createSignalement:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la création du signalement.' });
    }
};

// Voir toutes les offres signalées, avec filtres (catégorie, statut)
exports.getOffresSignalees = async (req, res) => {
    try {
        const { categorie, statut } = req.query;
        // On ne veut que les signalements sur des annonces
        let filter = { cibleType: 'Annonce' };
        if (statut) filter.statut = statut;
        if (categorie) filter.raison = categorie;

        // On regroupe par annonce signalée
        const signalements = await Signalement.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: "$cibleId",
                    raisons: { $addToSet: "$raison" },
                    statuts: { $addToSet: "$statut" },
                    totalSignalements: { $sum: 1 },
                    dernierSignalement: { $max: "$createdAt" }
                }
            },
            {
                $lookup: {
                    from: "annonces",
                    localField: "_id",
                    foreignField: "_id",
                    as: "annonce"
                }
            },
            { $unwind: "$annonce" },
            { $sort: { dernierSignalement: -1 } }
        ]);

        // On ne retourne pas les infos sur qui a signalé
        res.json({ success: true, offresSignalees: signalements });
    } catch (e) {
        res.status(500).json({ success: false, message: "Erreur serveur", error: e.message });
    }
};