// utils/geocodingService.js
const NodeGeocoder = require('node-geocoder');
const logger = require('./logger'); // Assurez-vous que votre logger est bien importé et fonctionnel
// const AppError = require('./appError'); // Si vous l'utilisez pour propager des erreurs spécifiques

const options = {
  provider: 'openstreetmap',
  // Ajout du User-Agent personnalisé requis par Nominatim
  userAgent: process.env.NOMINATIM_USER_AGENT || 'JobLinkApp/1.0 (juniorsiwo95@gmail.com)', // IMPORTANT !
  // httpAdapter: 'https', // Généralement géré par défaut, mais peut être forcé si besoin
  formatter: null 
};

const geocoder = NodeGeocoder(options);

exports.geocodeAddress = async (adresseComplete) => {
    try {
        if (!adresseComplete || adresseComplete.trim() === "") {
            logger.warn("[GEOCODING] Tentative de géocodage d'une adresse vide.");
            return null;
        }
        logger.info(`[GEOCODING] Géocodage pour l'adresse: ${adresseComplete} avec User-Agent: ${options.userAgent}`);
        const res = await geocoder.geocode(adresseComplete);
        
        if (res && res.length > 0) {
            const { longitude, latitude } = res[0];
            logger.info(`[GEOCODING] Résultat pour "${adresseComplete}": [${longitude}, ${latitude}]`);
            return [longitude, latitude];
        } else {
            logger.warn(`[GEOCODING] Aucun résultat trouvé pour l'adresse: ${adresseComplete}`);
            return null;
        }
    } catch (error) {
        // L'erreur de Nominatim est maintenant capturée ici (le HTML)
        logger.error(`[GEOCODING] Erreur lors du géocodage de "${adresseComplete}":`, error.message || error); 
        // On ne veut pas que l'erreur HTML se propage dans le log principal de createAnnonce
        // logger.error(`[GEOCODING] Erreur lors du géocodage de "${adresseComplete}":`, error); // Version complète avec stack trace
        return null; // Renvoyer null pour indiquer l'échec sans planter
    }
};