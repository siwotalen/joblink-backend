// models/notificationModel.js (adapté pour JobLink)
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    idUtilisateurDestinataire: { // L'utilisateur qui doit recevoir la notification
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    typeNotification: {
        type: String,
        enum: [
            // JobLink Specific Notifications
            'BIENVENUE_JOBLINK',                // Inscription réussie
            'COMPTE_VERIFIE_JOBLINK',         // Email vérifié (si applicable)
            'NOUVELLE_CANDIDATURE_EMPLOYEUR', // Pour l'employeur: un travailleur a postulé
            'MAJ_STATUT_CANDIDATURE_TRAVAILLEUR',// Pour le travailleur: l'employeur a changé le statut
            'NOUVEAU_MESSAGE_UTILISATEUR',      // Pour le destinataire d'un message
            'ANNONCE_CREEE_EMPLOYEUR',        // Pour l'employeur: confirmation de création d'annonce
            'ANNONCE_MODIFIEE_EMPLOYEUR',     // Pour l'employeur: confirmation de modification d'annonce
            'ANNONCE_APPROUVEE_EMPLOYEUR',    // Pour l'employeur: si modération admin
            'ANNONCE_REJETEE_EMPLOYEUR',      // Pour l'employeur: si modération admin
            'ANNONCE_EXPIRE_BIENTOT_EMPLOYEUR',// Pour l'employeur: rappel avant expiration
            'ANNONCE_EXPIREE_EMPLOYEUR',      // Pour l'employeur: annonce expirée
            'PROFIL_MIS_A_JOUR',              // Confirmation de mise à jour de profil
            'MOT_DE_PASSE_MODIFIE',         // Confirmation de changement de mot de passe
            'COMPTE_UTILISATEUR_SUSPENDU',    // Pour l'utilisateur: son compte est suspendu par un admin
            'COMPTE_UTILISATEUR_REACTIVE',    // Pour l'utilisateur: son compte est réactivé
            'ABONNEMENT_PREMIUM_ACTIVE_UTILISATEUR',// Pour l'utilisateur: son premium est activé
            'ABONNEMENT_PREMIUM_EXPIRE_BIENTOT_UTILISATEUR', // Pour l'utilisateur: rappel avant expiration premium
            'ABONNEMENT_PREMIUM_EXPIRE_UTILISATEUR',// Pour l'utilisateur: son premium a expiré
            'SIGNALEMENT_RECU_ADMIN',         // Pour l'admin: un nouveau signalement a été fait
            'SIGNALEMENT_TRAITE_UTILISATEUR', // Pour l'utilisateur qui a signalé: son signalement a été traité
            'NOUVEL_UTILISATEUR_INSCRIT_ADMIN', // Pour l'admin: un nouvel utilisateur s'est inscrit
            'ADMIN_ACTION_SUR_COMPTE',        // Pour l'utilisateur: un admin a modifié son compte (rôle, abo)
            'ADMIN_ACTION_SUR_ANNONCE',       // Pour l'employeur: un admin a modifié son annonce
            'NOUVELLE_ANNONCE_A_VALIDER_ADMIN', // Pour l'admin: une nouvelle annonce nécessite validation
            'PRESTATION_TERMINEE_AVIS_OUVERT', // Pour le travailleur et l'employeur: prestation terminée, avis ouvert
            'GENERIQUE_INFO_JOBLINK',         // Pour des messages d'information généraux
            'GENERIQUE_ALERTE_JOBLINK'        // Pour des alertes importantes
        ],
        required: true
    },
    titre: {
        type: String,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    estLue: {
        type: Boolean,
        default: false,
        index: true
    },
    dateLecture: { type: Date },
    lienInterne: {
        type: String,
        trim: true
    },
    metadata: { // Données supplémentaires
        type: mongoose.Schema.Types.Mixed 
    },
    // Pour l'envoi d'email (hérité de votre structure, c'est bien)
    emailEnvoye: { type: Boolean, default: false },
    dateEmailEnvoye: { type: Date },
}, {
    timestamps: true
});

notificationSchema.index({ idUtilisateurDestinataire: 1, estLue: 1, createdAt: -1 });
notificationSchema.index({ typeNotification: 1, emailEnvoye: 1, createdAt: -1 });


module.exports = mongoose.model('NotificationJobLink', notificationSchema); // Nommer différemment si besoin