const { Log } = require("./log_model");

module.exports = {
    logActivity: async input => {
        try {
            await new Log(input).save();
        } catch (e) {
            throw new Error(e);
        }
    },
};
