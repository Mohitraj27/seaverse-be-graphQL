const { CryptoHelper, MomentTimezone } = require("../../../tools");
const { CustomError, ErrorName, AuthUser, Role, SendEmail } = require("../../../util");

const { User } = require("../user_model");
const { Employee } = require("../employee/employee_model");
const {
    TrainingCertificate,
} = require("../../training-registrations/training-certificates/training_certificate_model");
const {
    TrainingRegistration,
} = require("../../training-registrations/training_registration_model");
const { SubscriberProfile } = require("../subscriber-profile/subscriber_profile_model");

const UserHelper = require("../user_helper");
const UserAddressHelper = require("../user-addresses/user_address_helper");

const TrainingRegistrationStatus = require("../../training-registrations/training_registration_status.json");
const AwsHelper = require("../../../util/aws_helper");
const user = require("..");

const { isAlphanumeric } = require('../../../util/password_helper');

const { sendNodeEmail } = require("./user_profile_helper");


module.exports.queries = {
    getUserProfile: async ({ }, context) => {
        const { isAuthenticated, role, userId } = AuthUser(context, false);

        const fetchResult = async (userId, population) => {
            const existingUser = await User.findById(userId)
                .lean()
                .populate({
                    path: "subRoles",
                    match: { isActive: true, isDeleted: { $ne: true } },
                })
                .populate(population);
            if (!existingUser) throw CustomError(ErrorName.NOT_FOUND);

            if (existingUser.avatar) {
                existingUser.avatar = await AwsHelper.fetchFile(existingUser.avatar);
            }

            return existingUser;
        };

        if (isAuthenticated) {
            return { "user": fetchResult(userId) };
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
    getProfile: async ({ id }, context) => {
        const { isAuthenticated, role, userId } = AuthUser(context, false);

        const fetchResult = async (id, population) => {
            const existingUser = await User.findById(id)
                .lean()
                .populate({
                    path: "subRoles",
                    match: { isActive: true, isDeleted: { $ne: true } },
                })
                .populate(population);
            if (!existingUser) throw CustomError(ErrorName.NOT_FOUND);

            if (existingUser.employee?.trainingCertificates?.length) {
                existingUser.employee.trainingCertificates =
                    existingUser.employee.trainingCertificates.filter(
                        x => x.trainingRegistration != null
                    );
            }

            return existingUser;
        };

        const trainingCertificatesPopulation = {
            path: "trainingCertificates",
            match: { isDeleted: { $ne: true } },
            populate: { path: "trainingRegistration", select: "_id" },
            options: { sort: { expiresAt: -1 } },
        };

        const employeePopulation = {
            path: "employee",
            populate: [{ path: "organization" }, trainingCertificatesPopulation],
        };

        if (id) {
            return fetchResult(id, employeePopulation);
        } else if (role === Role.EMPLOYEE) {
            return fetchResult(userId, employeePopulation);
        } else if (isAuthenticated) {
            return fetchResult(userId);
        }

        throw CustomError(ErrorName.FORBIDDEN);
    },
    getPublicProfile: async ({ id }, context) => {
        const existingUser = await User.findById(id).lean();
        if (!existingUser) throw CustomError(ErrorName.NOT_FOUND);

        const existingEmployee = await Employee.findOne({ user: id })
            .populate("organization")
            .lean();
        if (!existingEmployee) throw CustomError(ErrorName.NOT_FOUND);
        const existingTrainingCertificates = await TrainingCertificate.aggregate([
            {
                $match: { employee: existingEmployee._id, isDeleted: { $ne: true } },
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
        ]);

        let statistics;
        try {
            statistics = (
                await TrainingRegistration.aggregate([
                    { $match: { employee: existingEmployee._id } },
                    {
                        $facet: {
                            assignedCourses: [
                                {
                                    $match: {
                                        status: TrainingRegistrationStatus.REGISTERED,
                                    },
                                },
                                {
                                    $group: {
                                        _id: "assignedCourses",
                                        count: { $sum: 1 },
                                    },
                                },
                            ],
                            ongoingCourses: [
                                {
                                    $match: { status: TrainingRegistrationStatus.STARTED },
                                },
                                {
                                    $group: {
                                        _id: "ongoingCourses",
                                        count: { $sum: 1 },
                                    },
                                },
                            ],
                            completedCourses: [
                                {
                                    $match: { status: TrainingRegistrationStatus.COMPLETED },
                                },
                                {
                                    $group: {
                                        _id: "completedCourses",
                                        count: { $sum: 1 },
                                    },
                                },
                            ],
                            aboutDueCourses: [
                                {
                                    $match: {
                                        status: { $ne: TrainingRegistrationStatus.COMPLETED },
                                    },
                                },
                                {
                                    $project: {
                                        dueWarningDate: {
                                            $dateSubtract: {
                                                startDate: "$endDate",
                                                unit: "day",
                                                amount: 5,
                                            },
                                        },
                                    },
                                },
                                {
                                    $match: {
                                        dueWarningDate: {
                                            $lte: MomentTimezone.tz(context.timezone).toDate(),
                                        },
                                    },
                                },
                                {
                                    $group: {
                                        _id: "aboutDueCourses",
                                        count: { $sum: 1 },
                                    },
                                },
                            ],
                        },
                    },
                ])
            )[0];

            statistics = {
                assignedCourses: statistics?.assignedCourses[0]?.count,
                ongoingCourses: statistics?.ongoingCourses[0]?.count,
                completedCourses: statistics?.completedCourses[0]?.count,
                aboutDueCourses: statistics?.aboutDueCourses[0]?.count,
            };
        } catch (_) { }

        return {
            user: existingUser,
            employee: existingEmployee,
            trainingCertificates: existingTrainingCertificates ?? [],
            trainingStatistics: {
                assignedCourses: statistics?.assignedCourses,
                ongoingCourses: statistics?.ongoingCourses,
                completedCourses: statistics?.completedCourses,
                aboutDueCourses: statistics?.aboutDueCourses,
            },
            subscriberProfile: await SubscriberProfile.findOne({
                subscriber: existingEmployee.subscriber,
            })
                .lean()
                .select("user")
                .populate({ path: "user", select: "firstName lastName avatar" }),
        };
    },
};

module.exports.mutations = {
    updateProfile: async ({ input }, context) => {
        const { role, userId } = AuthUser(context);

        const savedUser = await UserHelper.updateUser({ id: userId, input }, { currentRole: role });

        if (savedUser) {
            if (input.address) {
                savedUser.address = await UserAddressHelper.createOrUpdateAddress(
                    { input: input.address },
                    { userId }
                );
            }

            if (savedUser.avatar) {
                savedUser.avatar = await AwsHelper.fetchFile(savedUser.avatar);
            }

            return savedUser;
        }

        throw CustomError(ErrorName.FAILED);
    },
    changePassword: async ({ input }, context) => {
        try {
            const { userId } = AuthUser(context);
            const { currentPassword, newPassword, confirmPassword } = input;

            const existingUser = await User.findById(userId);
            if (!existingUser) {
                throw new CustomError(ErrorName.NOT_FOUND);
            }
            if (newPassword !== confirmPassword) {
                throw new CustomError(ErrorName.PASSWORD_MISMATCH);
            }
            const isResetPasswordDialog = existingUser.isResetPasswordDialog;
            if (isResetPasswordDialog) {
                if (!currentPassword || !newPassword || !confirmPassword) {
                    throw new CustomError(ErrorName.PROVIDE_PASSWORDS);
                }
            } else {
                if (!newPassword || !confirmPassword) {
                    throw new CustomError(ErrorName.PROVIDE_PASSWORDS);
                }
            }
            if (!isAlphanumeric(newPassword)) {
                throw new CustomError(ErrorName.INVALID_PASSWORD);
            }
            if (isResetPasswordDialog) {
                const isPasswordValid = await CryptoHelper.compare(currentPassword, existingUser.password);
                if (!isPasswordValid) {
                    throw new CustomError(ErrorName.INVALID_PASSWORD);
                }
            }
            existingUser.password = await CryptoHelper.hash(newPassword, 10);

            existingUser.isResetPasswordDialog = false;

            await existingUser.save();

            return "Password updated successfully!";
        } catch (error) {
            throw error instanceof CustomError ? error : new CustomError(ErrorName.SERVER_ERROR, error.message);
        }
    },

    forgetPassword: async ({ email }) => {

        try {

            const existingUser = await User.findOne({ email });

            if (!existingUser) {
                throw new CustomError(ErrorName.NOT_FOUND);
            }

            const token = 'clgjr0wt540t4QefklDsfdsfbdfb';

            const htmlContent = `
                <!DOCTYPE html>
                <html lang="en">
                    <head>
                        <meta charset="UTF-8" />
                        <title>Reset Password</title>
                    </head>
                    <body>
                        <div style="width: 600px; margin: 0 auto; text-align: center">
    
                            <p>Please visit the link below to reset your password</p>
    
                            <a href="${process.env.APP_URL}/reset-password/${token}}" target="_blank">
                                Click Here
                            </a>
                        </div>
                    </body>
                </html>
            `;

            existingUser.resetPasswordToken = token;
            existingUser.resetPasswordExpires = Date.now() + 21600000;

            const addTokenToUser = await existingUser.save();

            if (addTokenToUser) {

                const mailRes = await sendNodeEmail({ receiverEmail: email, subject: "Reset Password", htmlContent });

                if (mailRes.status === 'success') {
                    return {
                        success: true,
                        message: "Reset link sent. Please check your registered email."
                    }
                } else {
                    throw new CustomError(ErrorName.FAILED);
                }

            } else {
                throw new CustomError(ErrorName.FAILED);
            }

        } catch (error) {
            console.error(error);
        }

    },

    verifyResetPassword: async ({ token }) => {

        try {

            const user = await User.findOne({ resetPasswordToken: token });

            if (!user) {
                throw new CustomError(ErrorName.NOT_FOUND);
            }

            if (user.resetPasswordExpires < Date.now()) {
                throw new CustomError(ErrorName.EXPIRED_TOKEN);
            }

            return "Success";

        } catch (error) {
            console.error(error);
        }

    },
    newPasswordAfterReset: async ({ input }, context) => {

        try {

            if (!input.type) {
                throw new CustomError(ErrorName.ARGUMENTS_REQUIRED);
            }

            if (input.type === "FORGET_PASSWORD" && !input.token) {
                throw new CustomError(ErrorName.ARGUMENTS_REQUIRED);
            }

            if (input.newPassword !== input.confirmPassword) {
                throw new CustomError(ErrorName.PASSWORD_MISMATCH);
            }

            const user = await User.findOne({
                $or: [
                    { resetPasswordToken: input.token },
                    { _id: input.userId }
                ]
            });

            if (!user) {
                throw new CustomError(ErrorName.NOT_FOUND);
            }

            if (!isAlphanumeric(input.newPassword)) {
                throw new CustomError(ErrorName.INVALID_PASSWORD);
            }

            user.password = await CryptoHelper.hash(input.newPassword, 10);
            user.resetPasswordToken = null;
            user.resetPasswordExpires = null;

            const updateUser = await user.save();

            if (updateUser) {
                return "Password updated successfully!";
            } else {
                throw new CustomError(ErrorName.FAILED);
            }

        } catch (error) {
            console.error(error);
        }

    },
    selfDeleteRequest: async (_, context) => {

        try {
            const { userId } = AuthUser(context);

            if (!userId) {
                throw new CustomError(ErrorName.UNAUTHORIZED);
            };

            const updateUser = await User.findByIdAndUpdate(userId, { $set: { deleteRequest: true, deleteRequestDate: Date.now() } });

            if (updateUser) {
                return "Deleted requested Successfully!";
            } else {
                throw new CustomError(ErrorName.FAILED);
            }
        } catch (error) {
            console.error(error);
        }

    }
};
