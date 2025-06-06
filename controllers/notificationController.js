// controllers/notificationController.js
const Notification = require('../models/notificationModel');
const mongoose = require('mongoose');

exports.getMesNotifications = async (req, res) => {
    try {
        const { page = 1, limit = 10, lu } = req.query;
        const queryFilters = { userId: req.user.userId };

        if (lu !== undefined) { // Filtrer par statut lu/non lu
            queryFilters.lu = lu === 'true';
        }

        const count = await Notification.countDocuments(queryFilters);
        const notifications = await Notification.find(queryFilters)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        
        // Compter uniquement les non lues pour un badge par exemple
        const nombreNonLus = await Notification.countDocuments({ userId: req.user.userId, lu: false });

        res.status(200).json({
            success: true,
            notifications,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalNotifications: count,
            nombreNonLus
        });
    } catch (error) {
        console.error("Erreur getMesNotifications:", error);
        res.status(500).json({ success: false, message: "Erreur serveur." });
    }
};

exports.marquerNotificationCommeLue = async (req, res) => {
    try {
        const { id } = req.params; // ID de la notification
        const { userId } = req.user;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID de notification invalide.' });
        }

        const notification = await Notification.findOneAndUpdate(
            { _id: id, userId: userId }, // S'assurer que l'utilisateur ne marque que ses propres notifications
            { $set: { lu: true } },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification non trouvée ou non accessible.' });
        }
        res.status(200).json({ success: true, message: 'Notification marquée comme lue.', notification });
    } catch (error) {
        console.error("Erreur marquerNotificationCommeLue:", error);
        res.status(500).json({ success: false, message: "Erreur serveur." });
    }
};

exports.marquerToutesNotificationsCommeLues = async (req, res) => {
    try {
        const { userId } = req.user;
        await Notification.updateMany(
            { userId: userId, lu: false },
            { $set: { lu: true } }
        );
        res.status(200).json({ success: true, message: 'Toutes les notifications ont été marquées comme lues.' });
    } catch (error) {
        console.error("Erreur marquerToutesNotificationsCommeLues:", error);
        res.status(500).json({ success: false, message: "Erreur serveur." });
    }
};