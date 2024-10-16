const { CustomError, ErrorName } = require("./error_helper.js");
const isAlphanumeric = (password) => {
    const regex = /^[a-zA-Z0-9]+$/; 
    if (password.length < 8) {
        throw new CustomError(ErrorName.PASSWORD_TOO_SHORT);
    }
    if (!regex.test(password)) {
        throw new CustomError(ErrorName.PASSWORD_NOT_ALPHANUMERIC);
    }
    return true;
};

module.exports = { isAlphanumeric };
