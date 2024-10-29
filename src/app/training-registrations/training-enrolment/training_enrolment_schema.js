module.exports = {
    types: `
     type SearchInEnrolResponse  {
        users : [String],
        groups : [String]
    }
    `,
    queries: `
        searchUsersAndGroups(query:String!):SearchInEnrolResponse,
    `,
    mutations: `
    
    `,
};
