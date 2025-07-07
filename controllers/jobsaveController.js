const User = require('../models/usersModel');
const Annonce = require('../models/annonceModel');

exports.getSavedJobs = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).lean();
        if (!user || !user.savedJobs || user.savedJobs.length === 0) {
            return res.json({ success: true, jobs: [] });
        }
        const jobs = await Annonce.find({ _id: { $in: user.savedJobs } })
            .populate('employeurId', 'profil.nomEntreprise nom prenom profil.logoEntreprise')
            .lean();
        res.json({ success: true, jobs });
    } catch (err) {
        res.status(500).json({ success: false, message: "Erreur serveur." });
    }
};

// Ajouter un job aux sauvegardes
exports.saveJob = async (req, res) => {
    try {
        
        const { jobId } = req.body;
        
        if (!jobId) {
            return res.status(400).json({ success: false, message: "ID du job requis." });
        }

        // Vérifier que l'annonce existe
        const annonce = await Annonce.findById(jobId);
        if (!annonce) {
            return res.status(404).json({ success: false, message: "Annonce non trouvée." });
        }

        // Vérifier si le job est déjà sauvegardé
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "Utilisateur non trouvé." });
        }
        
        if (user.savedJobs.includes(jobId)) {
            return res.status(400).json({ success: false, message: "Cette annonce est déjà sauvegardée." });
        }

        // Ajouter le job aux sauvegardes
        user.savedJobs.push(jobId);
        await user.save();

        res.json({ success: true, message: "Annonce sauvegardée avec succès." });
    } catch (err) {
        console.error('Erreur lors de la sauvegarde:', err);
        res.status(500).json({ success: false, message: "Erreur serveur." });
    }
};

// Supprimer un job des sauvegardes
exports.unsaveJob = async (req, res) => {
    try {        
        const { jobId } = req.body;
        
        if (!jobId) {
            return res.status(400).json({ success: false, message: "ID du job requis." });
        }

        // Supprimer le job des sauvegardes
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "Utilisateur non trouvé." });
        }
        
        user.savedJobs = user.savedJobs.filter(id => id.toString() !== jobId);
        await user.save();

        res.json({ success: true, message: "Annonce retirée des sauvegardes." });
    } catch (err) {
        console.error('Erreur lors de la suppression:', err);
        res.status(500).json({ success: false, message: "Erreur serveur." });
    }
};

// Vérifier si un job est sauvegardé
exports.isJobSaved = async (req, res) => {
    try {
        const { jobId } = req.params;
        
        if (!jobId) {
            return res.status(400).json({ success: false, message: "ID du job requis." });
        }

        const user = await User.findById(req.user.userId);
        const isSaved = user.savedJobs.includes(jobId);

        res.json({ success: true, isSaved });
    } catch (err) {
        console.error('Erreur lors de la vérification:', err);
        res.status(500).json({ success: false, message: "Erreur serveur." });
    }
};