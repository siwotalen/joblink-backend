// controllers/notificationController.js
const Notification = require('../models/notificationModel'); // Assurez-vous que le chemin est correct
const mongoose = require('mongoose');
const logger = require('../utils/logger'); // Assurez-vous que le chemin est correct
const AppError = require('../utils/appError'); // Assurez-vous que le chemin est correct

exports.getMesNotifications = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, estLue } = req.query;
        const queryFilters = { idUtilisateurDestinataire: req.user.userId };

        if (estLue !== undefined) {
            queryFilters.estLue = estLue === 'true';
        }

        const countPromise = Notification.countDocuments(queryFilters);
        const notificationsPromise = Notification.find(queryFilters)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((page - 1) * parseInt(limit))
            .exec();
        
        const nombreNonLusPromise = Notification.countDocuments({ idUtilisateurDestinataire: req.user.userId, estLue: false });

        const [count, notifications, nombreNonLus] = await Promise.all([countPromise, notificationsPromise, nombreNonLusPromise]);

        res.status(200).json({
            success: true,
            notifications,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalNotifications: count,
            nombreNonLus
        });
    } catch (error) {
        logger.error("Erreur getMesNotifications:", error);
        next(error);
    }
};

exports.marquerNotificationCommeLue = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { userId } = req.user;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new AppError('ID de notification invalide.', 400));
        }

        const notification = await Notification.findOneAndUpdate(
            { _id: id, idUtilisateurDestinataire: userId },
            { $set: { estLue: true, dateLecture: new Date() } },
            { new: true }
        );

        if (!notification) {
            return next(new AppError('Notification non trouvée ou non accessible.', 404));
        }
        
        res.status(200).json({ success: true, message: 'Notification marquée comme lue.', notification });
    } catch (error) {
        logger.error("Erreur marquerNotificationCommeLue:", error);
        next(error);
    }
};

exports.marquerToutesNotificationsCommeLues = async (req, res, next) => {
    try {
        const { userId } = req.user;
        
        await Notification.updateMany(
            { idUtilisateurDestinataire: userId, estLue: false },
            { $set: { estLue: true, dateLecture: new Date() } }
        );
        
        res.status(200).json({ success: true, message: 'Toutes les notifications ont été marquées comme lues.' });
    } catch (error) {
        logger.error("Erreur marquerToutesNotificationsCommeLues:", error);
        next(error);
    }
};

exports.supprimerNotification = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { userId } = req.user;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new AppError('ID de notification invalide.', 400));
        }

        const notification = await Notification.findOneAndDelete(
            { _id: id, idUtilisateurDestinataire: userId }
        );

        if (!notification) {
            return next(new AppError('Notification non trouvée ou non accessible.', 404));
        }
        
        res.status(200).json({ success: true, message: 'Notification supprimée avec succès.' });
    } catch (error) {
        logger.error("Erreur supprimerNotification:", error);
        next(error);
    }
};