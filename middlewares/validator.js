const Joi = require('joi');


exports.signupSchema = Joi.object({
    nom: Joi.string().min(2).max(50).required().messages({
        'string.empty': 'Le nom est requis.',
        'string.min': 'Le nom doit contenir au moins 2 caractères.',
    }),
    prenom: Joi.string().min(2).max(50).allow('').optional(), // Prénom optionnel ou vide
    telephone: Joi.string().pattern(/^[0-9+\s\(\)-]+$/).min(9).max(20).required().messages({ // Adaptez le pattern pour les numéros camerounais
        'string.empty': 'Le numéro de téléphone est requis.',
        'string.pattern.base': 'Format de téléphone invalide.',
    }),
    email: Joi.string()
        .email({ tlds: { allow: ['com', 'net', 'cm'] } }) // Ajouter .cm
        .min(6)
        .max(60)
        .required()
        .messages({
            'string.empty': 'L\'email est requis.',
            'string.email': 'Email invalide.',
        }),
    password: Joi.string()
        .min(8) // Augmenter la longueur minimale pour une meilleure sécurité
        // .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])')) // Pattern plus fort (minuscule, majuscule, chiffre, spécial)
        .required()
        .messages({
            'string.empty': 'Le mot de passe est requis.',
            'string.min': 'Le mot de passe doit contenir au moins 8 caractères.',
            // 'string.pattern.base': 'Le mot de passe doit contenir une minuscule, une majuscule, un chiffre et un caractère spécial.'
        }),
    role: Joi.string().valid('travailleur', 'employeur').required().messages({
        'any.only': 'Le rôle doit être travailleur ou employeur.',
        'string.empty': 'Le rôle est requis.',
    }),
    profilData: Joi.object().optional() // Pour les données de profil optionnelles à l'inscription
});
  
exports.signinSchema = Joi.object({
    email: Joi.string()
        .email({ tlds: { allow: ['com','net'] } })
        .min(6)
        .max(60)
        .required()
        .messages({
            'string.empty': 'email is required',
            'string.email': 'invalid email',
        }),
    password: Joi.string()
        .required()
        .pattern(new RegExp('^[a-zA-Z0-9]{6,20}$'))
        .messages({
            'string.empty': 'password is required',
            'string.min': 'password must be at least 6 characters',
            'string.max': 'password must be at most 20 characters',
        
        }),
}); 

exports.accepCodeSchema = Joi.object({
    email: Joi.string()
        .email({ tlds: { allow: ['com','net'] } })
        .min(6)
        .max(60)
        .required()
        .messages({
            'string.empty': 'email is required',
            'string.email': 'invalid email',
        }),
    providedCode: Joi.number()  
        .required()
        .messages({
            'number.base': 'Verification code must be a number',
            'any.required': 'Verification code is required',
        }),
});

exports.changePasswordSchema = Joi.object({

    newpassword: Joi.string()
    .required()
    .pattern(new RegExp('^[a-zA-Z0-9]{6,20}$'))
    .messages({
        'string.empty': 'password is required',
        'string.min': 'password must be at least 6 characters',
        'string.max': 'password must be at most 20 characters',
    
    }),
    oldpassword: Joi.string()
    .required()
    .pattern(new RegExp('^[a-zA-Z0-9]{6,20}$'))
    .messages({
        'string.empty': 'password is required',
        'string.min': 'password must be at least 6 characters',
        'string.max': 'password must be at most 20 characters',
    
    }),

})

exports.acceptFPSchema = Joi.object({

  
    email: Joi.string()
        .email({ tlds: { allow: ['com','net'] } })
        .min(6)
        .max(60)
        .required()
        .messages({
            'string.empty': 'email is required',
            'string.email': 'invalid email',
        }), 

    newpassword: Joi.string()
    .required()
    .pattern(new RegExp('^[a-zA-Z0-9]{6,20}$'))
    .messages({
        'string.empty': 'password is required',
        'string.min': 'password must be at least 6 characters',
        'string.max': 'password must be at most 20 characters',
    
    }),
    providedCode: Joi.number()  
    .required()
    .messages({
        'number.base': 'Verification code must be a number',
        'any.required': 'Verification code is required',
    }),
})

