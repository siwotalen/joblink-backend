const express = require('express');
const paiementController = require('../controllers/paiementController');
const { identifier } = require('../middlewares/identification');
// const { authorizeRoles } = require('../middlewares/authorization'); // Pas forcément pour initier

const router = express.Router();

// L'utilisateur initie une demande de paiement pour un produit/service
router.post('/initier-simulation', identifier, paiementController.initierPaiementSimule);

// Le frontend appelle cette route après que l'utilisateur ait "confirmé" sur une page de simulation
// Dans un vrai système, ce serait un webhook appelé par la passerelle de paiement
router.post('/confirmer-simulation/:transactionId', identifier, paiementController.confirmerPaiementSimule);

// Nouvelles routes pour les produits et abonnements
router.get('/produits', identifier, paiementController.getProduitsDisponibles);
router.get('/abonnement', identifier, paiementController.getAbonnementActuel);

// Optionnel: Route pour que l'utilisateur voie ses propres transactions
// router.get('/mes-transactions', identifier, paiementController.getMesTransactions);

module.exports = router;