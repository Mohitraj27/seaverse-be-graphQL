const {Group} = require("./group_model");
const {GroupMember} = require("./group_member_model");
const { ObjectId } = require("../../../tools");
const { CustomError, ErrorName, AuthUser, Role, UploadHelper } = require("../../../util");
const LogHelper = require("../../logs/log_helper");
const Permission = require("../../user/sub-roles/permission.json");
const LogType = require("../../logs/log_type.json");
const SubRoleHelper = require("../sub-roles/sub_role_helper");

module.exports.queries = {
    getGroupMembers: async ({ pageInput,group, filterInput }, context) => {
        const { subscriberId } = AuthUser(context);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;
        let filterConditions = {group:group, isDeleted: false };

        if (!filterInput.isExclude) {
            filterConditions.isExclude = {$ne:false};
        } else{
            filterConditions.isExclude = false;
        }

        const groupAggr = [
            {
                $match: filterConditions,
            },
            {
                $lookup: {
                    from: 'users', 
                    localField: 'member',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            {
                $unwind: '$user' 
            },
            ...(filterInput?.search
                ? [
                      {
                          $match: {
                              $or: [
                                  {
                                      "user.firstName": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "user.lastName": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "user.email": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                              ],
                          },
                      },
                  ]
            : []),
            {
                $project: {
                    group: group,
                    user: {
                        _id: '$user._id',
                        firstName: '$user.firstName',
                        lastName: '$user.lastName',
                        email: '$user.email',
                        UID: '$user.UID'
                    }
                }
            }
        ];

        const result = await GroupMember.aggregatePaginate(
            GroupMember.aggregate(groupAggr),
            {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "member",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            }
        )
    
        return result
    }
};

module.exports.mutations = {
    addUsersToGroup: async ({ group, memberIDs, isExclude }, context) => {
        const { role, userPermissions, userInfo, subscriberId } = AuthUser(context);
        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.GET_EMPLOYEES,
                    Permission.CREATE_TRAINING_REGISTRATION,
                    Permission.GET_REGISTRATION_REPORTS,
                    Permission.GET_REVENUE_REPORTS,
                ],
                requiredAll: false,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const existingGroup = await Group.findOne({
            _id: group,
            subscriber: subscriberId,
            isDeleted: false
        })

        if (!existingGroup){
            throw CustomError(ErrorName.NOT_FOUND);
        }
  
        try {
          const existingMembers = await GroupMember.find({
            group: group,
            member: { $in: memberIDs },
          }).select('member');
  
          const existingMemberIds = existingMembers.map((member) => member.member.toString());
          const existingMemberIdsSet = new Set(existingMemberIds);
          const newMembers = memberIDs.filter(userID => !existingMemberIdsSet.has(userID.toString()));
          
          const groupMembers = newMembers.map((userID) => ({
            group: group,
            member: userID,
            subscriber: subscriberId,
            isExclude: isExclude
          }));
  
          const result = await GroupMember.insertMany(groupMembers);
          await Group.findByIdAndUpdate(group, { $inc: { memberCount: result.length } });

          LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.GROUP_MEMBER_LOG,
                operation: "CREATE",
                ipInfo: context.ipInfo,
                affected: [
                    {
                        targetRef: "Group",
                        target: existingGroup._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "GROUP_INFO",
                        infoData: JSON.stringify(memberIDs),
                    },
                ],
                createdBy: userInfo,
            });

          return {
            success: true,
            message: `Added ${result.length} users to the group`,
            addedCount: result.length,
          };
        } catch (error) {
          console.error('Error adding users to group:', error);
          throw new Error('Failed to add users to group');
        }
    },

    removeUsersFromGroup: async ({ group, memberIDs, removeAll, isExclude }, context) => {
        const { role, userPermissions, userInfo, subscriberId } = AuthUser(context);
  
        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.GET_EMPLOYEES,
                    Permission.CREATE_TRAINING_REGISTRATION,
                    Permission.GET_REGISTRATION_REPORTS,
                    Permission.GET_REVENUE_REPORTS,
                ],
                requiredAll: false,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const existingGroup = await Group.findOne({
            _id: group,
            subscriber: subscriberId,
            isDeleted: false
        })

        if (!existingGroup){
            throw CustomError(ErrorName.NOT_FOUND);
        }
  
        try {
            let result;
    
            if (removeAll) {
              result = await GroupMember.deleteMany({ group: group, isExclude:isExclude });
              await Group.findByIdAndUpdate(group, { $set: { memberCount: 0 } });
            } else {
              result = await GroupMember.deleteMany({
                group: group,
                isExclude: isExclude,
                member: { $in: memberIDs },
              });
              await Group.findByIdAndUpdate(group, { $inc: { memberCount: -result.deletedCount } });
            }

            LogHelper.logActivity({
                subscriber: subscriberId,
                logType: LogType.GROUP_MEMBER_LOG,
                operation: "DELETE",
                ipInfo: context.ipInfo,
                affected: [
                    {
                        targetRef: "Group",
                        target: existingGroup._id,
                    },
                ],
                additionalInfo: [
                    {
                        infoType: "GROUP_INFO",
                        infoData: JSON.stringify(memberIDs),
                    },
                ],
                createdBy: userInfo,
            });
    
            return {
              success: true,
              message: removeAll
                ? `Removed all users from the group`
                : `Removed ${result.deletedCount} users from the group`,
              removedCount: result.deletedCount,
            };
          } catch (error) {
            console.error('Error removing users from group:', error);
            throw new Error('Failed to remove users from group');
        }
    }
};