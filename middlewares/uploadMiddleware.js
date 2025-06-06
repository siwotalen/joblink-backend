const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Pour créer des répertoires
const AppError = require('../utils/appError'); // Votre classe d'erreur personnalisée

// Fonction pour s'assurer que le répertoire de destination existe
const ensureDirectoryExistence = (filePath) => {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname); // Crée récursivement les dossiers parents
    fs.mkdirSync(dirname);
};

// Configuration du stockage pour différents types de fichiers
const storageConfig = (destinationFolder) => multer.diskStorage({
    destination: (req, file, cb) => {
        const finalDestination = path.join('public/uploads', destinationFolder);
        ensureDirectoryExistence(finalDestination + '/'); // S'assurer que le dossier existe
        cb(null, finalDestination);
    },
    filename: (req, file, cb) => {
        // Générer un nom de fichier unique pour éviter les conflits
        // Inclure l'ID de l'utilisateur et le timestamp peut être une bonne idée
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, `${req.user.userId}-${file.fieldname}-${uniqueSuffix}${extension}`);
    }
});

// Filtre pour n'accepter que certains types de fichiers
const fileFilterConfig = (allowedMimeTypesRegex) => (req, file, cb) => {
    if (allowedMimeTypesRegex.test(file.mimetype)) {
        cb(null, true); // Accepter le fichier
    } else {
        cb(new AppError(`Type de fichier non supporté. Seuls les formats ${allowedMimeTypesRegex} sont autorisés.`, 400), false); // Rejeter
    }
};

// --- Configurations spécifiques ---

// Pour les documents (PDF, DOC, DOCX) des travailleurs (CV, certifications)
const documentsStorage = storageConfig('profils/documents'); //  -> public/uploads/profils/documents/
const documentsFileFilter = fileFilterConfig(/pdf|doc|docx|application\/msword|application\/vnd.openxmlformats-officedocument.wordprocessingml.document/);
exports.uploadDocumentTravailleur = multer({ 
    storage: documentsStorage, 
    fileFilter: documentsFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // Limite de 5MB
});

// Pour les images (JPG, PNG, JPEG) de preuve de talent des travailleurs ou logo entreprise
const imagesStorage = storageConfig('profils/images'); // -> public/uploads/profils/images/
const imagesFileFilter = fileFilterConfig(/jpeg|jpg|png|image\/jpeg|image\/png/);
exports.uploadImageProfil = multer({ 
    storage: imagesStorage, 
    fileFilter: imagesFileFilter,
    limits: { fileSize: 2 * 1024 * 1024 } // Limite de 2MB
});

// Pour les documents joints aux annonces (PDF, etc.)
const annonceDocumentsStorage = storageConfig('annonces/documents'); // -> public/uploads/annonces/documents/
exports.uploadDocumentAnnonce = multer({
    storage: annonceDocumentsStorage,
    fileFilter: documentsFileFilter, // Réutiliser le filtre de documents
    limits: { fileSize: 5 * 1024 * 1024 }
});