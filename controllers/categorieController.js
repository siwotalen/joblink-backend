const Categorie = require('../models/categorieModel');
const { createCategorieSchema, updateCategorieSchema } = require('../middlewares/validator');

// Admin: Créer une catégorie
exports.createCategorie = async (req, res) => {
    try {
        const { error, value } = createCategorieSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const existingCategorie = await Categorie.findOne({ nom: value.nom });
        if (existingCategorie) {
            return res.status(409).json({ success: false, message: 'Cette catégorie existe déjà.' });
        }

        const nouvelleCategorie = new Categorie(value);
        await nouvelleCategorie.save();
        res.status(201).json({ success: true, message: 'Catégorie créée avec succès.', categorie: nouvelleCategorie });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la création de la catégorie.' });
    }
};

// Tous les utilisateurs authentifiés: Lister les catégories
exports.getAllCategories = async (req, res) => {
    try {
        const categories = await Categorie.find().sort({ nom: 1 });
        res.status(200).json({ success: true, categories });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la récupération des catégories.' });
    }
};

// Admin: Mettre à jour une catégorie
exports.updateCategorie = async (req, res) => {
    try {
        const { id } = req.params;
        const { error, value } = updateCategorieSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const categorie = await Categorie.findByIdAndUpdate(id, value, { new: true, runValidators: true });
        if (!categorie) {
            return res.status(404).json({ success: false, message: 'Catégorie non trouvée.' });
        }
        res.status(200).json({ success: true, message: 'Catégorie mise à jour.', categorie });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la mise à jour.' });
    }
};

// Admin: Supprimer une catégorie
exports.deleteCategorie = async (req, res) => {
    try {
        const { id } = req.params;
        // TODO: Avant de supprimer, vérifier si des annonces utilisent cette catégorie.
        // Si oui, soit interdire la suppression, soit réaffecter les annonces, soit les supprimer aussi (dangereux).
        // Pour l'instant, suppression simple.
        const categorie = await Categorie.findByIdAndDelete(id);
        if (!categorie) {
            return res.status(404).json({ success: false, message: 'Catégorie non trouvée.' });
        }
        res.status(200).json({ success: true, message: 'Catégorie supprimée.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la suppression.' });
    }
};