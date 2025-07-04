// utils/notificationManager.js (adapté pour JobLink)
const Notification = require('../models/notificationModel'); // Assurez-vous que c'est le bon chemin vers le modèle JobLink
const User = require('../models/usersModel');
const transport = require('../middlewares/sendMail'); // Votre transporteur Nodemailer
const mongoose = require('mongoose'); 

// Configuration des types de notifications qui déclenchent un email
const NOTIFICATIONS_AVEC_EMAIL_JOBLINK = [
    'COMPTE_VERIFIE_JOBLINK',         // Email de vérification (si vous l'utilisez)
    'NOUVELLE_CANDIDATURE_EMPLOYEUR',
    'BIENVENUE_JOBLINK',
    'MAJ_STATUT_CANDIDATURE_TRAVAILLEUR',
    'NOUVEAU_MESSAGE_UTILISATEUR',
    'MOT_DE_PASSE_MODIFIE',
    'COMPTE_UTILISATEUR_SUSPENDU',
    'ABONNEMENT_PREMIUM_ACTIVE_UTILISATEUR',
    'ANNONCE_EXPIRE_BIENTOT_EMPLOYEUR',
    'ANNONCE_REJETEE_EMPLOYEUR',      // Important que l'employeur sache pourquoi
    'SIGNALEMENT_TRAITE_UTILISATEUR', // Bonne pratique
];

function generateDefaultTitleJobLink(typeNotification, metadata = {}) {
    // metadata peut contenir des infos comme nomAnnonce, nomUtilisateur, etc.
    switch (typeNotification) {
        case 'BIENVENUE_JOBLINK': return 'Bienvenue sur JobLink !';
        case 'COMPTE_VERIFIE_JOBLINK': return 'Votre compte JobLink est vérifié';
        case 'NOUVELLE_CANDIDATURE_EMPLOYEUR': return `Nouvelle candidature pour votre annonce "${metadata.nomAnnonce || '...'}"`;
        case 'MAJ_STATUT_CANDIDATURE_TRAVAILLEUR': return `Mise à jour de votre candidature pour "${metadata.nomAnnonce || '...'}"`;
        case 'NOUVEAU_MESSAGE_UTILISATEUR': return `Nouveau message de ${metadata.nomExpediteur || 'un utilisateur'}`;
        case 'ANNONCE_CREEE_EMPLOYEUR': return 'Votre annonce JobLink a été créée';
        case 'ANNONCE_MODIFIEE_EMPLOYEUR': return 'Votre annonce JobLink a été modifiée';
        case 'ANNONCE_APPROUVEE_EMPLOYEUR': return `Bonne nouvelle ! Votre annonce "${metadata.nomAnnonce || '...'}" a été approuvée`;
        case 'ANNONCE_REJETEE_EMPLOYEUR': return `Information concernant votre annonce "${metadata.nomAnnonce || '...'}"`;
        case 'ANNONCE_EXPIRE_BIENTOT_EMPLOYEUR': return `Votre annonce "${metadata.nomAnnonce || '...'}" expire bientôt`;
        case 'ANNONCE_EXPIREE_EMPLOYEUR': return `Votre annonce "${metadata.nomAnnonce || '...'}" a expiré`;
        case 'PROFIL_MIS_A_JOUR': return 'Votre profil JobLink a été mis à jour';
        case 'MOT_DE_PASSE_MODIFIE': return 'Votre mot de passe JobLink a été modifié';
        case 'COMPTE_UTILISATEUR_SUSPENDU': return 'Alerte de sécurité : Votre compte JobLink';
        case 'COMPTE_UTILISATEUR_REACTIVE': return 'Votre compte JobLink a été réactivé';
        case 'ABONNEMENT_PREMIUM_ACTIVE_UTILISATEUR': return 'Votre abonnement Premium JobLink est actif !';
        case 'ABONNEMENT_PREMIUM_EXPIRE_BIENTOT_UTILISATEUR': return 'Votre abonnement Premium JobLink expire bientôt';
        case 'ABONNEMENT_PREMIUM_EXPIRE_UTILISATEUR': return 'Votre abonnement Premium JobLink a expiré';
        case 'SIGNALEMENT_RECU_ADMIN': return 'Nouveau signalement reçu sur JobLink';
        case 'SIGNALEMENT_TRAITE_UTILISATEUR': return 'Votre signalement sur JobLink a été traité';
        case 'NOUVEL_UTILISATEUR_INSCRIT_ADMIN': return 'Nouvel utilisateur inscrit sur JobLink';
        case 'NOUVELLE_ANNONCE_A_VALIDER_ADMIN': return 'Nouvel annonce a valider sur JobLink';
        case 'ADMIN_ACTION_SUR_COMPTE': return 'Mise à jour importante de votre compte JobLink';
        case 'PRESTATION_TERMINEE_AVIS_OUVERT': return 'Prestation Terminée - Laissez votre avis !';
        case 'ADMIN_ACTION_SUR_ANNONCE': return `Mise à jour de votre annonce "${metadata.nomAnnonce || '...'}" par un administrateur`;
        default: return 'Notification Importante de JobLink';
    }
}

