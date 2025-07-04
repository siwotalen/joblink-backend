const express = require('express');
const adminController = require('../controllers/adminController');
const categorieController = require('../controllers/categorieController'); // Si gestion des catégories via /admin/categories
const annonceController = require('../controllers/annonceController'); // Pour la suppression d'annonce par l'admin
const { identifier } = require('../middlewares/identification');
const { isAdmin } = require('../middlewares/authorization'); // Middleware pour vérifier si l'utilisateur est admin
const faqController = require('../controllers/faqController');


const router = express.Router();

// Toutes les routes ici sont protégées et nécessitent d'être admin
router.use(identifier); // D'abord s'identifier
router.use(isAdmin);    // Puis vérifier que c'est un admin

// --- Routes pour la gestion des Utilisateurs ---
router.get('/users', adminController.getAllUsers);
router.post('/users', adminController.createUser); 
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id', adminController.updateUser);
// router.delete('/users/:id', adminController.deleteUser); // À implémenter  


// --- Routes pour la gestion des Annonces ---
router.get('/annonces', adminController.getAllAnnoncesAdmin);
router.put('/annonces/:id', adminController.updateAnnonceAdmin);
router.delete('/annonces/:id', annonceController.deleteAnnonce); // Réutilisation la fonction du annonceController
                                                              // car la logique de suppression est la même,
                                                              // c'est juste l'accès qui est contrôlé par isAdmin ici.

// --- Routes pour la gestion des Signalements ---
router.get('/signalements', adminController.getAllSignalements);
router.get('/signalements/:id', adminController.getSignalementByIdAdmin);
router.put('/signalements/:id', adminController.updateSignalementAdmin);

// Routes Admin pour la gestion de la FAQ
router.post('/faq', identifier, isAdmin, faqController.createFaqItem);
router.get('/faq', identifier, isAdmin, faqController.getAllFaqItemsAdmin); // Route admin pour voir tout
router.put('/faq/:id', identifier, isAdmin, faqController.updateFaqItem);
router.delete('/faq/:id', identifier, isAdmin, faqController.deleteFaqItem);

// --- Routes pour la gestion des Catégories ---
router.get('/categories', categorieController.getAllCategories); // Route pour tous les utilisateurs authentifiés
router.post('/categories', identifier, isAdmin, categorieController.createCategorie);
router.put('/categories/:id', identifier, isAdmin, categorieController.updateCategorie);
router.delete('/categories/:id', identifier, isAdmin, categorieController.deleteCategorie);

router.get('/transactions', adminController.getAllTransactions);
module.exports = router;