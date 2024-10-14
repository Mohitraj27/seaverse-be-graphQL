module.exports = {
    types: `
        type PublicProfile {
            user: User
            employee: Employee
            trainingCertificates: [TrainingCertificate]
            trainingStatistics: TraineeStatistics
            subscriberProfile: SubscriberProfile
        }
        input ProfileUpdateInput {
            firstName: String
            lastName: String
            email: String
            phone: PhoneInput
            languagePreference: Language,
            address: UserAddressInput,
            avatar: Upload
        }
        input PasswordUpdateInput {
            currentPassword: String!
            newPassword: String!
            confirmPassword: String!
        }
        type UserProfile {
            user: User
        }
        type forgetPasswordRes {
            success: Boolean
            message: String
        }
        enum resetType {
            FORGET_PASSWORD
            RESET_PASSWORD
        }
        input newPasswordInput {
            type: resetType!
            token: String
            userId: String
            newPassword: String!
            confirmPassword: String!
        }
    `,
    queries: `
        getProfile(id: ID): User!
        getPublicProfile(id: ID!): PublicProfile!
        getUserProfile: UserProfile
    `,
    mutations: `
        updateProfile(input: ProfileUpdateInput!): User!
        changePassword(input: PasswordUpdateInput!): String!
        forgetPassword(email: String!): forgetPasswordRes!
        verifyResetPassword(token: String!): String!
        newPasswordAfterReset(input: newPasswordInput!): String!
        selfDeleteRequest: String!
    `,
};