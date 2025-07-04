const { envoyerEmail } = require('../utils/emailService');
const logger = require('../utils/logger');

exports.recevoirMessageContact = async (req, res, next) => {
    try {
        const { nom, email, sujet, message } = req.body;
        if (!nom || !email || !sujet || !message) {
            return res.status(400).json({ success: false, message: "Tous les champs sont requis." });
        }
        
        const emailAdmin = process.env.ADMIN_SUPPORT_EMAIL || process.env.NODE_CODE_SENDING_EMAIL_ADDRESS;
        const sujetEmail = `[JobLink Contact] - ${sujet}`;
        const htmlContent = `
            <h3>Nouveau message depuis le formulaire de contact JobLink</h3>
            <p><strong>Nom:</strong> ${nom}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Sujet:</strong> ${sujet}</p>
            <hr>
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap;">${message}</p>
        `;

        const emailEnvoye = await envoyerEmail(emailAdmin, sujetEmail, htmlContent);

        if (emailEnvoye) {
            res.status(200).json({ success: true, message: "Message envoyé avec succès." });
        } else {
            throw new Error("Le service d'email n'a pas pu envoyer le message.");
        }
    } catch (error) {
        logger.error("Erreur recevoirMessageContact:", error);
        next(error); // Déléguer au gestionnaire global d'erreurs
    }
};