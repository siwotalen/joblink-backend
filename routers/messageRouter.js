const express = require('express');
const messageController = require('../controllers/messageController');
const { identifier } = require('../middlewares/identification');

const router = express.Router();

// Envoyer un message (tous les utilisateurs authentifiés, avec logique de restriction dans le controller)
router.post('/', identifier, messageController.envoyerMessage);

// Récupérer une conversation avec un autre utilisateur
router.get('/conversation/:autreUtilisateurId', identifier, messageController.getConversation);

// Récupérer la liste de toutes les conversations (avec dernier message)
router.get('/conversations', identifier, messageController.getListeConversations);
router.get('/non-lus/total', identifier, messageController.getNombreTotalMessagesNonLus);

module.exports = router;