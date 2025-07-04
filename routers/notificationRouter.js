const express = require('express');
const notificationController = require('../controllers/notificationController');
const { identifier } = require('../middlewares/identification');


const router = express.Router();


router.get(
    '/',
    identifier,
    notificationController.getMesNotifications // ou notificationController.getMesNotifications
);

// Marquer une notification comme lue
router.patch(
    '/:id/marquer-lu',
    identifier,
    notificationController.marquerNotificationCommeLue // ou notificationController.marquerNotificationCommeLue
);

// Marquer toutes mes notifications comme lues
router.patch(
    'marquer-tout-lu',
    identifier,
    notificationController.marquerToutesNotificationsCommeLues // ou notificationController.markAllMyNotificationsAsRead
);
// router.get(
//     '/:notificationId', // :notificationId sera req.params.notificationId
//     identifier,
//     notificationController.getSingleNotification // ou notificationController.getSingleNotification
// );
 module.exports = router;