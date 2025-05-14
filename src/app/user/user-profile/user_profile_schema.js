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
            country: String
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
            consents: [consents!]
        }
        input newPasswordInput {
            token: String
            newPassword: String!
            confirmPassword: String!
        }
        input consentsInput {
            _id: ID
            title: String
            status: Boolean
            message: String
        }
        type consents {
            _id: ID
            title: String
            status: Boolean
            message: String
        }
            type checkLastAdminRes {
            isLastAdmin: Boolean
            message: String
        }
    `,
    queries: `
        getProfile(id: ID): User!
        getPublicProfile(id: ID!): PublicProfile!
        getUserProfile: UserProfile
        resetPassword: String!
        checkLastAdmin: checkLastAdminRes!

    `,
    mutations: `
        updateProfile(input: ProfileUpdateInput!): User!
        changePassword(input: PasswordUpdateInput!): String!
        forgetPassword(email: String!,consentsInput: [consentsInput!]): forgetPasswordRes!
        verifyResetPassword(token: String!): String!
        newPasswordAfterReset(input: newPasswordInput!): String!
        selfDeleteRequest(input: DeleteRequestInput!): String!
    `,
};