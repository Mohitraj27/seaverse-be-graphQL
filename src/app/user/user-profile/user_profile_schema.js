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
        }
        input verifyResetInput {
            token: String!
        }
        type UserProfile {
            user: User
        }
        type resetPasswordRes {
            success: Boolean
            message: String
        }
        input newPasswordInput {
            token: String!
            newPassword: String!
        }
    `,
    queries: `
        getProfile(id: ID): User!
        getPublicProfile(id: ID!): PublicProfile!
        getUserProfile: UserProfile
    `,
    mutations: `
        updateProfile(input: ProfileUpdateInput!): User!
        updatePassword(input: PasswordUpdateInput!): String!
        resetPassword(email: String!): resetPasswordRes!
        verifyResetPassword(input: verifyResetInput!): String!
        newPasswordAfterReset(input: newPasswordInput!): String!
        selfDeleteRequest(input: ID!): String!
    `,
};