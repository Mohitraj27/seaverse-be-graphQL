const { isFunction, isObject, mapValues } = require("../tools");

const { CustomError, ErrorName } = require("./error_helper");

const Role = require("./role");

const roleExceptions = [];
const loginExceptions = ["getTrainingCertificate", "getProfile", "getPublicProfile", "forgetPassword", "verifyResetPassword","contactSupport", "newPasswordAfterReset"];

const requiresRole = role => resolver => {
    if (isFunction(resolver))
        return (_, args, context = {}) => {
            context.resolverName = resolver.name;
            if (resolver.name === 'forgetPassword') {
                return resolver(args, context);
            }
            if (!context.user) {
                console.log(`auth_helper:requiresRole:UNAUTHORIZED:${context.resolverName}`);
                throw CustomError(ErrorName.UNAUTHORIZED);
            }
            const isAdmin =
                context.user?.userInfo?.subRoles?.[0]?.name === 'ADMIN' ||
                context.user?.userInfo?.subRoles?.[0]?.primaryRole === 'ADMIN' ||
                context.user?.role === 'ADMIN';

            if (
                loginExceptions.includes(resolver.name) ||
                (context.user &&
                    (!role || isAdmin ||
                        context.user.role === role ||
                        roleExceptions.includes(resolver.name) ||
                        (role instanceof Array && role.includes(context.user.role))))
            ) {
                return resolver(args, context);
            } else {
                console.log(`auth_helper:requiresRole:FORBIDDEN:${context.resolverName}`);
                throw CustomError(ErrorName.FORBIDDEN);
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
    requiresEmployee: requiresRole([Role.SAAS_ADMIN, Role.ADMIN, Role.LEARNER, Role.AUTHOR]),
    requiresAuthor: requiresRole([Role.AUTHOR]),
    requiresLogin: requiresRole(null),
    simplify: simplify(null),
};
