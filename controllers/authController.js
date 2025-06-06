const jwt = require('jsonwebtoken');
const { signupSchema } = require("../middlewares/validator");
const { signinSchema } = require("../middlewares/validator");
const { accepCodeSchema } = require("../middlewares/validator");
const { changePasswordSchema } = require("../middlewares/validator");
const { acceptFPSchema } = require("../middlewares/validator");
const  transport  = require("../middlewares/sendMail");
const { doHash, doHashValidation, hmacProcess } = require("../utils/hashing");
const { createNotificationJobLink,createAdminNotificationJobLink } = require('../utils/notificationManager');
const User = require("../models/usersModel");




exports.signup = async (req, res) => {
    // Attendre nom, prenom, telephone, email, password, role à l'inscription
    const { nom, prenom, telephone, email, password, role, profilData } = req.body; // profilData est optionnel à l'inscription
    try {
       const { error, value } = signupSchema.validate({ nom, prenom, telephone, email, password, role, profilData }); // Mettre à jour signupSchema
         if(error){
                return res.status(401).json({
                 success:false,
                 message:error.details[0].message,
                });
          }

          // Vérifier si le rôle est valide (déjà fait par l'enum Mongoose, mais une double vérif ne fait pas de mal)
          const rolesValides = ['travailleur', 'employeur']; // Seuls ceux-là peuvent s'inscrire eux-mêmes. Admin/Moderateur sont créés autrement.
          if (!rolesValides.includes(role)) {
              return res.status(400).json({ success: false, message: 'Rôle invalide pour l\'inscription.' });
          }

          const existingUser = await User.findOne({ email });
              if (existingUser) {
                      return res.status(401).json({
                          success: false,
                          message: 'Cet email est déjà utilisé.',
                      });
               }
          const hashedPassword = await doHash(password, 12);
          
          const newUser = new User({ 
            nom, 
            prenom, 
            telephone, 
            email, 
            password: hashedPassword, 
            role,
            // profil: profilData || {} // Si vous envoyez des données de profil initiales
          });

          // Gérer le profil initial si `profilData` est fourni et pertinent pour le rôle
          if (profilData) {
            if (role === 'travailleur' && typeof profilData === 'object') {
              newUser.profil = { ...profilData }; // Assurez-vous que profilData correspond à profilTravailleurSchema
            } else if (role === 'employeur' && typeof profilData === 'object') {
              newUser.profil = { ...profilData }; // Assurez-vous que profilData correspond à profilEmployeurSchema
            }
          } else {
            newUser.profil = {}; // Ou initialiser avec des valeurs par défaut si nécessaire
          }


          const result = await newUser.save();
            await createNotificationJobLink(
                result._id, // ID du nouvel utilisateur
                'BIENVENUE_JOBLINK',
                `Bienvenue sur JobLink, ${result.nom || result.email} ! Nous sommes ravis de vous accueillir. Complétez votre profil pour commencer à explorer les opportunités.`,
                '/profil/moi', // Lien vers la page de profil
                { nomUtilisateur: result.nom || result.email }
            );
            // Notifier l'admin d'une nouvelle inscription
            await createAdminNotificationJobLink(
                'NOUVEL_UTILISATEUR_INSCRIT_ADMIN',
                `Un nouvel utilisateur (${result.role}) s'est inscrit : ${result.email} (Nom: ${result.nom || 'N/A'}).`,
                `/admin/users/${result._id}`, // Lien vers le profil de l'utilisateur dans le backoffice admin
                { emailUtilisateur: result.email, roleUtilisateur: result.role }
            );
          result.password = undefined; 
          // Ne pas retourner tout 'result' ici.
          const userResponse = {
            _id: result._id,
            nom: result.nom,
            email: result.email,
            role: result.role,
            verified: result.verified,
            typeAbonnement: result.typeAbonnement
          };

          res.status(201).json({
              success: true,
              message: 'Votre compte a été créé avec succès.',
              user: userResponse,
          });
                
    } catch (error) {
        console.error("Erreur Signup:", error);
        if (error.code === 11000) { // Erreur de duplicité MongoDB (pour l'email unique)
            return res.status(409).json({ success: false, message: "Cet email est déjà utilisé." });
        }
        res.status(500).json({ success: false, message: "Une erreur s'est produite lors de la création du compte." });
    }   
}
exports.signin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const { error, value } = signinSchema.validate({ email, password }); // Assurez-vous que ce schéma est simple (email, password)
        if (error) {
            return res.status(401).json({
                success: false,
                message: error.details[0].message,
            });
        }

        const existingUser = await User.findOne({ email }).select('+password'); // Important de select password ici
        if (!existingUser || !existingUser.estActif) { // Vérifier aussi si le compte est actif
            return res.status(401).json({
                success: false,
                message: 'Utilisateur non trouvé ou compte inactif.',
            });
        }

        const isPasswordValid = await doHashValidation(password, existingUser.password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Email ou mot de passe incorrect.',
            });
        }

        // Infos à mettre dans le token JWT
        const tokenPayload = {
            userId: existingUser._id,
            email: existingUser.email,
            role: existingUser.role, // <<< AJOUTER LE ROLE DANS LE TOKEN !
            verified: existingUser.verified,
            typeAbonnement: existingUser.typeAbonnement 
        };

        const token = jwt.sign(
            tokenPayload,
            process.env.TOKEN_SECRET,
            {
                expiresIn: '8h', // ou '1d' pour une journée
            }
        );
        
        // Informations utilisateur à retourner (sans le mot de passe)
        const userResponse = {
            _id: existingUser._id,
            nom: existingUser.nom,
            prenom: existingUser.prenom,
            email: existingUser.email,
            role: existingUser.role,
            verified: existingUser.verified,
            typeAbonnement: existingUser.typeAbonnement,
            profil: existingUser.profil // Peut être volumineux, à voir si on le retourne ici ou via une route /profil
        };

        res.cookie('Authorization', `Bearer ${token}`, {
            expires: new Date(Date.now() + 8 * 3600000), // 8 heures
            httpOnly: process.env.NODE_ENV === 'production', // True en prod
            secure: process.env.NODE_ENV === 'production',   // True en prod (nécessite HTTPS)
            sameSite: 'Lax' // ou 'Strict' pour plus de sécurité CSRF si applicable
        })
        .json({
            success: true,
            token, // Retourner le token est utile pour les clients non-navigateur ou le stockage manuel
            message: 'Connexion réussie.',
            user: userResponse
        });
    } catch (error) {
        console.error("Erreur Signin:", error);
        res.status(500).json({ success: false, message: "Une erreur s'est produite lors de la connexion." });
    }
};
exports.signout = async (req, res) => {
    res 
    .clearCookie('Authorization')
    .status(200)
    .json({ success: true, message: 'logged out sucessfully' });
};
exports.SendVerificationCode = async (req, res) => {
    const { email } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (!existingUser) {
            return res
            .status(401)
            .json({ success: false, message: 'User does not exist',
            });
        }
        if (existingUser.verified) {
            return res
            .status(400)
            .json({ success: false, message: 'You are already verified!',
            });
        }
        const codeValue = Math.floor(Math.random() * 1000000).toString();
        let info = await transport.sendMail({
            from: process.env.NODE_CODE_SENDING_EMAIL_ADDRESS,
            to:existingUser.email,
            subject:"code de verification",
            html:'<h1>' + codeValue + '</h1>'
            
        })
        if(info.accepted[0] === existingUser.email){
           const hashedCodeValue = hmacProcess(
                codeValue, 
                process.env.HMAC_VERIFICATION_CODE_SECRET
            );
           existingUser.verificationCode = hashedCodeValue;
           existingUser.verificationCodeValidation = Date.now();
           await existingUser.save();
           return res.status(200).json({ success:true, message: 'code envoyer!' });

        }
        res.status(400).json({ success:true, message: 'Code send failled!' });
    }
    catch(error){
        console.log(error);
    }
}
exports.verifyVerificationCode = async (req, res) => {
    const { email, providedCode } = req.body;  
    try {
        const { error, value } = accepCodeSchema.validate({ email, providedCode });
        if (error) {
            return res.status(401).json({
                success: false,
                message: error.details[0].message,
            });
        }
        const codeValue =providedCode.toString();
        const existingUser = await User.findOne({email}).select("+verificationCode +verificationCodeValidation");
        if(!existingUser){
            return res
            .status(401)
            .json({ success: false, message: 'User does not exist',
            });
        }
        if(existingUser.verified){
            return res
            .status(400)
            .json({ success: false, message: 'You are already verified!',});
        }
        if(!existingUser.verificationCode || !existingUser.verificationCodeValidation){
            return res
            .status(400)
            .json({ success: false, message: 'something is wrong with the code!',});
        }
        if(Date.now() - existingUser.verificationCodeValidation > 5* 60 *1000){
            return res
            .status(400)
            .json({ success: false, message: 'code has been expired!',});
        }
        const hashedCodeValue = await hmacProcess(codeValue, process.env.HMAC_VERIFICATION_CODE_SECRET)
        if(hashedCodeValue === existingUser.verificationCode){
            existingUser.verified = true;
            existingUser.verificationCode = undefined;
            existingUser.verificationCodeValidation = undefined;
            await existingUser.save()
            await createNotificationJobLink(
                existingUser._id,
                'COMPTE_VERIFIE_JOBLINK',
                'Votre adresse email a été vérifiée avec succès. Votre compte JobLink est maintenant pleinement actif !',
                '/tableau-de-bord' // Ou '/profil/moi'
            );
            return res
            .status(200)
            .json({ success: true, message: 'your account has been verified!',});

        }
        return res
        .status(400)
        .json({ success: false, message: 'unexpected occured!',});
    }
    catch(error){
        console.log(error);
    }
}
exports.changePassword = async (req, res) => {
    const userId = req.user.userId;  // récupère via JWT
    const { oldpassword, newpassword } = req.body;
    try {
        const { error, value } = changePasswordSchema.validate({ oldpassword, newpassword });
        if (error) {
            return res.status(401).json({
                success: false,
                message: error.details[0].message,
            });
        }

        const existingUser = await User.findOne({ _id: userId }).select("+password +verified");

        if (!existingUser) {
            return res.status(401).json({
                success: false,
                message: 'User does not exist',
            });
        }

        if (!existingUser.verified) {
            return res.status(401).json({
                success: false,
                message: 'You are not a verified user'
            });
        }

        const result = await doHashValidation(oldpassword, existingUser.password);
        if (!result) {
            return res.status(401).json({
                success: false,
                message: 'Invalid old password',
            });
        }

        const hashedPassword = await doHash(newpassword, 12);
        existingUser.password = hashedPassword;
        await existingUser.save();
        const userForNotif = await User.findById(userId || existingUser._id).select('email'); // Récupérer l'email
        await createNotificationJobLink(
            userId || existingUser._id,
            'MOT_DE_PASSE_MODIFIE',
            'Votre mot de passe sur JobLink a été modifié avec succès. Si vous n\'êtes pas à l\'origine de cette modification, veuillez contacter immédiatement notre support.',
            '/profil/parametres/securite' // Lien vers les paramètres de sécurité
        );

        return res.status(200).json({
            success: true,
            message: 'Password updated!',
        });
    } catch (error) {
        console.log(error);
    }
};
exports.SendForgotPasswordCode = async (req, res) => {
    const { email } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (!existingUser) {
            return res
            .status(401)
            .json({ success: false, message: 'User does not exist',
            });
        }
        const codeValue = Math.floor(Math.random() * 1000000).toString();
        let info = await transport.sendMail({
            from: process.env.NODE_CODE_SENDING_EMAIL_ADDRESS,
            to:existingUser.email,
            subject:"Code pour mot de passe oublier",
            html:'<h1>' + codeValue + '</h1>'
            
        })
        if(info.accepted[0] === existingUser.email){
           const hashedCodeValue = hmacProcess(
                codeValue, 
                process.env.HMAC_VERIFICATION_CODE_SECRET
            );
           existingUser.forgotPasswordCode = hashedCodeValue;
           existingUser.forgotPasswordCodeValidation = Date.now();
           await existingUser.save();
           return res.status(200).json({ success:true, message: 'code envoyer!' });

        }
        res.status(400).json({ success:true, message: 'Code send failled!' });
    }
    catch(error){
        console.log(error);
    }
}
exports.verifyForgotPasswordCode = async (req, res) => {
    const { email, providedCode, newpassword} = req.body;  
    try {
        const { error, value } = acceptFPSchema.validate({ email, newpassword, providedCode });
        if (error) {
            return res.status(401).json({
                success: false,
                message: error.details[0].message,
            });
        }
        const codeValue =providedCode.toString();
        const existingUser = await User.findOne({email}).select("+forgotPasswordCode +forgotPasswordCodeValidation");
        if(!existingUser){
            return res
            .status(401)
            .json({ success: false, message: 'User does not exist',
            });
        }
      
        if(!existingUser.forgotPasswordCode || !existingUser.forgotPasswordCodeValidation){
            return res
            .status(400)
            .json({ success: false, message: 'something is wrong with the code!',});
        }
        if(Date.now() - existingUser.forgotPasswordCodeValidation > 5* 60 *1000){
            return res
            .status(400)
            .json({ success: false, message: 'code has been expired!',});
        }
        const hashedCodeValue = await hmacProcess(codeValue, process.env.HMAC_VERIFICATION_CODE_SECRET)
        if(hashedCodeValue === existingUser.forgotPasswordCode){
            const hashedPassword = await doHash(newpassword, 12);
            existingUser.password = hashedPassword;
            existingUser.forgotPasswordCode = undefined;
            existingUser.forgotPasswordCodeValidation = undefined;
            await existingUser.save()
            // Dans changePassword et verifyForgotPasswordCode, après await existingUser.save()
            const userForNotif = await User.findById(userId || existingUser._id).select('email'); // Récupérer l'email
            await createNotificationJobLink(
                userId || existingUser._id,
                'MOT_DE_PASSE_MODIFIE',
                'Votre mot de passe sur JobLink a été modifié avec succès. Si vous n\'êtes pas à l\'origine de cette modification, veuillez contacter immédiatement notre support.',
                '/profil/parametres/securite' // Lien vers les paramètres de sécurité
            );
            return res
            .status(200)
            .json({ success: true, message: 'password updated!',});

        }
        return res
        .status(400)
        .json({ success: false, message: 'unexpected occured!',});
    }
    catch(error){
        console.log(error);
    }
}
exports.updateProfilUser = async (req, res) => {
    const userId = req.user.userId;  // récupère via JWT
    const { newlastname, newfirsname, newphone, newbirsdays, newaddress } = req.body;

    try {
        const { error } = updateProfilUserSchema.validate({ newlastname, newfirsname, newphone, newbirsdays, newaddress });
        if (error) {
            return res.status(401).json({
                success: false,
                message: error.details[0].message,
            });
        }

        const existingUser = await User.findOne({ _id: userId }).select('+password +verified');
        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé.'
            });
        }

        if (!existingUser.verified) {
            return res.status(401).json({
                success: false,
                message: 'Vous n’êtes pas un utilisateur vérifié.'
            });
        }

        existingUser.lastname = newlastname;
        existingUser.firsname = newfirsname;
        existingUser.phone = newphone;
        existingUser.birsdays = newbirsdays;
        existingUser.address = newaddress;

        const result = await existingUser.save();

        res.status(201).json({
            success: true,
            message: 'Votre compte a été mis à jour avec succès.',
            result,
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur.'
        });
    }
};
