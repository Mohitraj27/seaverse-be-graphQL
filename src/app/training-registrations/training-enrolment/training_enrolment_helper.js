const { User } = require("../../user/user_model");
const { Group } = require("../../user/group-user/group_model");

const isValidEmail = email => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

module.exports = {
    searchUsers : async query => {
        if (!query) {
            throw new Error("Query must not be empty");
        }
    
        try {
            const regex = new RegExp(`^${query}`, "i");
    
            const users = await User.find({
                $or: [{ firstName: regex }, { lastName: regex }],
                isDeleted: false,
                isRegistered : true,
            });
    
            return users.map(user => `${user.firstName} ${user.lastName}`);
        } catch (error) {
            throw new Error("Error searching for users: " + error.message);
        }
    },
    searchGroupsByName: async groupName => {
        if (!groupName) {
            throw new Error("Group name must not be empty");
        }
    
        try {
            const regex = new RegExp(groupName, "i");
    
            const groups = await Group.find({
                groupName: regex,
                isDeleted: false,
            });
    
            return groups;
        } catch (error) {
            throw new Error("Error searching for groups: " + error.message);
        }
    },
};
