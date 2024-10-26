const TrainingEnrolmentHelper = require("./training_enrolment_helper.js");

module.exports.queries = {
    searchUsersAndGroups: async ({ query }, context) => {
        const UserList = await TrainingEnrolmentHelper.searchUsers(query);
        const GroupNamesList = [];

        SearchInEnrolResponse = {
            users: UserList,
            groups: GroupNamesList,
        };
        return SearchInEnrolResponse;
    },
};

module.exports.mutations = {};
