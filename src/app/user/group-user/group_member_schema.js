module.exports = {
    types: `
        type GroupMember {
            group: ID
            member: ID
        }
        input GroupMemberInput {
            group: ID!
            member: ID!
            isExclude: Boolean!
        }

        type MembList{
            group: ID
            user: User
        }

        input GroupMemberFilterInput {
            search: String
            isExclude: Boolean! 
        }

        type AddUsersToGroupResponse {
            success: Boolean!
            message: String
            addedCount: Int!
        }
            
        type GroupMemberList {
            totalCount: Int
            member: [MembList]!
        }
        type GroupMemebrResponse {
            message: String
            groupMember: GroupMember
        }
        type DeleteGroupMemberResponse {
            message: String
        }
        type RemoveUsersFromGroupResponse {
            success: Boolean!
            message: String
            removedCount: Int!
        }
    `,
    queries: `
        getGroupMembers(pageInput: PageInput, group: ID!, filterInput: GroupMemberFilterInput): GroupMemberList!
    `,
    mutations: `
        addUsersToGroup(group: ID!, memberIDs: [ID!]!, isExclude: Boolean!): AddUsersToGroupResponse!
        removeUsersFromGroup(group: ID!, memberIDs: [ID!]!, removeAll: Boolean, isExclude: Boolean!): RemoveUsersFromGroupResponse!
    `,
};