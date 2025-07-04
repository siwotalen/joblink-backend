// utils/scheduler.js
const cron = require('node-cron');
const Annonce = require('../models/annonceModel'); // Adaptez le chemin
const User = require('../models/usersModel'); // Adaptez le chemin
const { createNotificationJobLink } = require('./notificationManager'); // Adaptez le chemin
const logger = require('./logger'); // Votre logger Winston
const Candidature = require('../models/candidatureModel');
/**
 * Tâche pour marquer les annonces actives comme expirées si leur dateExpiration est passée.
 * S'exécute tous les jours à 01:00 du matin (configurable).
 */
const marquerAnnoncesExpirees = () => {
    // '0 1 * * *' = Tous les jours à 01:00 AM
    // Pour tester plus fréquemment, vous pouvez utiliser par ex. '*/1 * * * *' (toutes les minutes)
    // Attention : ne laissez pas une fréquence de test élevée en production.
    cron.schedule(process.env.CRON_MARQUER_ANNONCES_EXPIREES || '0 1 * * *', async () => {
        logger.info('[CRON_JOB] Exécution : Vérification des annonces expirées...');
        try {
            const maintenant = new Date();
            const annoncesAExpirer = await Annonce.find({ 
                statut: 'active', 
                dateExpiration: { $lt: maintenant } 
            }).select('_id titre employeurId'); // Sélectionner seulement les champs nécessaires

            if (annoncesAExpirer.length === 0) {
                logger.info('[CRON_JOB] Aucune annonce active à marquer comme expirée.');
                return;
            }

            const idsAnnoncesAExpirer = annoncesAExpirer.map(a => a._id);

            const result = await Annonce.updateMany(
                { _id: { $in: idsAnnoncesAExpirer } },
                { $set: { statut: 'expiree' } }
            );

            logger.info(`[CRON_JOB] ${result.modifiedCount} annonce(s) marquée(s) comme expirée(s).`);

            // Envoyer des notifications aux employeurs concernés
            for (const annonce of annoncesAExpirer) {
                if (annonce.employeurId) {
                    await createNotificationJobLink(
                        annonce.employeurId,
                        'ANNONCE_EXPIREE_EMPLOYEUR',
                        `Votre annonce "${annonce.titre}" a expiré et n'est plus visible par les candidats. Vous pouvez la réactiver ou en créer une nouvelle.`,
                        `/mes-annonces/${annonce._id}`, // Ou un lien vers la gestion de l'annonce
                        { nomAnnonce: annonce.titre }
                    );
                }
            }

        } catch (error) {
            logger.error('[CRON_JOB] Erreur lors de la tâche de vérification des annonces expirées:', error);
        }
    });
    logger.info('[SCHEDULER] Tâche "marquerAnnoncesExpirees" planifiée.');
};


/**
 * Tâche pour notifier les employeurs dont les annonces expirent bientôt.
 * S'exécute tous les jours à 02:00 du matin (configurable).
 * Notifie pour les annonces expirant dans X jours (configurable).
 */
