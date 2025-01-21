const { Role } = require("../../util");

module.exports = {
    types: `
        enum Role {
            ${Object.keys(Role).join(" ")}
        }
        type Phone {
            countryCode: String
            number: String
        }
        type User {
            _id: ID
            UID: String
            subscriber: Subscriber
            firstName: String 
            lastName: String
            civilIdOrPassport: String
            companyEmail: String
            email: String
            phone: Phone
            avatar: String
            role: Role
            subRoles: [SubRole]
            languagePreference: Language
            lastLoginAt: String
            isVerified: Boolean
            isActive: Boolean
            isRegistered: Boolean
            superAdmin: Boolean
            isProfileCompleted: Boolean
            isOrganizationManager: Boolean
            managingOrganization: Organization
            createdAt: String
            updatedAt: String
            employee: Employee
            htmlTemplate: String
            isResetPasswordDialog: Boolean
            vesselStatus: vesselStatusEnum
        }
        type UserList {
            users: [User]
            totalCount: Int
        }
        type AuthUser {
            user: User!
            token: String!
            refreshToken: String!
            subscriptionInfo: SubscriptionInfo
        }
        type refreshTokenRes {
            accessToken: String!
            refreshToken: String!
        }
        input PhoneInput {
            countryCode: String!
            number: String!
        }
        input SignUpInput {
            firstName: String
            lastName: String
            emailOrCivilIdOrPassport: String!
            phone: PhoneInput
            password: String!
            avatar: Upload
            firebaseToken: String
            deviceId: String
        }
        enum vesselStatusEnum {
            ASSIGNED
            ONSHORE
            ONBOARDED
        }
        input UserInput {
            firstName: String
            lastName: String
            civilIdOrPassport: String
            isRegistered: Boolean
            currentVessel: ID
            vesselStatus: vesselStatusEnum
            companyEmail: String
            email: String
            phone: PhoneInput
            password: String
            avatar: Upload
            role: Role
            subRoles: [ID]
            languagePreference: Language
            isVerified: Boolean
            isActive: Boolean
            isProfileCompleted: Boolean
            isOrganizationManager: Boolean
            address: UserAddressInput
            designation: String
        }
        input SignInInput {
            countryCode: String
            emailOrCivilIdOrPassport: String!
            password: String!
            firebaseToken: String
            deviceId: String
        }
        input SignOutInput {
            firebaseToken: String
            deviceId: String
        }
        input UserFilterInput {
            search: String
            role: Role
        }
        enum downloadTypeEnum {
            IMPORT_LOG
            REPORT
        }
        input downloadInput {
            downloadType: downloadTypeEnum!
            id: ID!
        }
        type downloadResponse {
            status: String!
            message: String!
        }
    `,
    queries: `
        downloadNotification(input: downloadInput!): downloadResponse!
    `,
    mutations: `
        createSaasAdmin(input: SignUpInput!): AuthUser!
        saasAdminSignIn(input: SignInInput!): AuthUser!
        subscriberSignUp(input: SignUpInput!): AuthUser!
        signUp(input: SignUpInput!, token: String): AuthUser!
        signIn(input: SignInInput!, role: Role): AuthUser!
        generateRefreshToken(token: String!): refreshTokenRes!
        signOut(input: SignOutInput): String!
    `,
};
