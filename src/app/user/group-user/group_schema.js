module.exports = {
    types: `
        enum groupingCriteria { 
            MEMBER
            AUTOSYNCED 
            CUSTOMGROUP
        }
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
            groupName: String!
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
            deleteMembersOrGroups: [ID]
        }
        type GroupList {
            status : String
            groups: [Group]
            totalCount: Int
        }
        type UserAndAutoSyncedGroupRes {
            users: [User]
            autoSyncedGroups: [Group]
        }
        type GroupResponse {
            message: String
        }
        input GroupFilterInput {
            search: String
            customGroupId :ID
        }
        type DeleteGroupResponse {
            message: String
        }
        type GroupCSVResponse {
            status: Boolean
            message: String
            filePath: String
        }
        type MemberDetails {
            _id: ID
            firstName: String
            lastName: String
            email: String
            isRegistered: Boolean
            groupType: String
            groupData: String
            groupName: String
            member: [singleMemberDetails]
        }
        type getGroupsOfUserResponse {
            designation: String
            role: String
            vessel: String
            vesselStatus: String
            vesselType: String
            subRole: [String]
            regStatus: String
            owner: String
            customGroups: [String]
        }
        type singleMemberDetails {
            _id: ID
            firstName: String
            lastName: String
            email: String
            isRegistered: Boolean
        }
        type groupMembersDetails {
            _id: ID
            groupType: String
            groupData: String
            memberDetails: singleMemberDetails
        }
        type SingleGroupRes {
            groupName: String
            groupType: String
            groupId: String
            members: [singleMemberDetails]
        }
        input SingleGroupInput {
            groupName: String
            groupId: String!
            groupType: String!
        }
        input memberFilter {
            isDeleted :Boolean
            search : String
        }
        input autosyncInput {
            groupId : String
            groupType : String
            groupName : String
        }
        type memberResponse {
            status : String
            members: [singleMemberDetails]
            totalCount: Int
        }
        type GroupData {
            _id: ID
            groupData: String
            group: ID
            groupName: String
            groupType: String
        }
        type GetGroupNamesRes {
            status: String
            groups: [GroupData]
        }
    `,
    queries: `
        getGroups(pageInput: PageInput, groupFilter :GroupFilterInput, groupType :GroupType): GroupList!
        exportGroupToCSV(groupKind :groupingCriteria, groupId: ID, autosyncInput : autosyncInput): GroupCSVResponse!
        getGroupsOfUser(userId: ID!): getGroupsOfUserResponse
        getSingleGroup(groupId: ID!): SingleGroupRes
        getUsersAndAutoSyncedGroups(search: String): UserAndAutoSyncedGroupRes!
        getSingleAutoSyncGroupUsers(input: SingleGroupInput!): SingleGroupRes!
        getAllGroupMembers(groupKind :groupingCriteria, groupId :ID,pageInput : PageInput,groupFilter : memberFilter, autosyncInput : autosyncInput ):memberResponse
        getGroupNames(groupId: ID!): GetGroupNamesRes!
    `,
    mutations: `
        createOrUpdateGroup(input: createGroupInput!): GroupResponse!
        deleteGroup(ids: [ID!]!): DeleteGroupResponse!
    `,
};