async function createNotificationJobLink(idUtilisateurDestinataire, typeNotification, message, lienInterne = '', metadata = {}) {
    try {
        if (!idUtilisateurDestinataire || !typeNotification || !message) {
            console.warn("JOBLINK_NOTIF_MGR: Données manquantes pour la création.", { idUtilisateurDestinataire, typeNotification, message });
            return null;
        }
        
        const titreNotif = generateDefaultTitleJobLink(typeNotification, metadata);

        const notification = new Notification({
            idUtilisateurDestinataire,
            typeNotification,
            titre: titreNotif,
            message,
            lienInterne,
            metadata
        });
        await notification.save();

        // Log in-app (pour le dev)
        console.log(`---- JOBLINK NOTIFICATION IN-APP ----\nPour: User ID ${idUtilisateurDestinataire}\nType: ${typeNotification}\nTitre: ${titreNotif}\nMessage: ${message}\nLien: ${lienInterne}\n-----------------------------`);

        // Logique d'envoi d'email
        if (NOTIFICATIONS_AVEC_EMAIL_JOBLINK.includes(typeNotification)) {
            const destinataire = await User.findById(idUtilisateurDestinataire).select('email nom prenom'); // Adaptez les champs nom/prénom
            if (destinataire && destinataire.email) {
                const nomCompletDestinataire = `${destinataire.prenom || ''} ${destinataire.nom || ''}`.trim() || 'Utilisateur JobLink';
                
                // Template HTML simple pour l'email (améliorez avec des vrais templates)
                const emailHtml = `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                        <h2>${titreNotif}</h2>
                        <p>Bonjour ${nomCompletDestinataire},</p>
                        <p>${message.replace(/\n/g, '<br>')}</p>
                        ${lienInterne ? `<p><a href="${process.env.FRONTEND_URL || 'http://localhost:8000'}${lienInterne}" style="display: inline-block; padding: 10px 15px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Voir les détails</a></p>` : ''}
                        <p>Si vous n'êtes pas à l'origine de cette action ou si vous avez des questions, n'hésitez pas à contacter notre support.</p>
                        <p>Cordialement,<br/>L'équipe JobLink</p>
                        <hr>
                        <p style="font-size: 0.8em; color: #777;">Ceci est un message automatique, veuillez ne pas répondre directement à cet email.</p>
                    </div>
                `;

                const mailOptions = {
                    from: `"JobLink" <${process.env.NODE_CODE_SENDING_EMAIL_ADDRESS}>`,
                    to: destinataire.email,
                    subject: `JobLink: ${titreNotif}`,
                    html: emailHtml
                };

                try {
                    await transport.sendMail(mailOptions);
                    notification.emailEnvoye = true;
                    notification.dateEmailEnvoye = new Date();
                    await notification.save();
                    console.log(`JOBLINK_NOTIF_MGR: Email (${typeNotification}) envoyé à ${destinataire.email}.`);
                } catch (emailError) {
                    console.error(`JOBLINK_NOTIF_MGR ERREUR: Email (${typeNotification}) non envoyé à ${destinataire.email}`, emailError);
                }
            } else {
                console.warn(`JOBLINK_NOTIF_MGR: Email non envoyé pour notif ID ${notification._id}, utilisateur ou email non trouvé.`);
            }
        }
        return notification;
    } catch (error) {
        console.error("JOBLINK_NOTIF_MGR ERREUR: Impossible de créer la notification.", error);
        return null;
    }
}

async function createAdminNotificationJobLink(typeNotification, message, lienInterne = '', metadata = {}) {
    try {
        const admins = await User.find({ role: 'admin' }).select('_id'); // Uniquement les IDs
        if (admins.length === 0) {
            console.warn("JOBLINK_NOTIF_MGR: Aucun admin trouvé pour type", typeNotification);
            return;
        }
        
        const titreNotif = generateDefaultTitleJobLink(typeNotification, metadata);

        const notificationsPromises = admins.map(admin => {
            // Pas besoin d'envoyer un email aux admins pour chaque notification admin, sauf si critique.
            // Ici, on se concentre sur la notification in-app pour les admins.
            // L'email peut être géré spécifiquement si un type le requiert.
            const notifPourAdmin = new Notification({
                idUtilisateurDestinataire: admin._id,
                typeNotification,
                titre: titreNotif,
                message,
                lienInterne,
                metadata
            });
            return notifPourAdmin.save(); // Sauvegarder et retourner la promesse
        });

        await Promise.all(notificationsPromises);
        console.log(`JOBLINK_NOTIF_MGR: Notifications admin de type '${typeNotification}' créées pour ${admins.length} admin(s).`);

    } catch (error) {
        console.error("JOBLINK_NOTIF_MGR ERREUR: Notif admin non envoyée.", error);
    }
}

module.exports = { createNotificationJobLink, createAdminNotificationJobLink };