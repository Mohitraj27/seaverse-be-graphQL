module.exports = {
    types: `
        enum SaasPaymentType {
            OTHER
            PREPAID
        }
        enum SaasPaymentStatus {
            PAID
            UNPAID
            FAILED
            REFUND
        }
        type SaasPayment {
            _id: ID
            paymentConfigType: String
            paymentType: String
            invoiceId: String
            invoiceAmount: Float
            invoiceReference: String
            currency: String
            currencyRate: Float
            status: String
            firstName: String
            lastName: String
            phone: Phone
            email: String
            createdAt: String
            updatedAt: String
        }
        type SaasPaymentList {
            payments: [SaasPayment]
            totalCount: Int
        }
        input SaasPaymentInput {
            paymentConfigType: PaymentConfigType
            paymentType: SaasPaymentType
            invoiceId: String
            invoiceAmount: Float
            invoiceReference: String
            currency: String
            currencyRate: Float
            status: String
            firstName: String
            lastName: String
            phone: PhoneInput
            email: String
            redirectUrl: String
            errorUrl: String
        }
        input SaasPaymentFilterInput {
            status: SaasPaymentStatus
            searchPayment: String
            paymentId: ID
            dateFrom: String
            dateTo: String
        }
    `,
    queries: `
        getSaasPayments(pageInput: PageInput, filterInput: SaasPaymentFilterInput): SaasPaymentList!
    `,
    mutations: `
        initiateSaasPayment(paymentInput: SaasPaymentInput!, subscriptionInput: SubscriptionInput!): String!
        updateSaasPaymentStatus(id: ID!, status: SaasPaymentStatus!): SaasPayment!
    `,
};
