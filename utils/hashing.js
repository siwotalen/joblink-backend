const bcrypt = require('bcryptjs');
const crypto = require('crypto'); 

exports.doHash = async (value, saltValue) => {
    const result = await bcrypt.hash(value, saltValue);
    return result;
};

exports.doHashValidation = async (value, hashedValue) => {
    const result = await bcrypt.compare(value, hashedValue);
    return result;
};

exports.hmacProcess = (value, key) => { 
    const result = crypto.createHmac('sha256', key).update(value).digest('hex');
    return result;
};
