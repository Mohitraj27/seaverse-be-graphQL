const {Designation} = require("./designation_model");
const { ObjectId } = require("../../tools");
const { CustomError, ErrorName, AuthUser, Role, UploadHelper } = require("../../util");
const SubRoleHelper = require("../user/sub-roles/sub_role_helper");
const LogHelper = require("../logs/log_helper");
const Permission = require("../user/sub-roles/permission.json");
const LogType = require("../logs/log_type.json");
const {Employee} = require("../user/employee/employee_model");

module.exports.queries = {
    getDesignations: async ({ pageInput, filterInput }, context) => {
        const { subscriberId } = AuthUser(context);

        const skip = pageInput?.skip, limit = pageInput?.limit;
    try{
        let filterConditions = { subscriber: subscriberId, isDeleted: { $ne: true } };

        if (filterInput?.search) {
            filterConditions = {
                ...filterConditions,
                $and: [
                    {
                        "name": {
                            $regex: ".*" + filterInput.search + ".*",
                            $options: "i",
                        },
                    },
                ],
            };
        }

        if (typeof skip !== "undefined" && typeof limit !== "undefined") {
            return await Designation.aggregatePaginate(
                Designation.aggregate([{ $match: filterConditions }]),
                {
                    offset: skip,
                    limit,
                    sort: { createdAt: "descending" },
                    customLabels: {
                        docs: "designations",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
        } else {
            const designations = await Designation.aggregate([
                { $match: filterConditions },
                { $sort: { name: 1 } },
            ]);

            return {
                designations,
                totalCount: designations.length,
            };
        }
    }
    catch(error){
        throw CustomError(ErrorName.FAILED_TO_FETCH_DESIGNATIONS, `${error.message}`);
    }}
};

module.exports.mutations = {
    createOrUpdateDesignation: async ({ id, input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId} =
            AuthUser(context);

        const designationFilterConditions = {
            _id: input._id ?? ObjectId(),
            subscriber: subscriberId,
        };

        const designationUpdateData = {};

        if (input.name) {
            const existingDesignation = await Designation.findOne({
                name: { $regex: `^${input.name}$`, $options: "i" },
                subscriber: subscriberId
            })
                .lean()
                .select("_id");

            if (
                existingDesignation &&
                existingDesignation?._id?.toString() !==
                designationFilterConditions._id?.toString()
            ) {
                throw CustomError(ErrorName.ALREADY_EXIST);
            }
        }

        if (input.name) designationUpdateData.name = input.name;
        if (input.isManager) designationUpdateData.isManager = input.isManager;
        
        const savedDesignation = await Designation.findOneAndUpdate(
            designationFilterConditions,
            {
                ...designationFilterConditions,
                ...designationUpdateData,
                $setOnInsert: {
                    createdBy: userId,
                },
                updatedBy: userId,
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
                runValidators: true,
                lean: true,
            }
        );

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.DESIGNATION_LOG,
            operation: input._id ? "UPDATE" : "CREATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "Designation",
                    target: savedDesignation._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "DESIGNATION_INFO",
                    infoData: JSON.stringify(input),
                },
            ],
            createdBy: userInfo,
        });

        return savedDesignation;
        
    },
    deleteDesignation: async ({ id }, context) => {

        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        try {
            const designation = await Designation.findOne({_id: id, subscriber: subscriberId});
            if (!designation) {
                throw new Error('Designation not found.');
            }

            const isUsedByUser = await Employee.findOne({ empDesignation: id }).lean().select('_id');
            if (isUsedByUser) {
                return {
                    success: false,
                    message: 'Designation cannot be deleted because it is used by one or more users.'
                };
            }

            designation.isDeleted = true;
            await designation.save();

            return {
                success: true,
                message: 'Designation deleted successfully.'
            };
        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    },
};