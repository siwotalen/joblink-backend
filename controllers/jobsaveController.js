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