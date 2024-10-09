const TrainingRegistrationInvoiceStatus = require("./training_registration_invoice_status.json");

module.exports = {
    types: `
        enum TrainingRegistrationInvoiceStatus {
            ${Object.keys(TrainingRegistrationInvoiceStatus).join(" ")}
        }
        type SubscriberInfo {
            name: String
            logo: String
            vat: String
            address: [LocalisedData]
            phone: String
            alternatePhone: String
            email: String
            website: String
        }
        type OrganizationDetails {
            organization: Organization
            organizationName: [LocalisedData]
            email: String
            phone: String
            contactName: String
        }
        type InvoiceOrderItem {
            training: Training
            trainingTitle: [LocalisedData]
            trainingPrice: Float
            unitPrice: Float
            discount: Float
            quantity: Int
        }
        type TrainingRegistrationInvoice {
            _id: ID
            subscriberInfo: SubscriberInfo
            organizationDetails: OrganizationDetails
            orderItems: [InvoiceOrderItem]
            invoiceNo: String
            invoiceDate: String
            buyerOrderNo: String
            buyerOrderDate: String
            deliveryNote: String
            paymentMode: String
            termsOfDelivery: String
            currency: String
            invoiceAmount: Float
            invoiceTaxRate: Float
            invoiceTaxAmount: Float
            invoiceTotalAmount: Float
            invoiceQuantity: Int
            invoiceReference: String
            bankDetails: BankDetails
            remarks: String
            status: String
            createdAt: String
            updatedAt: String
            
            price: Float @deprecated
            discount: Float @deprecated
        }
        type TrainingRegistrationInvoiceList {
            trainingRegistrationInvoices: [TrainingRegistrationInvoice]
            totalCount: Int
        }
        input OrganizationDetailsInput {
            organization: ID
            organizationName: [LocalisedDataInput]
            email: String
            phone: String
            contactName: String
        }
        input TrainingRegistrationDetailsInput {
            trainingRegistration: ID
            employee: ID
        }
        input InvoiceOrderItemInput {
            training: ID
            trainingRegistrationDetailsList: [TrainingRegistrationDetailsInput]
            registeredCount: Int
            startedCount: Int
            completedCount: Int
            isRegisteredCountSelected: Boolean
            isStartedCountSelected: Boolean
            isCompletedCountSelected: Boolean
            trainingTitle: [LocalisedDataInput]
            trainingPrice: Float
            unitPrice: Float
            discount: Float
            quantity: Int
        }
        input TrainingRegistrationInvoiceInput {
            _id: ID
            organizationDetails: OrganizationDetailsInput
            orderItems: [InvoiceOrderItemInput]
            invoiceNo: String
            invoiceDate: String
            buyerOrderNo: String
            buyerOrderDate: String
            deliveryNote: String
            paymentMode: String
            termsOfDelivery: String
            currency: String
            invoiceAmount: Float
            invoiceQuantity: Int
            invoiceReference: String
            bankDetails: BankDetailsInput
            remarks: String
            status: TrainingRegistrationInvoiceStatus
            
            price: Float @deprecated
            discount: Float @deprecated
        }
        input TrainingRegistrationInvoiceFilterInput {
            search: String
            organization: ID
            training: ID
            dateFrom: String
            dateTo: String
        }
    `,
    queries: `
        getTrainingRegistrationInvoices(pageInput: PageInput, filterInput: TrainingRegistrationInvoiceFilterInput): TrainingRegistrationInvoiceList!
        getTrainingRegistrationInvoice(id: ID!): TrainingRegistrationInvoice!
        getTrainingRegistrationsForInvoiceGeneration(pageInput: PageInput, filterInput: TrainingRegistrationFilterInput): TrainingRegistrationList!
    `,
    mutations: `
        createOrUpdateTrainingRegistrationInvoice(input: TrainingRegistrationInvoiceInput!): TrainingRegistrationInvoice!
        generateTrainingRegistrationInvoice(input: TrainingRegistrationInvoiceInput!): TrainingRegistrationInvoice!
    `,
};
