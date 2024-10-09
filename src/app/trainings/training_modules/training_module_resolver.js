const { CustomError, ErrorName, AuthUser, Role, DbTransactionHelper } = require("../../../util");

const { TrainingModule } = require("./training_module_model");
const {
    TrainingModuleContent,
} = require("./training_module_contents/training_module_content_model");

const TrainingModuleHelper = require("./training_module_helper");
const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");
const LogHelper = require("../../logs/log_helper");

const Permission = require("../../user/sub-roles/permission");

module.exports.mutations = {
};
