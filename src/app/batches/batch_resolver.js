const { Moment } = require("../../tools");
const { CustomError, ErrorName, AuthUser, Role, CurrentDateTime } = require("../../util");

const { Batch } = require("./batch_model");

const { BatchHelper } = require("./batch_helper");
const SubRoleHelper = require("../user/sub-roles/sub_role_helper");
const LogHelper = require("../logs/log_helper");

const BatchStatus = require("./batch_status.json");
const Permission = require("../user/sub-roles/permission.json");
const LogType = require("../logs/log_type.json");

module.exports.queries = {
    getBatches: async ({ pageInput, filterInput }, context) => {
        if (context.platform !== Role.ADMIN) throw CustomError(ErrorName.FORBIDDEN);

        const { role, userPermissions, subscriberId, isOrganizationManager, managingOrganization } =
            AuthUser(context);

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;

        let filterConditions = { subscriber: subscriberId };

        if (filterInput) {
            if (filterInput.organization) filterConditions.organization = filterInput.organization;
            if (filterInput.training) filterConditions.training = filterInput.training;
            if (filterInput.trainer) filterConditions.trainer = filterInput.trainer;
            if (filterInput.employee) filterConditions["employees.employee"] = filterInput.employee;
            if (filterInput.status) filterConditions.status = filterInput.status;

            if (filterInput.dateFrom || filterInput.dateTo) {
                if (filterInput.dateFrom) {
                    filterConditions.startDate = {
                        ...filterConditions.startDate,
                        $gte: Moment(filterInput.dateFrom).startOf("day").toDate(),
                    };
                }

                if (filterInput.dateTo) {
                    filterConditions.startDate = {
                        ...filterConditions.startDate,
                        $lte: Moment(filterInput.dateTo).endOf("day").toDate(),
                    };
                }
            }
        }

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [
                    Permission.GET_BATCHES,
                    Permission.GET_TRAINING_REGISTRATION_ATTENDANCE,
                ],
                requiredAll: true,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (isOrganizationManager) {
            filterConditions.organization = managingOrganization;
        }

        const pipeline = [
            { $match: filterConditions },
            ...(filterInput?.search
                ? [
                      {
                          $match: {
                              $or: [
                                  {
                                      UID: {
                                          $regex: filterInput.search,
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "organizationName.value": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "trainingTitle.value": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      trainerName: {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "employees.employeeName": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "employees.employeeEmail": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "employees.employeeCivilIdOrPassport": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "employees.employeeRigNumber": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                              ],
                          },
                      },
                  ]
                : []),
        ];

        return Batch.aggregatePaginate(Batch.aggregate(pipeline), {
            offset: skip,
            limit,
            sort: { createdAt: "descending" },
            customLabels: {
                docs: "batches",
                totalDocs: "totalCount",
                offset: "skip",
            },
            pagination: limit !== 0,
            allowDiskUse: true,
        });
    },
};

module.exports.mutations = {
    updateBatch: async ({ id, input }, context) => {
        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.UPDATE_BATCH,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const existingBatch = await Batch.findOne({ _id: id, subscriber: subscriberId });
        if (!existingBatch) throw CustomError(ErrorName.NOT_FOUND);

        const currentDateTime = CurrentDateTime().utcDateTime;

        if (input.purchaseInfo?.status) {
            existingBatch.purchaseInfo.status = input.purchaseInfo.status;
            existingBatch.purchaseInfo.markedAt = currentDateTime;
        }

        if (input.certificateInfo?.status) {
            existingBatch.certificateInfo.status = input.certificateInfo.status;
            existingBatch.certificateInfo.markedAt = currentDateTime;
        }

        if (input.invoiceInfo?.status) {
            existingBatch.invoiceInfo.status = input.invoiceInfo.status;
            existingBatch.invoiceInfo.markedAt = currentDateTime;
        }

        if (input.paymentInfo?.status) {
            existingBatch.paymentInfo.status = input.paymentInfo.status;
            existingBatch.paymentInfo.markedAt = currentDateTime;
        }

        const isPartiallyCompleted =
            existingBatch.purchaseInfo.status === BatchStatus.COMPLETED &&
            existingBatch.certificateInfo.status === BatchStatus.COMPLETED &&
            existingBatch.invoiceInfo.status === BatchStatus.COMPLETED;

        const isCompleted =
            isPartiallyCompleted && existingBatch.paymentInfo.status === BatchStatus.COMPLETED;

        if (isCompleted) {
            existingBatch.status = BatchStatus.COMPLETED;
        } else if (isPartiallyCompleted) {
            existingBatch.status = BatchStatus.PARTIALLY_COMPLETED;
        } else {
            existingBatch.status = BatchStatus.PENDING;
        }

        const savedBatch = await existingBatch.save();
        if (!savedBatch) throw CustomError(ErrorName.FAILED);

        BatchHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            batch: savedBatch,
            action: "UPDATED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.BATCH_LOG,
            operation: "UPDATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "Batch",
                    target: savedBatch._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "BATCH_INFO",
                    infoData: JSON.stringify(input),
                },
            ],
            createdBy: userInfo,
        });

        return savedBatch;
    },
    deleteBatch: async ({ id }, context) => {
        const { role, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: Permission.DELETE_BATCH,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const deletedBatch = await Batch.findOneAndDelete(
            { _id: id, subscriber: subscriberId },
            { lean: true }
        );

        if (!deletedBatch) throw CustomError(ErrorName.FAILED);

        BatchHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            batch: deletedBatch,
            action: "DELETED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.BATCH_LOG,
            operation: "DELETE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "Batch",
                    target: deletedBatch._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "BATCH_INFO",
                    infoData: JSON.stringify(deletedBatch),
                },
            ],
            createdBy: userInfo,
        });

        return deletedBatch;
    },
};
