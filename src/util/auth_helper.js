const { isFunction, isObject, mapValues } = require("../tools");

const { CustomError, ErrorName } = require("./error_helper");

const Role = require("./role");

const roleExceptions = [];
const loginExceptions = ["getTrainingCertificate", "getProfile", "getPublicProfile", "forgetPassword", "verifyResetPassword","contactSupport"];

const requiresRole = role => resolver => {
    if (isFunction(resolver))
        return (_, args, context = {}) => {
            context.resolverName = resolver.name;

            if (
                loginExceptions.includes(resolver.name) ||
                (context.user &&
                    (!role ||
                        context.user.role === role ||
                        roleExceptions.includes(resolver.name) ||
                        (role instanceof Array && role.includes(context.user.role))))
            ) {
                return resolver(args, context);
            } else {
                console.log(`auth_helper:requiresRole:UNAUTHORIZED:${context.resolverName}`);
                throw CustomError(ErrorName.UNAUTHORIZED);
            }
        };
    else if (isObject(resolver)) return mapValues(resolver, requiresRole(role));
    else throw CustomError("Resolver has to be Object or Function");
};

const simplify = role => resolver => {
    if (isFunction(resolver))
        return (_, args, context = {}) => {
            context.resolverName = resolver.name;
            return resolver(args, context);
        };
    else if (isObject(resolver)) return mapValues(resolver, simplify(role));
    else throw CustomError("Resolver has to be Object or Function");
};

module.exports = {
    requiresSaasAdmin: requiresRole(Role.SAAS_ADMIN),
    requiresAdmin: requiresRole([Role.SAAS_ADMIN, Role.ADMIN]),
    requiresEmployee: requiresRole([Role.SAAS_ADMIN, Role.ADMIN, Role.EMPLOYEE, Role.AUTHOR]),
    requiresAuthor: requiresRole([Role.AUTHOR]),
    requiresLogin: requiresRole(null),
    simplify: simplify(null),
};
