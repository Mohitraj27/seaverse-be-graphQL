module.exports = {
    types: `
        type ExternalLinks {
            linkedin: String
            twitter: String
            facebook: String
            instagram: String
            coursera: String
        }
        type EmployeeExperience {
            companyName: String
            startDate: String
            endDateDate: String
            isCurrentJob: Boolean
        }
        type CustomField {
            type: String
            field_name: String
            value: String
        }
        type Employee {
            _id: ID
            UID: String
            user: User
            branch: Branch
            organization: Organization
            #civilIdOrPassport: String
            bloodGroup: String
            nationality: String
            department: String
            designation: String
            empDesignation: Designation
            managerObjectId: User
            employeeNo: String
            rigNumber: String
            dob: String
            gender: String
            externalLinks: ExternalLinks
            regType: Int
            skills: [String]
            experiences: [EmployeeExperience]
            customField: [CustomField]
            isActive: Boolean
            trainingCertificates: [TrainingCertificate]
            signature: String
            currentVessel: Vessel
        }
        type EmployeeList {
            batch: Batch
            employees: [Employee]
            totalCount: Int
            isRegistered: Boolean
        }
        type deleteReqResponse {
            totalCount: Int
            users: [User]
        }
        type BulkUserResponse {
            users: [Employee]
        }
        type BulkDeleteResponse {
            count: Int
            errors: [String]
        }
        type BulkChangeRegisterResponse {
            count: Int
            success: Boolean
        }
        type BulkCsvUserResponse {
            count: Int
        }
        type importlogs {
            date_of_import: String
            users_added: Int
            users_removed: Int
            total_user_count: Int
        }
        input ExternalLinksInput {
            linkedin: String
            twitter: String
            facebook: String
            instagram: String
            coursera: String
        }
        input EmployeeExperienceInput {
            companyName: String
            startDate: String
            endDateDate: String
            isCurrentJob: Boolean
        }
        input EmployeeInput {
            user: UserInput
            branch: ID
            organization: ID
            training: ID
            bloodGroup: String
            nationality: String
            department: String
            designation: String
            empDesignation: ID
            managerObjectId: ID
            employeeNo: String
            rigNumber: String
            dob: String
            gender: String
            externalLinks: ExternalLinksInput
            skills: [String]
            experiences: [EmployeeExperienceInput]
            customField: [CustomFieldInput]
            isActive: Boolean
            signature: Upload
        }
        input EmployeesInput {
            users: [UserInput]
            branch: ID
            organization: ID
            training: ID
            trainingDuration: Int
            empDesignation: ID
            managerObjectId: ID
            certificateValidity: Int
            trainer: ID
            startDate: String
            endDate: String
            unitPrice: Float
            customPrice: Float
            remarks: String
            trainingMode: TrainingMode
            invoice: TrainingRegistrationInvoiceInput
            customField: [CustomFieldInput]
            file: Upload  
        }
        enum RegisterType {
            Registered
            Unregistered
        }
        input changeRegisterInput {
            users: [ID!]!
            type: RegisterType!
        }
        enum RoleEnum {
            ADMIN
            AUTHOR
            EMPLOYEE
        }
        enum AssignChange {
            Assign
            Remove
            Delete
        }
        enum RemoveRoleInput {
            REMOVE_AS_AUTHOR
            REMOVE_AS_ADMIN
        }
        enum VesselStatusEnum {
            ONBOARDED
            ONSHORE
            ASSIGNED
        }
        enum LastSeenEnum {
            TODAY
            YESTERDAY
            LAST_7_DAYS
            LAST_30_DAYS
            LAST_3_MONTHS
            LAST_6_MONTHS
            LAST_YEAR
        }
        input manageRoleInput {
            users: [ID!]!
            change: AssignChange!
            assignType: RoleEnum
            removeType: RemoveRoleInput
        }
        enum deleteResponseType {
            APPROVE
            REJECT
        }
        input respondToDeleteInput {
            users: [ID!]!
            type: deleteResponseType!
        }
        type manageRoleResponse {
            count: Int
            success: Boolean
        }
        input EmployeeFilterInput {
            search: String
            organization: ID
            subRole: ID,
            regType: Int
            role: RoleEnum
            isRegistered: Boolean
            empDesignation: [ID]
            vesselStatus: [VesselStatusEnum] 
            vesselName: [String]
            vesselType: [ID]
            lastSeen: LastSeenEnum
        }
        input deleteRequestFilterInput {
            search: String
            isDeleted: Boolean
        }
        input ManagerFilterInput {
            search: String
        }
        input ImportUserInput {
            firstName: String!
            lastName: String!
            civilIdOrPassport: String!
            email: String!
            managerObjectId: ID
            phone: PhoneInput
            subRoles: [ID]
            isOrganizationManager: Boolean
            currentVessel: ID!
        }
        input ImportEmployeeInput {
            user: ImportUserInput
            organization: ID
            designation: String
            empDesignation: ID
            managerObjectId: ID
            rigNumber: String
            dob: String
            gender: String
            externalLinks: ExternalLinksInput
            bloodGroup: String
            nationality: String
            department: String
            customField: [CustomFieldInput]
        }
        input CustomFieldInput {
            type: String!
            field_name: String!
            value: String!
        }
        type createEmployeeRes {
            status: Boolean
            message: String
        }
    `,
    queries: `
        getEmployeeProfiles(pageInput: PageInput, filterInput: EmployeeFilterInput): EmployeeList!
        getEmployees(pageInput: PageInput, filterInput: EmployeeFilterInput): EmployeeList!
        getManagerList(pageInput: PageInput, filterInput: ManagerFilterInput): EmployeeList!
        getEmployeeNotInGroup(pageInput: PageInput, filterInput: ManagerFilterInput, group: ID!): EmployeeList!
        getImportLogs: [importlogs]
        getDeleteRequests(pageInput: PageInput, filterInput: ManagerFilterInput): deleteReqResponse!
    `,
    mutations: `
        createEmployees(input: EmployeesInput!): BulkCsvUserResponse!
        createEmployee(input: EmployeeInput!): createEmployeeRes!
        updateEmployee(id: ID, input: EmployeeInput!): Employee!
        deleteEmployee(id: ID!): Employee!
        importEmployees(inputs: [ImportEmployeeInput!]!): [Employee!]!
        deleteEmployees(input: EmployeesInput!): BulkDeleteResponse!
        changeRegisterEmployees(input: changeRegisterInput!): BulkChangeRegisterResponse!
        manageRole(input: manageRoleInput!): manageRoleResponse!
        respondToDeleteRequest(input: respondToDeleteInput!): String!
    `,
};