exports.updateProfilUserSchema = Joi.object({
    newlastname: Joi.string()
        .required()
        .messages({
            'string.empty': 'lastname is required',
        }),
    newfirsname: Joi.string()
        .required()
        .messages({
            'string.empty': 'firsname is required',
        }),
    newphone: Joi.number()
        .required()
        .messages({
            'number.empty': 'phone is required',
        }),
    newbirsdays: Joi.date()
        .required()
        .messages({
            'date.empty': 'birsdays is required',
        }),
    newaddress: Joi.string()
        .required()
        .messages({
            'string.empty': 'address is required',
        }),
});

exports.createPostSchema = Joi.object({

  
    title: Joi.string()
        .min(6)
        .max(60)
        .required()
        .messages({
            'string.empty': 'title is required'
        }), 
    description: Joi.string()
        .min(6)
        .max(60)
        .required(),

    userId:Joi.string()
        .min(6)
        .max(60)
        .required()
        .messages({
            'string.empty': 'description is required'
        }),
})

// Pour la mise à jour du profil Travailleur
exports.updateProfilTravailleurSchema = Joi.object({
    competences: Joi.array().items(Joi.string().trim().min(2).max(50)).optional().messages({
        'array.base': 'Les compétences doivent être une liste.',
        'string.min': 'Une compétence doit faire au moins 2 caractères.',
        'string.max': 'Une compétence ne peut pas dépasser 50 caractères.',
    }),
    anneesExperience: Joi.number().min(0).max(50).optional().messages({
        'number.min': 'Les années d\'expérience ne peuvent pas être négatives.',
        'number.max': 'Les années d\'expérience semblent excessives.',
    }),
    disponibilite: Joi.string().trim().max(100).optional(),
    dateDeNaissance: Joi.date().iso().optional().messages({ // Assurez-vous que le format envoyé est ISO (YYYY-MM-DD)
        'date.format': 'Format de date de naissance invalide (YYYY-MM-DD attendu).',
    }),
    // Vous ajouterez ici d'autres champs spécifiques au profil travailleur que vous voulez modifiables
    // Ex: descriptionPersonnelle: Joi.string().max(1000).optional(),
}).min(1); // Au moins un champ doit être fourni pour la mise à jour

// Pour la mise à jour du profil Employeur
exports.updateProfilEmployeurSchema = Joi.object({
    nomEntreprise: Joi.string().trim().min(2).max(100).optional(),
    secteurActivite: Joi.string().trim().min(3).max(100).optional(),
    descriptionEntreprise: Joi.string().trim().max(2000).optional(),
    adresseEntreprise: Joi.object({
        rue: Joi.string().trim().max(100).optional(),
        ville: Joi.string().trim().min(2).max(50).optional(),
        // pays: Joi.string().trim().optional(),
    }).optional(),
    telephoneEntreprise: Joi.string().pattern(/^[0-9+\s\(\)-]+$/).min(9).max(20).optional().messages({
        'string.pattern.base': 'Format de téléphone d\'entreprise invalide.',
    }),
    siteWebEntreprise: Joi.string().uri().optional().messages({
        'string.uri': 'Format d\'URL de site web invalide.',
    }),
    // Vous ajouterez ici d'autres champs spécifiques au profil employeur
}).min(1); // Au moins un champ doit être fourni

// Pour la mise à jour des infos communes du User (nom, prénom, téléphone personnel)
exports.updateProfilCommunSchema = Joi.object({
    nom: Joi.string().min(2).max(50).optional(),
    prenom: Joi.string().min(2).max(50).allow('').optional(),
    telephone: Joi.string().pattern(/^[0-9+\s\(\)-]+$/).min(9).max(20).optional().messages({
        'string.pattern.base': 'Format de téléphone personnel invalide.',
    }),
}).min(1);

