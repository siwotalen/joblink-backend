const nodemailer = require('nodemailer')
/**
 * Fonction générique pour envoyer un email.
 * @param {string} destinataireEmail - L'email du destinataire.
 * @param {string} sujet - Le sujet de l'email.
 * @param {string} htmlContent - Le contenu HTML de l'email.
 * @param {string} textContent - (Optionnel) Le contenu texte brut de l'email.
 * @returns {Promise<boolean>} - True si l'email est accepté pour envoi, false sinon.
 */
exports.envoyerEmail = async (destinataireEmail, sujet, htmlContent, textContent = '') => {
    if (!destinataireEmail || !sujet || !htmlContent) {
        console.error("Tentative d'envoi d'email avec des données manquantes.");
        return false;
    }

    const mailOptions = {
        from: `"JobLink" <${process.env.NODE_CODE_SENDING_EMAIL_ADDRESS}>`, // Personnalisez le nom de l'expéditeur
        to: destinataireEmail,
        subject: sujet,
        text: textContent || htmlContent.replace(/<[^>]*>?/gm, ''), // Version texte simple si non fournie
        html: htmlContent,
    };

    try {
        const info = await transport.sendMail(mailOptions);
        console.log(`Email envoyé à ${destinataireEmail}: ${info.messageId}`);
        return true; // Ou info si vous avez besoin de plus de détails
    } catch (error) {
        console.error(`Erreur lors de l'envoi de l'email à ${destinataireEmail}:`, error);
        return false;
    }
};

// Exemples de templates HTML simples (à améliorer avec des vrais templates)
exports.templatesEmail = {
    notificationGenerique: (message, lien) => `
        <p>Bonjour,</p>
        <p>${message}</p>
        ${lien ? `<p><a href="${process.env.FRONTEND_URL}${lien}">Voir les détails</a></p>` : ''}
        <p>Cordialement,<br/>L'équipe JobLink</p>
    `,
    nouveauMessage: (nomExpediteur, lienConversation) => `
        <p>Bonjour,</p>
        <p>Vous avez reçu un nouveau message de la part de <strong>${nomExpediteur}</strong>.</p>
        <p><a href="${process.env.FRONTEND_URL}${lienConversation}">Consulter le message</a></p>
        <p>Cordialement,<br/>L'équipe JobLink</p>
    `,
    // Ajoutez d'autres templates ici...
};