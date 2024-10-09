module.exports = {
    types: `
        type Subscriber {
            _id: ID
            user: User
            name: String
        }
        type SubscriberList {
            subscribers: [Subscriber]
            totalCount: Int
        }
        input SubscriberInput {
            userInput: SignUpInput
            name: String
        }
        input SubscriberFilterInput {
            search: String
        }
    `,
    queries: `
        getSubscribers(pageInput: PageInput, filterInput: SubscriberFilterInput): SubscriberList!
        getSubscriber(id: ID): Subscriber!
    `,
    mutations: `
        createSubscriber(input: SubscriberInput!): Subscriber!
        updateSubscriber(id: ID, input: SubscriberInput!): Subscriber!
        deleteSubscriber(id: ID!): Subscriber!
    `,
};
