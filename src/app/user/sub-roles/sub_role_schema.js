const Permission = require("./permission");

module.exports = {
    types: `
	    enum Permission {
	        ${Object.keys(Permission).join(" ")}
	    }
        type SubRole {
            _id: ID
            name: String
            permissions: [String]
            isActive: Boolean
            isPredefined: Boolean
            description : String
        }
        type SubRoleList {
            assignablePermissions: [Permission]
            assignableOrganizationPermissions: [Permission]
            subRoles: [SubRole]
            totalCount: Int
            totalPages: Int
            hasPrevPage: Boolean
            hasNextPage: Boolean
        }
        input SubRoleInput {
            _id: ID
            name: String
            permissions: [Permission]
            isActive: Boolean
            description : String
        }
    `,
    queries: `
        getSubRoles(pageInput: PageInput): SubRoleList!
    `,
    mutations: `
        createOrUpdateSubRole(input: SubRoleInput!): SubRole!
        deleteSubRole(id: ID!): SubRole!
    `,
};
