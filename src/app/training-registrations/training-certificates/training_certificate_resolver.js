const { Moment } = require("../../../tools");
const { CustomError, ErrorName, Role, AuthUser } = require("../../../util");

const { TrainingCertificate } = require("./training_certificate_model");
const { SubscriberProfile } = require("../../user/subscriber-profile/subscriber_profile_model");

const SubRoleHelper = require("../../user/sub-roles/sub_role_helper");

const Permission = require("../../user/sub-roles/permission.json");

module.exports.queries = {
    getTrainingCertificates: async ({ pageInput, filterInput }, context) => {
        /** 
       * Commented for dev purposes 
       * @todo uncomment after fixed 

        if (context.platform !== Role.ADMIN) throw CustomError(ErrorName.FORBIDDEN);
 */
        const { role, userPermissions, subscriberId, isOrganizationManager, managingOrganization } =
            AuthUser(context);

        if (
            !SubRoleHelper.hasPermission({
                currentRole: role,
                currentPermissions: userPermissions,
                requiredPermission: [Permission.DOWNLOAD_CERTIFICATE],
                requiredAll: true,
            })
        ) {
            throw CustomError(ErrorName.FORBIDDEN);
        }

        const skip = pageInput?.skip ?? 0;
        const limit = pageInput?.limit ?? 50;
        let filterConditions = { subscriber: subscriberId, isDeleted: { $ne: true } };

        if (filterInput) {
            if (filterInput.organization) filterConditions.organization = filterInput.organization;
            if (filterInput.training) filterConditions.training = filterInput.training;
            if (filterInput.employee) filterConditions.employee = filterInput.employee;

            if (filterInput.dateFrom || filterInput.dateTo) {
                if (filterInput.dateFrom) {
                    filterConditions.completedAt = {
                        ...filterConditions.completedAt,
                        $gte: Moment(filterInput.dateFrom).startOf("day").toDate(),
                    };
                }

                if (filterInput.dateTo) {
                    filterConditions.completedAt = {
                        ...filterConditions.completedAt,
                        $lte: Moment(filterInput.dateTo).endOf("day").toDate(),
                    };
                }
            }
        }

        const fetchResult = async pipeline => {
            return TrainingCertificate.aggregatePaginate(TrainingCertificate.aggregate(pipeline), {
                offset: skip,
                limit,
                sort: { createdAt: "descending" },
                customLabels: {
                    docs: "trainingCertificates",
                    totalDocs: "totalCount",
                    offset: "skip",
                },
                pagination: limit !== 0,
                allowDiskUse: true,
            });
        };

        if (isOrganizationManager) {
            filterConditions.organization = managingOrganization;
        }

        const pipeline = [
            {
                $match: filterConditions,
            },
            {
                $lookup: {
                    from: "trainingregistrations",
                    localField: "trainingRegistration",
                    foreignField: "_id",
                    as: "trainingRegistration",
                },
            },
            {
                $unwind: { path: "$trainingRegistration" },
            },
            {
                $lookup: {
                    from: "employees",
                    localField: "employee",
                    foreignField: "_id",
                    pipeline: [
                        {
                            $lookup: {
                                from: "users",
                                localField: "user",
                                foreignField: "_id",
                                as: "user",
                            },
                        },
                        {
                            $set: {
                                user: {
                                    $first: "$user",
                                },
                            },
                        },
                    ],
                    as: "employee",
                },
            },
            {
                $set: {
                    employee: {
                        $first: "$employee",
                    },
                },
            },
            ...(filterInput?.search
                ? [
                      {
                          $match: {
                              $or: [
                                  {
                                      certificateNumber: {
                                          $regex: filterInput.search,
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
                                      "organizationName.value": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      employeeName: {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      employeeNo: {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      employeeCivilIdOrPassport: {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      employeeEmail: {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "employee.user.firstName": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "employee.user.lastName": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "employee.user.civilIdOrPassport": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "employee.user.email": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "employee.user.companyEmail": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "employee.user.phone.number": {
                                          $regex: ".*" + filterInput.search + ".*",
                                          $options: "i",
                                      },
                                  },
                                  {
                                      "employee.employeeNo": {
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

        return await fetchResult(pipeline);
    },
    getTrainingCertificate: async ({ id }) => {
        const existingTrainingCertificate = await TrainingCertificate.findOne({
            $or: [{ _id: id }, { trainingRegistration: id }],
            isActive: true,
        })
            .lean()
            .populate({
                path: "trainingRegistration",
                select: "training feedback",
                populate: { path: "training", select: "feedback" },
            })
            .populate({
                path: "employee",
                populate: { path: "user" },
            });

        if (!existingTrainingCertificate) throw CustomError(ErrorName.NOT_FOUND);

        existingTrainingCertificate.subscriberInfo = await SubscriberProfile.findOne({
            subscriber: existingTrainingCertificate.subscriber,
        })
            .lean()
            .select("user")
            .populate({ path: "user", select: "firstName lastName avatar" });

        return existingTrainingCertificate;
    },
    getUserCertificates: async ({ pageInput, id }) => {
        try {
          const pagination = pageInput || { page: 1, limit: 0 };
          const { page, limit } = pagination;
          const skip = (page - 1) * limit;
      
          const certificatesQuery = {
            user: id,
            isDeleted: false,
          };
      
          const certificates = await TrainingCertificate.find(certificatesQuery)
            .skip(skip)
            .limit(limit > 0 ? limit : 0)
            .populate({
              path: 'training',
              select: 'title description',
            })
            .populate({
              path: 'organization',
              select: 'name address',
            })
            .populate({
              path: 'user',
              select: 'firstName lastName avatar',
            })
            .lean();
      
          if (!certificates || certificates.length === 0) {
            return {
              trainingCertificates: [],
              totalCount: 0,
            };
          }
      
          const totalCount = await TrainingCertificate.countDocuments(certificatesQuery);
      
          const certificatesWithSubscriberInfo = await Promise.all(
            certificates.map(async (certificate) => {
              const subscriberInfo = await SubscriberProfile.findOne({ subscriber: certificate.subscriber })
                .lean()
                .select('user')
                .populate({ path: 'user', select: 'firstName lastName avatar' });
      
              certificate.subscriberInfo = subscriberInfo;
      
              return certificate;
            })
          );
      
          return {
            trainingCertificates: certificatesWithSubscriberInfo,
            totalCount,
          };
        } catch (error) {
          throw CustomError(ErrorName.SERVER_ERROR);
        }
      }
      ,
};
