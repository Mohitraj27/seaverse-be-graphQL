const { AuthUser, Role } = require("../../../util/index.js");
const { getCustomGroups, getAutoSyncedGroups } = require("../../user/group-user/group_helper.js");
const TrainingEnrolmentHelper = require("./training_enrolment_helper.js");

module.exports.queries = {
    searchUsersAndGroups: async ({ query }, context) => {
        const { subscriberId, userInfo } = AuthUser(context);

        const UserList = await TrainingEnrolmentHelper.searchUsers(query);

        const customGroups = await getCustomGroups();
        const autoSyncedGroups = await getAutoSyncedGroups(subscriberId);

        const totalMemberCount = customGroups.length + autoSyncedGroups.length;

        const allGroupsData = [...customGroups, ...autoSyncedGroups];
        const groupNamesList = allGroupsData.map(obj => obj.groupName);

        const filteredGroupNamesList = TrainingEnrolmentHelper.searchArray(groupNamesList, query);

        SearchInEnrolResponse = {
            users: UserList,
            groups: filteredGroupNamesList,
        };
        return SearchInEnrolResponse;
    },
};

module.exports.mutations = {};
