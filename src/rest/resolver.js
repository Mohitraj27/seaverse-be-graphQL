const { ExpressRouter } = require("../tools");

// Import API routes
const userRegistrationFlagApi = require("./user-registration-flag-api");
const adminApi = require("./admin-api");

// Register routes
ExpressRouter.use("/users", userRegistrationFlagApi);
ExpressRouter.use("/admin", adminApi);

module.exports = ExpressRouter;