const notifierAnnoncesExpirantBientot = () => {
    cron.schedule(process.env.CRON_NOTIF_ANNONCES_EXPIRE_BIENTOT || '0 2 * * *', async () => {
        logger.info('[CRON_JOB] Exécution : Vérification des annonces expirant bientôt...');
        try {
            const joursAvantExpirationPourNotif = parseInt(process.env.JOURS_AVANT_EXPIRATION_NOTIF) || 3; // Ex: 3 jours avant
            const maintenant = new Date();
            const dateLimiteNotif = new Date();
            dateLimiteNotif.setDate(maintenant.getDate() + joursAvantExpirationPourNotif);

            const annoncesConcernées = await Annonce.find({
                statut: 'active',
                dateExpiration: { 
                    $gte: maintenant, // Doit encore être valide
                    $lte: dateLimiteNotif // Mais expire dans les X prochains jours
                },
                // Optionnel: s'assurer de ne pas notifier plusieurs fois pour la même annonce
                // ON pourrais ajouter un champ `derniereNotifExpirationEnvoyee` à l'annonce
                // et filtrer ici pour ne pas re-notifier si déjà fait récemment.
            }).select('_id titre employeurId dateExpiration');

            if (annoncesConcernées.length === 0) {
                logger.info('[CRON_JOB] Aucune annonce expirant bientôt à notifier.');
                return;
            }

            logger.info(`[CRON_JOB] ${annoncesConcernées.length} annonce(s) expirant bientôt à notifier.`);

            for (const annonce of annoncesConcernées) {
                if (annonce.employeurId) {
                    const joursRestants = Math.ceil((new Date(annonce.dateExpiration) - maintenant) / (1000 * 60 * 60 * 24));
                    await createNotificationJobLink(
                        annonce.employeurId,
                        'ANNONCE_EXPIRE_BIENTOT_EMPLOYEUR',
                        `Attention, votre annonce "${annonce.titre}" expirera dans environ ${joursRestants} jour(s) (le ${new Date(annonce.dateExpiration).toLocaleDateString('fr-FR')}). Pensez à la renouveler si besoin.`,
                        `/mes-annonces/${annonce._id}`,
                        { nomAnnonce: annonce.titre, dateExpiration: annonce.dateExpiration }
                    );
                    // Mettre à jour l'annonce pour marquer que la notification a été envoyée
                    // await Annonce.findByIdAndUpdate(annonce._id, { derniereNotifExpirationEnvoyee: new Date() });
                }
            }
        } catch (error) {
            logger.error('[CRON_JOB] Erreur lors de la tâche de notification des annonces expirant bientôt:', error);
        }
    });
    logger.info('[SCHEDULER] Tâche "notifierAnnoncesExpirantBientot" planifiée.');
};

/**
 * Tâche pour notifier les utilisateurs dont l'abonnement premium expire bientôt.
 * S'exécute tous les jours à 03:00 du matin (configurable).
 */
const notifierAbonnementsPremiumExpirantBientot = () => {
    cron.schedule(process.env.CRON_NOTIF_ABONNEMENTS_EXPIRE_BIENTOT || '0 3 * * *', async () => {
        logger.info('[CRON_JOB] Exécution : Vérification des abonnements premium expirant bientôt...');
        try {
            const joursAvantExpirationPourNotifAbo = parseInt(process.env.JOURS_AVANT_EXPIRATION_ABO_NOTIF) || 7; // Ex: 7 jours avant
            const maintenant = new Date();
            const dateLimiteNotifAbo = new Date();
            dateLimiteNotifAbo.setDate(maintenant.getDate() + joursAvantExpirationPourNotifAbo);

            const utilisateursConcernes = await User.find({
                $or: [{typeAbonnement: 'premium_travailleur'}, {typeAbonnement: 'premium_employeur'}],
                dateFinAbonnement: {
                    $gte: maintenant,
                    $lte: dateLimiteNotifAbo
                },
                // Penser a Ajouter un champ pour ne pas notifier plusieurs fois (ex: `notifRappelAboEnvoyee: Boolean`)
            }).select('_id email nom prenom dateFinAbonnement');

            if (utilisateursConcernes.length === 0) {
                logger.info('[CRON_JOB] Aucun abonnement premium expirant bientôt à notifier.');
                return;
            }
            
            logger.info(`[CRON_JOB] ${utilisateursConcernes.length} abonnement(s) premium expirant bientôt à notifier.`);

            for (const utilisateur of utilisateursConcernes) {
                 const joursRestants = Math.ceil((new Date(utilisateur.dateFinAbonnement) - maintenant) / (1000 * 60 * 60 * 24));
                 await createNotificationJobLink(
                    utilisateur._id,
                    'ABONNEMENT_PREMIUM_EXPIRE_BIENTOT_UTILISATEUR',
                    `Votre abonnement Premium JobLink arrive à expiration dans environ ${joursRestants} jour(s) (le ${new Date(utilisateur.dateFinAbonnement).toLocaleDateString('fr-FR')}). Renouvelez-le pour continuer à profiter de tous les avantages !`,
                    '/premium', // Lien vers la page de renouvellement/gestion d'abonnement
                    { dateFinAbonnement: utilisateur.dateFinAbonnement }
                );
                // Mettre à jour l'utilisateur pour marquer que la notification a été envoyée
                // await User.findByIdAndUpdate(utilisateur._id, { notifRappelAboEnvoyee: true });
            }

        } catch (error) {
            logger.error('[CRON_JOB] Erreur lors de la tâche de notification des abonnements premium expirant bientôt:', error);
        }
    });
    logger.info('[SCHEDULER] Tâche "notifierAbonnementsPremiumExpirantBientot" planifiée.');
};