exports.createCategorieSchema = Joi.object({
    nom: Joi.string().min(3).max(50).required().messages({
        'string.empty': 'Le nom de la catégorie est requis.',
        'string.min': 'Le nom doit faire au moins 3 caractères.',
    }),
    description: Joi.string().max(255).allow('').optional(),
});

exports.updateCategorieSchema = Joi.object({
   nom: Joi.string().min(3).max(50).required().messages({
        'string.empty': 'Le nom de la catégorie est requis.',
        'string.min': 'Le nom doit faire au moins 3 caractères.',
    }),
    description: Joi.string().max(255).allow('').optional(),
}).min(1); // Au moins un champ doit être fourni pour la mise à jour

exports.createAnnonceSchema = Joi.object({
    titre: Joi.string().min(5).max(100).required(),
    description: Joi.string().min(20).max(2000).required(),
    categorieId: Joi.string().hex().length(24).required().messages({ // Valide un ObjectId MongoDB
        'string.hex': 'ID de catégorie invalide.',
        'string.length': 'ID de catégorie invalide.',
    }),
    typeContrat: Joi.string().trim().optional(),
    localisation: Joi.object({
        adresseTextuelle: Joi.string().optional(),
        ville: Joi.string().required(),
        quartier: Joi.string().allow('').optional(),
    }).required(),
    remuneration: Joi.object({
        montant: Joi.number().positive().required(),
        devise: Joi.string().default('FCFA').optional(),
        periode: Joi.string().valid('heure', 'jour', 'semaine', 'mois', 'prestation').required(),
    }).required(),
    dateDebutSouhaitee: Joi.date().iso().required(),
    competencesRequises: Joi.array().items(Joi.string().trim()).optional(),
    estUrgent: Joi.boolean().optional(),
    dureeMission: Joi.object({
    valeur: Joi.number().integer().min(1).required(),
    unite: Joi.string().valid('jours', 'semaines', 'mois', 'annees').required(),
    }).when('dateDebutSouhaitee', { // Rendre dureeMission requis si dateDebutSouhaitee est fournie
        is: Joi.exist(),
        then: Joi.required(),
        otherwise: Joi.optional()
    }), // Ou le rendre toujours optionnel et gérer la logique dans le controller
    // estPremiumAnnonce n'est pas défini par l'utilisateur à la création, mais par l'admin ou un paiement
    // documentsJointsAnnonce: Joi.array().items(Joi.object(...)) // Plus complexe, à gérer avec l'upload de fichiers
});

exports.updateAnnonceSchema = Joi.object({ // Similaire à create, mais tous les champs sont optionnels
    titre: Joi.string().min(5).max(100).optional(),
    description: Joi.string().min(20).max(2000).optional(),
    categorieId: Joi.string().hex().length(24).optional(),
    typeContrat: Joi.string().trim().optional(),
    localisation: Joi.object({
        ville: Joi.string().optional(),
        quartier: Joi.string().allow('').optional(),
    }).optional(),
    remuneration: Joi.object({
        montant: Joi.number().positive().optional(),
        devise: Joi.string().optional(),
        periode: Joi.string().valid('heure', 'jour', 'semaine', 'mois', 'prestation').optional(),
    }).optional(),
    dateDebutSouhaitee: Joi.date().iso().optional(),
    dureeMission: Joi.string().optional(),
    competencesRequises: Joi.array().items(Joi.string().trim()).optional(),
    estUrgent: Joi.boolean().optional(),
    statut: Joi.string().valid('active', 'inactive').optional(), // L'employeur peut désactiver son annonce
}).min(1); // Au moins un champ pour la mise à jour

exports.createCandidatureSchema = Joi.object({
    annonceId: Joi.string().hex().length(24).required().messages({
        'string.hex': 'ID d\'annonce invalide.',
        'string.length': 'ID d\'annonce invalide.',
        'any.required': 'L\'ID de l\'annonce est requis.',
    }),
    lettreMotivation: Joi.string().max(1500).allow('').optional(),
    // documentsCandidature: Joi.array().items(Joi.object(...)) // Si upload de fichiers
});

