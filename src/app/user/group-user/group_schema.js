module.exports = {
    types: `
        type Group {
            _id: ID!
            groupName: String!
            groupAdmin: User
            isManagerDefault: Boolean
            typeOfGroup: String
            memberCount: Int
            description: String
            members: [MemberDetails]
            createdAt: String
            updatedAt: String
        }
        input GroupInput {
            _id: ID
            groupName: String!
            description: String,
            members: [ID]
        }
        enum GroupType {
             Customgroups
             Autosyncedgroups
        }
        enum createGroupType {
            GROUP
            MEMBER
        }
        input listGroupType {
            groupType: String!
            group: String!
        }
        input createGroupInput {
            groupName: String!
            groupType: createGroupType!
            list: [listGroupType]
        }
        type GroupList {
            groups: [Group]
            totalCount: Int
        }
        type GroupResponse {
            message: String
            group: Group
        }
        input GroupFilterInput {
            search: String
        }
        type DeleteGroupResponse {
            message: String
        }
        type GroupCSVResponse {
            message: String!
            csvData: String!
            fileName: String!
        }
        type MemberDetails{
            _id: ID
            firstName: String!
            lastName: String
            email: String!
        }
        type getGroupsOfUserResponse {
            designation: String
            role: String
            vessel: String
            vesselStatus: String 
            vesselType: String
            subRole: [String]
            regStatus: String
            customGroups: [String]
        }
    `,
    queries: `
        getGroups(pageInput: PageInput, groupFilter :GroupFilterInput, groupType :GroupType!): GroupList!
        exportGroupToCSV(groupId: ID!): GroupCSVResponse!
        getGroupsOfUser(userId: ID!): getGroupsOfUserResponse
    `,
    mutations: `
        createOrUpdateGroup(input: createGroupInput!): GroupResponse!
        deleteGroup(ids: [ID!]!): DeleteGroupResponse!
    `,
};
