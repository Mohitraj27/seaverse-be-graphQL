const { Moment, ConsoleLog } = require("../../../tools");
const {
    CustomError,
    ErrorName,
    AuthUser,
    Role,
    DbTransactionHelper,
    CurrentDateTime,
} = require("../../../util");

const { TrainingRegistrationInvoice } = require("./training_registration_invoice_model");
const { SubscriberProfile } = require("../../user/subscriber-profile/subscriber_profile_model");
const { TrainingRegistration } = require("../training_registration_model");
const { Organization } = require("../../organizations/organization_model");
const { Employee } = require("../../user/employee/employee_model");
const { Training } = require("../../trainings/training_model");

const TrainingRegistrationInvoiceHelper = require("./training_registration_invoice_helper");
const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");
const LogHelper = require("../../logs/log_helper");

const Permission = require("../../user/sub-roles/permission.json");
const LogType = require("../../logs/log_type.json");

module.exports.queries = {
    getTrainingRegistrationInvoices: async ({ pageInput, filterInput }, context) => {
        if (context.platform !== Role.ADMIN) throw CustomError(ErrorName.FORBIDDEN);

        const { role, userPermissions, subscriberId, isOrganizationManager } = AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [Permission.DOWNLOAD_INVOICE],
                requiredAll: true,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;
        let filterConditions = { subscriber: subscriberId, isDeleted: { $ne: true } };

        if (filterInput) {
            if (filterInput.organization)
                filterConditions["organizationDetails.organization"] = filterInput.organization;

            if (filterInput.training)
                filterConditions["orderItems.training"] = filterInput.training;

            if (filterInput.dateFrom || filterInput.dateTo) {
                if (filterInput.dateFrom) {
                    filterConditions.createdAt = {
                        ...filterConditions.createdAt,
                        $gte: Moment(filterInput.dateFrom).startOf("day").toDate(),
                    };
                }

                if (filterInput.dateTo) {
                    filterConditions.createdAt = {
                        ...filterConditions.createdAt,
                        $lte: Moment(filterInput.dateTo).endOf("day").toDate(),
                    };
                }
            }
        }

        const fetchResult = async pipeline => {
            return await TrainingRegistrationInvoice.aggregatePaginate(
                TrainingRegistrationInvoice.aggregate(pipeline),
                {
                    offset: skip,
                    limit,
                    sort: { createdAt: "descending" },
                    customLabels: {
                        docs: "trainingRegistrationInvoices",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
        };

        const pipeline = [
            {
                $match: filterConditions,
            },

            ...(filterInput?.search
                ? [
                      {
                          $match: {
                              $or: [
                                  {
                                      invoiceNo: {
                                          $regex: filterInput.search,
                                          $options: "i",
                                      },
                                  },
                                  {
                                      buyerOrderNo: {
                                          $regex: filterInput.search,
                                          $options: "i",
                                      },
                                  },
                              ],
                          },
                      },
                  ]
                : []),
        ];

        return await fetchResult(pipeline);
    },
    getTrainingRegistrationInvoice: async ({ id }, context) => {
        if (context.platform !== Role.ADMIN) throw CustomError(ErrorName.FORBIDDEN);

        const { role, userPermissions, subscriberId } = AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [Permission.DOWNLOAD_INVOICE],
                requiredAll: true,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const existingTrainingRegistrationInvoice = await TrainingRegistrationInvoice.findOne({
            _id: id,
            subscriber: subscriberId,
            isActive: true,
            isDeleted: { $ne: true },
        }).lean();

        if (!existingTrainingRegistrationInvoice) throw CustomError(ErrorName.NOT_FOUND);
        return existingTrainingRegistrationInvoice;
    },
    getTrainingRegistrationsForInvoiceGeneration: async ({ pageInput, filterInput }, context) => {
        if (context.platform !== Role.ADMIN) throw CustomError(ErrorName.FORBIDDEN);

        const { role, userPermissions, subscriberId, isOrganizationManager } = AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [Permission.GENERATE_INVOICE],
                requiredAll: true,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0,
            limit = pageInput?.limit ?? 50;
        let filterConditions = {
            subscriber: subscriberId,
            isDeleted: { $ne: true },
            invoice: null,
        };

        if (filterInput) {
            if (filterInput.organization) filterConditions.organization = filterInput.organization;
            if (filterInput.status) filterConditions.status = filterInput.status;
        }

        const fetchResult = async pipeline => {
            return await TrainingRegistration.aggregatePaginate(
                TrainingRegistration.aggregate(pipeline),
                {
                    offset: skip,
                    limit,
                    sort: { startDate: "ascending" },
                    customLabels: {
                        docs: "trainingRegistrations",
                        totalDocs: "totalCount",
                        offset: "skip",
                    },
                    pagination: limit !== 0,
                    allowDiskUse: true,
                }
            );
        };

        const pipeline = [
            {
                $match: filterConditions,
            },
            {
                $lookup: {
                    from: Training.collection.name,
                    localField: "training",
                    foreignField: "_id",
                    as: "training",
                    pipeline: [
                        {
                            $project: {
                                trainingCategories: true,
                                trainingSubCategories: true,
                                title: true,
                                price: true,
                            },
                        },
                    ],
                },
            },
            {
                $unwind: "$training",
            },
        ];

        return await fetchResult(pipeline);
    },
};

module.exports.mutations = {
    createOrUpdateTrainingRegistrationInvoice: async ({ input }, context) => {
        if (context.platform !== Role.ADMIN) throw CustomError(ErrorName.FORBIDDEN);

        const { role, userPermissions, isOrganizationManager } = AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [Permission.UPDATE_TRAINING_REGISTRATION],
                requiredAll: true,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        return await TrainingRegistrationInvoiceHelper.createOrUpdateTrainingRegistrationInvoice(
            { input },
            context
        );
    },
    generateTrainingRegistrationInvoice: async ({ input }, context) => {
        if (context.platform !== Role.ADMIN) throw CustomError(ErrorName.FORBIDDEN);

        const { role, userId, userInfo, userPermissions, subscriberId, isOrganizationManager } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [Permission.GENERATE_INVOICE],
                requiredAll: true,
                restrictOrganizationManager: isOrganizationManager,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        if (
            !input.orderItems?.length ||
            input.orderItems.some(
                x =>
                    !x.trainingRegistrationDetailsList?.length ||
                    x.trainingRegistrationDetailsList.some(xy => xy.trainingRegistration == null)
            )
        ) {
            throw CustomError(ErrorName.BAD_REQUEST);
        }

        const trainingRegistrationIds = input.orderItems.reduce((result, x) => {
            x.trainingRegistrationDetailsList.forEach(xy => {
                if (!result.includes(xy.trainingRegistration.toString())) {
                    result.push(xy.trainingRegistration.toString());
                }
            });

            return result;
        }, []);

        const existingTrainingRegistrationsWithInvoice = await TrainingRegistration.find({
            _id: { $in: trainingRegistrationIds },
            invoice: { $ne: null },
        })
            .lean()
            .select("_id");

        if (existingTrainingRegistrationsWithInvoice?.length) {
            throw CustomError(ErrorName.ALREADY_EXIST);
        }

        const existingSubscriberProfile = await SubscriberProfile.findOne({
            subscriber: subscriberId,
        })
            .lean()
            .populate("user");
        const invoiceAmount = input.invoiceAmount;
        const invoiceTaxRate = existingSubscriberProfile?.vatDetails?.vatPercentage ?? 0;
        const invoiceTaxAmount = invoiceAmount * (invoiceTaxRate / 100);
        const invoiceTotalAmount = invoiceAmount + invoiceTaxAmount;

        const savedTrainingRegistrationInvoice = await DbTransactionHelper.performDbTransaction(
            async session => {
                const [savedTrainingRegistrationInvoice] = await TrainingRegistrationInvoice.create(
                    [
                        {
                            subscriber: subscriberId,
                            subscriberInfo: {
                                name: `${existingSubscriberProfile?.user?.firstName} ${existingSubscriberProfile?.user?.lastName}`.trim(),
                                logo: existingSubscriberProfile?.user?.avatar,
                                vat: existingSubscriberProfile?.vatDetails?.vat,
                                address: existingSubscriberProfile?.basicInfo?.address,
                                phone: existingSubscriberProfile?.user?.phone?.number,
                                alternatePhone:
                                    existingSubscriberProfile?.basicInfo?.alternatePhone,
                                email: existingSubscriberProfile?.user?.email,
                                website: existingSubscriberProfile?.basicInfo?.website,
                            },
                            organizationDetails: input.organizationDetails,
                            orderItems: input.orderItems,
                            invoiceNo:
                                await TrainingRegistrationInvoiceHelper.generateTrainingRegistrationInvoiceNumber(
                                    { subscriberId, session }
                                ),
                            invoiceDate: input.invoiceDate ?? CurrentDateTime().utcDateTime,
                            buyerOrderNo: input.buyerOrderNo,
                            buyerOrderDate: input.buyerOrderDate,
                            deliveryNote: input.deliveryNote,
                            paymentMode: input.paymentMode,
                            termsOfDelivery: input.termsOfDelivery,
                            currency:
                                existingSubscriberProfile?.basicInfo?.currency ?? input.currency,
                            invoiceAmount,
                            invoiceTaxRate,
                            invoiceTaxAmount,
                            invoiceTotalAmount,
                            invoiceQuantity: input.invoiceQuantity,
                            invoiceReference: input.invoiceReference,
                            bankDetails:
                                existingSubscriberProfile?.bankDetails ?? input.bankDetails,
                            remarks: input.remarks,
                            status: input.status ?? "PAID",
                            createdBy: userId,
                        },
                    ],
                    { session }
                );

                if (!savedTrainingRegistrationInvoice) throw CustomError(ErrorName.FAILED);

                const savedTrainingRegistrations = await TrainingRegistration.updateMany(
                    {
                        _id: { $in: trainingRegistrationIds },
                        invoice: null,
                    },
                    { invoice: savedTrainingRegistrationInvoice },
                    { new: true, lean: true, session }
                );

                if (!savedTrainingRegistrations) throw CustomError(ErrorName.FAILED);

                return savedTrainingRegistrationInvoice;
            }
        );

        if (!savedTrainingRegistrationInvoice) throw CustomError(ErrorName.FAILED);
        TrainingRegistrationInvoiceHelper.sendNotificationOnCRUD({
            subscriber: subscriberId,
            trainingRegistrationInvoice: savedTrainingRegistrationInvoice,
            action: "GENERATED",
            createdBy: userInfo,
        });

        LogHelper.logActivity({
            subscriber: subscriberId,
            logType: LogType.TRAINING_REGISTRATION_INVOICE_LOG,
            operation: "CREATE",
            ipInfo: context.ipInfo,
            affected: [
                {
                    targetRef: "TrainingRegistrationInvoice",
                    target: savedTrainingRegistrationInvoice._id,
                },
            ],
            additionalInfo: [
                {
                    infoType: "TRAINING_REGISTRATION_INVOICE_INFO",
                    infoData: JSON.stringify(input),
                },
            ],
            createdBy: userInfo,
        });

        return savedTrainingRegistrationInvoice;
    },
};