const terminerCandidaturesAutomatiquement = () => {
    cron.schedule(process.env.CRON_TERMINER_CANDIDATURES || '0 0 * * *', async () => { // Tous les jours à minuit
        logger.info('[CRON_JOB] Exécution : Vérification des candidatures à terminer automatiquement...');
        try {
            const maintenant = new Date();
            const DELAI_AVIS_JOURS = parseInt(process.env.DELAI_AVIS_JOURS) || 7;

            // Sélectionner les candidatures acceptées dont la date de fin estimée est passée
            // et qui n'ont pas encore été marquées comme terminées.
            const candidaturesATerminer = await Candidature.find({
                statut: 'acceptee',
                dateFinPrestationEstimeeCandidature: { $lt: maintenant },
            }).populate('annonceId', 'titre'); // Pour le message de notification

            if (candidaturesATerminer.length === 0) {
                logger.info('[CRON_JOB] Aucune candidature à terminer automatiquement.');
                return;
            }

            logger.info(`[CRON_JOB] ${candidaturesATerminer.length} candidature(s) à marquer comme terminée(s) automatiquement.`);

            for (const cand of candidaturesATerminer) {
                cand.statut = 'terminee_automatiquement';
                cand.datePrestationEffectivementTerminee = cand.dateFinPrestationEstimeeCandidature; // Ou new Date()
                cand.avisPeriodeOuverteJusquau = new Date(cand.datePrestationEffectivementTerminee.getTime() + DELAI_AVIS_JOURS * 24 * 60 * 60 * 1000);
                await cand.save();

                // Notifier les deux parties
                const titreAnnonce = cand.annonceId ? cand.annonceId.titre : "une annonce";
                const messageNotif = `La période estimée pour la prestation concernant l'annonce "${titreAnnonce}" est terminée. Vous avez ${DELAI_AVIS_JOURS} jours pour laisser un avis.`;
                const lienAvis = `/avis/laisser?candidatureId=${cand._id}`; // Adaptez le lien

                await notificationService.createNotificationJobLink(cand.travailleurId, 'PRESTATION_TERMINEE_AVIS_OUVERT', messageNotif, lienAvis);
                await notificationService.createNotificationJobLink(cand.employeurId, 'PRESTATION_TERMINEE_AVIS_OUVERT', messageNotif, lienAvis);
            }

        } catch (error) {
            logger.error('[CRON_JOB] Erreur lors de la tâche de terminaison automatique des candidatures:', error);
        }
    });
    logger.info('[SCHEDULER] Tâche "terminerCandidaturesAutomatiquement" planifiée.');
};


// Fonction pour initialiser toutes les tâches planifiées
exports.initScheduledJobs = () => {
    marquerAnnoncesExpirees();
    notifierAnnoncesExpirantBientot();
    notifierAbonnementsPremiumExpirantBientot();
    terminerCandidaturesAutomatiquement();
    // Ajoutez d'autres tâches ici
};