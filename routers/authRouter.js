const express = require('express');
const authController = require('../controllers/authController');
const { identifier } = require('../middlewares/identification');
const { loginLimiter, apiLimiter } = require('../middlewares/Limiter');
const router = express.Router();
router.post('/signup',authController.signup);
router.post('/signin',loginLimiter,authController.signin);
router.post('/signout',identifier,authController.signout);
router.post('/update-profile-user',identifier,authController.updateProfilUser);

router.patch('/send-verification-code',identifier,authController.SendVerificationCode);
router.patch('/verify-verification-code',identifier,authController.verifyVerificationCode);

router.patch('/change-password',identifier,authController.changePassword);
router.patch('/send-forgot-password-code',loginLimiter,authController.SendForgotPasswordCode);
router.patch('/verify-forgot-password-code',authController.verifyForgotPasswordCode);
router.patch('/change-password-after-verification',authController.changePasswordAfterVerification);

module.exports=router;