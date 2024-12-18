module.exports = {
    types: `
        type TrainingCertificate {
            _id: ID
            trainingRegistration: TrainingRegistration
            training: Training
            organization: Organization
            branch: Branch
            employee: Employee
            trainer: Employee
            supervisor: Employee
            employeeName: String
            employeeUID: String
            employeeCivilIdOrPassport: String
            employeeNo: String
            employeeRigNumber: String
            employeeEmail: String
            employeeDesignation: String
            organizationName: [LocalisedData]
            trainerName: String
            trainerSignature: String
            trainingTitle: [LocalisedData]
            trainingDescription: [LocalisedData]
            """in days"""
            trainingDuration: Int
            """in days"""
            trainingCertificateValidity: Int
            status: String
            gradeMark: String
            badge: String
            certificateNumber: String
            startDate: String
            endDate: String
            startedAt: String
            completedAt: String
            generatedAt: String
            expiresAt: String
            trainingMode: String
            mdName: String
            mdSignature: String
            approvalInfo: String
            contactInfo: String
            subscriberInfo: SubscriberProfile
            htmlTemplate: String
        }
        type TrainingCertificateList {
            trainingCertificates: [TrainingCertificate]
            totalCount: Int
        }
        input TrainingCertificateFilterInput {
            search: String
            organization: ID
            training: ID
            employee: ID
            dateFrom: String
            dateTo: String
        }
        
        type getCertificateOutput {
            trainingCertificates : [userCertificateData]
            totalCount : Int
        }

        type userCertificateData {
            _id : ID
            createdAt : String
            generatedAt : String
            expiresAt : String
            certificateNumber : String
            user : certificateUserInfo
            training : certiTrainingInfo
            layoutInfo : CertificateLayout
        }
        type certificateUserInfo{
            firstName : String
            lastName : String
        }
        type certiTrainingInfo{
            title : [LocalisedData]
            description : [LocalisedData]
        }

        
    `,
    queries: `
        getTrainingCertificates(pageInput: PageInput, filterInput: TrainingCertificateFilterInput): TrainingCertificateList!
        getTrainingCertificate(id: ID!): TrainingCertificate!
        getUserCertificates(id: ID!): getCertificateOutput
    `,
    mutations : `
        generateCertificates(trainingRegistrationId:ID):TrainingCertificateList
    `,
};
