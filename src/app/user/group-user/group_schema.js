module.exports = {
    types: `
        type Group {
            _id: ID
            groupName: String!
            groupAdmin: User
            isManagerDefault: Boolean
            groupType: String
            memberCount: Int
            description: String
            members: [MemberDetails]
            createdAt: String
            updatedAt: String
            createdBy : userInfo
            updatedBy : userInfo
        }
        type userInfo{
            _id : ID
            firstName : String
            lastName : String
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
        enum groupTypes {
            designation
            role
            vessel
            vesselType
            vesselStatus
            subRole
            regStatus
            unRegStatus
        }
        input listGroupType {
            groupType: String!
            group: String!
            groupName: String
        }
        input groupsInGroup {
            groupType: String!
            group: String!
        }
        input createGroupInput {
            _id: ID
            groupName: String!
            groupType: createGroupType!
            list: [listGroupType]
            members: [ID]
            groups: [groupsInGroup]
            description: String
        }
        type GroupList {
            status : String
            groups: [Group]
            totalCount: Int
        }
        type GroupResponse {
            message: String
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
        type MemberDetails {
            _id: ID
            firstName: String
            lastName: String
            email: String
            groupType: String
            groupData: String
            groupName: String
            member: singleMemberDetails
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
        type singleMemberDetails {
            _id: ID
            firstName: String
            lastName: String
        }
        type groupMembersDetails {
            _id: ID
            groupType: String
            groupData: String
            memberDetails: singleMemberDetails
        }
        type singleGroupRes {
            groupName: String
            description: String
            members: [groupMembersDetails]
        }
    `,
    queries: `
        getGroups(pageInput: PageInput, groupFilter :GroupFilterInput, groupType :GroupType): GroupList!
        exportGroupToCSV(groupId: ID!): GroupCSVResponse!
        getGroupsOfUser(userId: ID!): getGroupsOfUserResponse
        getSingleGroup(groupId: ID!): singleGroupRes
    `,
    mutations: `
        createOrUpdateGroup(input: createGroupInput!): GroupResponse!
        deleteGroup(ids: [ID!]!): DeleteGroupResponse!
    `,
};
