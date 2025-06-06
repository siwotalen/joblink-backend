const express = require('express');
const categorieController = require('../controllers/categorieController');
const { identifier } = require('../middlewares/identification');
const { isAdmin } = require('../middlewares/authorization'); // Ou authorizeRoles('admin', 'moderateur')

const router = express.Router();

// Routes Admin
router.post('/', identifier, isAdmin, categorieController.createCategorie);
router.put('/:id', identifier, isAdmin, categorieController.updateCategorie);
router.delete('/:id', identifier, isAdmin, categorieController.deleteCategorie);

// Route pour tous les utilisateurs authentifiés
router.get('/', identifier, categorieController.getAllCategories);

module.exports = router;