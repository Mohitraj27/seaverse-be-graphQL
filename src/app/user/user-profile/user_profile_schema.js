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
            currentPassword: String
            newPassword: String!
            confirmPassword: String!
        }
        input DeleteRequestInput {
            reasonForDelete: String!
        }
        type menuItem{
            role_name: String!
            platform : String!
        }
        type UserProfile {
            user: User,
            menuItem: [menuItem]
        }
        type forgetPasswordRes {
            success: Boolean
            message: String
        }
        input newPasswordInput {
            token: String!
            newPassword: String!
            confirmPassword: String!
        }
    `,
    queries: `
        getProfile(id: ID): User!
        getPublicProfile(id: ID!): PublicProfile!
        getUserProfile: UserProfile
        resetPassword: String!
    `,
    mutations: `
        updateProfile(input: ProfileUpdateInput!): User!
        changePassword(input: PasswordUpdateInput!): String!
        forgetPassword(email: String!): forgetPasswordRes!
        verifyResetPassword(token: String!): String!
        newPasswordAfterReset(input: newPasswordInput!): String!
        selfDeleteRequest(input: DeleteRequestInput!): String!
    `,
};