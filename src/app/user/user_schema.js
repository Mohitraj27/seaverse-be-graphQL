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
            avatarUrl: String
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
            vesselStatus: String
            directSignup: Boolean
            isSignupAdminAprroved: Boolean
            reasonForDelete: String
            deleteRequestDate: String
            deleteRequest: Boolean
            isDeleted: Boolean
            designation: String
            contentlanguages: [String]
            consents: [TermsAndConditions!]
            isEmailNotification: Boolean
            isPushNotification: Boolean
            country: String
            lastUnregisteredAt: String
            isShipAdmin: Boolean
        }
        type TermsAndConditions {
            _id: ID
            message: String
            title: String
            status:Boolean
            timestamp: String
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
            email: String!
            password: String!
            confirmPassword: String!
            consents: [TermsAndConditionsInput!]
        }
        input TermsAndConditionsInput {
            message: String!
            title: String!
            status:Boolean!
            timestamp: String
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
            currentVessel: String
            vesselStatus: String
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
            consents:[TermsAndConditionsforUpdateEmployee!]
            isEmailNotification: Boolean
            isPushNotification: Boolean
        }
        input TermsAndConditionsforUpdateEmployee {
            message: String
            title: String
            status:Boolean
            timestamp: String
        }
        input SignInInput {
            emailOrCivilIdOrPassport: String!
            password: String!
            firebaseToken: String
            deviceId: String
            consents: [TermsAndConditionsInputforSignIn]
        }
        input TermsAndConditionsInputforSignIn {
            _id: ID   
            message: String
            title: String
            status:Boolean
            timestamp: String
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
        input contentLanguageInput {
            languagecode : [String!]
            userId: ID!
        }
        type downloadResponse {
            status: String!
            message: String!
        }
        input AppSignUpInput {
            firstName: String!
            lastName: String
            email: String!
            password: String!
        }
        type SignUpRes {
            message: String!
            status: String!
            user: User!
            token: String!
            refreshToken: String!
        }
        input emailVertificationInput{
            email: String!
        }
        type emailVerification{
            status: String!
            message: String!
            generatedtoken: String!
            email:String!
        }
        input OTPVerificationInput{
            email: String
            generatedtoken: String!
            otp: String!
        }
        type verifyOTP{
            status: String!
            message: String!
            email: String!
        }
        type contentLanguage{
            status: String!
            message: String!
        }
        input SwitchNotificationInput {
            isEmailNotification: Boolean
            isPushNotification: Boolean
        }
        type NotificationStatus {
            isEmailNotification: Boolean
            isPushNotification: Boolean
        }
        type switchNotifcationResponse {
            status: Boolean!
            message: String!
            currentNotificationStatus: NotificationStatus
        }

    `,
    queries: `
        downloadNotification(input: downloadInput!): downloadResponse!
    `,
    mutations: `
        createSaasAdmin(input: SignUpInput!): AuthUser!
        saasAdminSignIn(input: SignInInput!): AuthUser!
        subscriberSignUp(input: SignUpInput!): AuthUser!
        signUp(input: SignUpInput!): SignUpRes!
        signIn(input: SignInInput!, role: Role): AuthUser!
        lastLoginAt(firebaseToken: String): String!
        generateRefreshToken(token: String!): refreshTokenRes!
        signOut(input: SignOutInput): String!
        appSignUp(input: AppSignUpInput!): downloadResponse!
        signUpVerifyEmail(input: emailVertificationInput!): emailVerification!
        verifyOTPSignup(input: OTPVerificationInput!):verifyOTP!
        updateProfileforCourseSetting(input: contentLanguageInput!): contentLanguage!
        switchNotifcation(input: SwitchNotificationInput!): switchNotifcationResponse!
    `,
};
