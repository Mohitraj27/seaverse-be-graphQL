const { CustomError, ErrorName } = require("./error_helper.js");
const isAlphanumeric = (password) => {
    const regex = /^[a-zA-Z0-9!@#\$%\^\&*\)\(+=._-]+$/; 
    if (password.length < 8) {
        return false;
    }
    if (!regex.test(password)) {
        
        return false;
    }
    return true;
};

module.exports = { isAlphanumeric };
