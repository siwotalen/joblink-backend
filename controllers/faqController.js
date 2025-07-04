const FaqItem = require('../models/faqItemModel');
const { createFaqItemSchema, updateFaqItemSchema } = require('../middlewares/validator');
const mongoose = require('mongoose');

// --- Fonctions pour l'Admin ---

exports.createFaqItem = async (req, res) => {
    try {
        const { error, value } = createFaqItemSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const existingFaq = await FaqItem.findOne({ question: value.question });
        if (existingFaq) {
            return res.status(409).json({ success: false, message: 'Cette question existe déjà dans la FAQ.' });
        }

        const newFaqItem = new FaqItem(value);
        await newFaqItem.save();
        res.status(201).json({ success: true, message: 'Item FAQ créé avec succès.', faqItem: newFaqItem });
    } catch (error) {
        console.error("Erreur createFaqItem:", error);
        if (error.code === 11000) { // Erreur d'unicité (sur la question)
            return res.status(409).json({ success: false, message: 'Cette question existe déjà dans la FAQ.' });
        }
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

exports.updateFaqItem = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID d\'item FAQ invalide.' });
        }

        const { error, value } = updateFaqItemSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        // Si la question est modifiée, vérifier qu'elle ne duplique pas une autre existante
        if (value.question) {
            const existingFaqWithSameQuestion = await FaqItem.findOne({ question: value.question, _id: { $ne: id } });
            if (existingFaqWithSameQuestion) {
                return res.status(409).json({ success: false, message: 'Une autre question avec ce titre existe déjà.' });
            }
        }

        const updatedFaqItem = await FaqItem.findByIdAndUpdate(id, { $set: value }, { new: true, runValidators: true });
        if (!updatedFaqItem) {
            return res.status(404).json({ success: false, message: 'Item FAQ non trouvé.' });
        }
        res.status(200).json({ success: true, message: 'Item FAQ mis à jour.', faqItem: updatedFaqItem });
    } catch (error) {
        console.error("Erreur updateFaqItem:", error);
         if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Cette question existe déjà.' });
        }
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

exports.deleteFaqItem = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID d\'item FAQ invalide.' });
        }

        const deletedFaqItem = await FaqItem.findByIdAndDelete(id);
        if (!deletedFaqItem) {
            return res.status(404).json({ success: false, message: 'Item FAQ non trouvé.' });
        }
        res.status(200).json({ success: true, message: 'Item FAQ supprimé.' });
    } catch (error) {
        console.error("Erreur deleteFaqItem:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

exports.getAllFaqItemsAdmin = async (req, res) => { // Pour que l'admin voie tout, y compris inactifs
    try {
        const { page = 1, limit = 20, categorie, sortBy = 'categorie', order = 'asc' } = req.query;
        const queryFilters = {};
        if (categorie) queryFilters.categorie = categorie;

        const sortOptions = {};
        if (sortBy === 'categorie') {
            sortOptions['categorie'] = order === 'asc' ? 1 : -1;
            sortOptions['ordreAffichage'] = 1; // Puis par ordre d'affichage
            sortOptions['question'] = 1;     // Puis par question
        } else {
            sortOptions[sortBy] = order === 'asc' ? 1 : -1;
        }
        
        const count = await FaqItem.countDocuments(queryFilters);
        const faqItems = await FaqItem.find(queryFilters)
            .sort(sortOptions)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        res.status(200).json({ 
            success: true, 
            faqItems,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalFaqItems: count,
        });
    } catch (error) {
        console.error("Erreur getAllFaqItemsAdmin:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};


// --- Fonction pour les Utilisateurs (Public ou Authentifié) ---

exports.getActiveFaqItems = async (req, res) => {
    try {
        const faqItemsActifs = await FaqItem.find({ estActif: true })
            .sort({ categorie: 1, ordreAffichage: 1, question: 1 }); // Tri pour affichage groupé

        // Grouper par catégorie pour un affichage plus facile côté front
        const groupedFaq = faqItemsActifs.reduce((acc, item) => {
            const cat = item.categorie || 'Général';
            if (!acc[cat]) {
                acc[cat] = [];
            }
            acc[cat].push(item);
            return acc;
        }, {});

        res.status(200).json({ success: true, faqGrouped: groupedFaq, faqList: faqItemsActifs });
    } catch (error) {
        console.error("Erreur getActiveFaqItems:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};