exports.updateStatutCandidatureSchema = Joi.object({
    statut: Joi.string().valid('vue', 'preselectionnee', 'rejete', 'acceptee').required().messages({
        'any.only': 'Statut invalide.',
        'any.required': 'Le statut est requis.',
    }),
});

exports.createMessageSchema = Joi.object({
    destinataireId: Joi.string().hex().length(24).required().messages({
        'any.required': 'Le destinataire est requis.',
    }),
    contenu: Joi.string().min(1).max(1000).required().messages({
        'string.empty': 'Le contenu du message ne peut pas être vide.',
    }),
    annonceId: Joi.string().hex().length(24).optional(), // Optionnel
    candidatureId: Joi.string().hex().length(24).optional(), // Optionnel
});

// Pour la mise à jour d'un utilisateur par l'Admin
exports.adminUpdateUserSchema = Joi.object({
    nom: Joi.string().min(2).max(50).optional(),
    prenom: Joi.string().min(2).max(50).allow('').optional(),
    telephone: Joi.string().pattern(/^[0-9+\s\(\)-]+$/).min(9).max(20).optional(),
    role: Joi.string().valid('travailleur', 'employeur', 'moderateur', 'admin').optional(),
    typeAbonnement: Joi.string().valid('gratuit', 'premium_travailleur', 'premium_employeur').optional(),
    dateFinAbonnement: Joi.date().iso().allow(null).optional(), // Permettre de mettre à null pour annuler un abo
    estActif: Joi.boolean().optional(),
    verified: Joi.boolean().optional(), // Si l'admin peut vérifier manuellement un compte
    // L'admin ne devrait pas changer le mot de passe directement ici. 
    // Il faudrait un flux de "réinitialisation forcée" si nécessaire.
    // Le champ 'profil' est complexe, l'admin le modifiera peut-être via des actions spécifiques.
    // ou on peut permettre de modifier des clés spécifiques du profil
    profil: Joi.object().optional(), // L'admin pourrait modifier des champs du profil
}).min(1); // Au moins un champ doit être fourni

// Optionnel: Pour la création d'un utilisateur par l'Admin (ex: créer un modérateur)
exports.adminCreateUserSchema = Joi.object({
    nom: Joi.string().min(2).max(50).required(),
    prenom: Joi.string().min(2).max(50).allow('').optional(),
    email: Joi.string().email({ tlds: { allow: ['com', 'net', 'cm'] } }).required(),
    password: Joi.string().min(8).required(), // L'admin définit un MDP initial
    telephone: Joi.string().pattern(/^[0-9+\s\(\)-]+$/).min(9).max(20).required(),
    role: Joi.string().valid('travailleur', 'employeur', 'moderateur', 'admin').required(),
    typeAbonnement: Joi.string().valid('gratuit', 'premium_travailleur', 'premium_employeur').default('gratuit'),
    verified: Joi.boolean().default(true), // Souvent, l'admin crée un compte déjà vérifié
    estActif: Joi.boolean().default(true),
    profil: Joi.object().optional(), // L'admin peut initialiser le profil
});

exports.createSignalementSchema = Joi.object({
    cibleType: Joi.string().valid('Annonce', 'User').required().messages({
        'any.only': 'Le type de cible doit être Annonce ou User.',
        'any.required': 'Le type de cible est requis.',
    }),
    cibleId: Joi.string().hex().length(24).required().messages({
        'string.hex': 'ID de cible invalide.',
        'string.length': 'ID de cible invalide.',
        'any.required': 'L\'ID de la cible est requis.',
    }),
    raison: Joi.string().valid(
        'contenu_inapproprie', 
        'arnaque_potentielle', 
        'spam_publicite_non_sollicitee',
        'harcelement_comportement_abusif',
        'faux_profil_usurpation_identite',
        'annonce_discriminatoire',
        'probleme_technique_annonce',
        'autre'
    ).required().messages({
        'any.only': 'Raison de signalement invalide.',
        'any.required': 'La raison du signalement est requise.',
    }),
    commentaire: Joi.string().max(1000).when('raison', { 
        is: 'autre', 
        then: Joi.required(), 
        otherwise: Joi.allow('').optional() 
    }).messages({
        'string.empty': 'Un commentaire est requis lorsque la raison est "autre".',
        'any.required': 'Un commentaire est requis lorsque la raison est "autre".', // Au cas où le champ est omis
    }),
});

