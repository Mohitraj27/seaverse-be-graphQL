const { ExpressRouter } = require("../tools");

// Import API routes
const userRegistrationFlagApi = require("./user-registration-flag-api");

// Register routes
ExpressRouter.use("/users", userRegistrationFlagApi);

module.exports = ExpressRouter;