exports.adminUpdateSignalementSchema = Joi.object({
    statut: Joi.string().valid(
        'en_cours_examen', 
        'action_prise_contenu_modifie', 
        'action_prise_utilisateur_averti', 
        'action_prise_utilisateur_suspendu', 
        'action_prise_contenu_supprime', 
        'rejete_signalement_infonde'
    ).required(),
    notesAdmin: Joi.string().max(2000).allow('').optional(),
}).min(1); // Au moins le statut ou des notes

exports.createFaqItemSchema = Joi.object({
    question: Joi.string().min(10).max(255).required().messages({
        'string.empty': 'La question est requise.',
        'string.min': 'La question doit contenir au moins 10 caractères.',
    }),
    reponse: Joi.string().min(10).max(5000).required().messages({
        'string.empty': 'La réponse est requise.',
        'string.min': 'La réponse doit contenir au moins 10 caractères.',
    }),
    categorie: Joi.string().trim().max(50).optional().default('Général'),
    ordreAffichage: Joi.number().integer().optional().default(0),
    estActif: Joi.boolean().optional().default(true),
    motsCles: Joi.array().items(Joi.string().trim().lowercase()).optional(),
});

exports.updateFaqItemSchema = Joi.object({
    question: Joi.string().min(10).max(255).optional(),
    reponse: Joi.string().min(10).max(5000).optional(),
    categorie: Joi.string().trim().max(50).optional(),
    ordreAffichage: Joi.number().integer().optional(),
    estActif: Joi.boolean().optional(),
    motsCles: Joi.array().items(Joi.string().trim().lowercase()).optional(),
}).min(1); // Au moins un champ doit être fourni pour la mise à jour

exports.initierPaiementSchema = Joi.object({
    typeProduit: Joi.string().valid(
        'abonnement_premium_employeur', 
        'abonnement_premium_travailleur'
        // 'boost_annonce_specifique' // A ajouter si vous faites cette fonctionnalité
    ).required(),
    produitId: Joi.string().hex().length(24).when('typeProduit', { // Requis si typeProduit est boost_annonce
        is: 'boost_annonce_specifique', 
        then: Joi.required(), 
        otherwise: Joi.optional() 
    }),
    // Metadata pourrait contenir la durée de l'abonnement si vous offrez plusieurs options
    // ex: metadata: Joi.object({ dureeMois: Joi.number().valid(1, 3, 12).required() }).optional()
    // Pour la simulation, on peut garder simple
});


exports.createAvisSchema = Joi.object({
    candidatureId: Joi.string().hex().length(24).required().messages({
        'string.base': 'L\'ID de candidature doit être une chaîne de caractères.',
        'string.hex': 'L\'ID de candidature doit être un ObjectId hexadécimal valide.',
        'string.length': 'L\'ID de candidature doit faire 24 caractères.',
        'any.required': 'L\'ID de la candidature est requis.',
    }),
    // cibleId n'est plus envoyé par le client, il sera déduit de la candidature
    note: Joi.number().integer().min(1).max(5).required().messages({
        'number.base': 'La note doit être un nombre.',
        'number.integer': 'La note doit être un nombre entier.',
        'number.min': 'La note doit être au minimum 1.',
        'number.max': 'La note doit être au maximum 5.',
        'any.required': 'La note est requise.',
    }),
    commentaire: Joi.string().trim().max(1000).allow('').optional(), // Permettre un commentaire vide
});