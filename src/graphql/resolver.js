const { GraphQLScalarType, GraphQLError, Kind } = require("graphql");
const { Upload } = require("graphql-upload");

const { ObjectId, Validator } = require("../tools");
const { AuthHelper } = require("../util");

const { AppDataResolver } = require("../app/app-data");
const { AppSettingsResolver } = require("../app/app-settings");
const { BatchResolver } = require("../app/batches");
const { BranchResolver } = require("../app/branches");
const { LogResolver } = require("../app/logs");
const { OrganizationResolver } = require("../app/organizations");
const { TrainingValidityResolver } = require("../app/organizations/training-validity");
const { SaasPaymentResolver } = require("../app/saas/saas-payment");
const { SaasSubscriberResolver } = require("../app/saas/subscriber");
const { SaasSubscriptionResolver } = require("../app/saas/subscriber/subscription");
const { SaasSubscriptionPlanResolver } = require("../app/saas/subscription-plans");
const { StatisticsResolver } = require("../app/statistics");
const { TrainingRegistrationResolver } = require("../app/training-registrations");
const {
    TrainingRegistrationInvoiceResolver,
} = require("../app/training-registrations/training-registration-invoices");
const { TrainingResolver } = require("../app/trainings");
const { TrainingCategoryResolver } = require("../app/trainings/training_categories");
const { GroupTrainingModuleResolver } = require("../app/trainings/training_modules/group_training_module");
const { TrainingModuleResolver } = require("../app/trainings/training_modules");
const {
    TrainingModuleContentResolver,
} = require("../app/trainings/training_modules/training_module_contents");
const { TrainingProgressResolver } = require("../app/training-registrations/training-progress");
const { TrainingAttendanceResolver } = require("../app/training-registrations/training-attendance");
const {
    TrainingCertificateResolver,
} = require("../app/training-registrations/training-certificates");
const { UserResolver } = require("../app/user");
const { EmployeeResolver } = require("../app/user/employee");
const { SubRoleResolver } = require("../app/user/sub-roles");
const { UserProfileResolver } = require("../app/user/user-profile");
const { NotificationResolver } = require("../app/notifications");
const { ReportResolver } = require("../app/reports");
const { SubscriberProfileResolver } = require("../app/user/subscriber-profile");

const { QuizContentResolver } = require("../app/quizzes");
const { QuizAttemptResolver } = require("../app/quizzes/quiz-attempts");

const { DesignationResolver } = require("../app/designations");
const { GroupResolver, GroupMemebrResolver } = require("../app/user/group-user");
const { VesselTypeResolver } = require("../app/vessle/vessel-type");
const { VesselResolver } = require("../app/vessle");
const AwsHelper = require("../util/aws_helper");
const { ContactSupportResolver } = require('../app/contact-support');
const { UserVesselResolver } = require('../app/user/user-vessel-bridge');
const { QuestionResolver } = require('../app/trainings/training_modules/training_module_contents/question');
const { LearningPlanResolver } = require("../app/learning-plan");
const { CertificateLayoutResolver } = require("../app/trainings/certificate_layout");
const { ContentZipResolver } = require("../app/trainings/compress_to_zip");
const { OverallTrainingProgressResolver } = require("../app/training-registrations/overall-course-progress");
const { CompanyResolver } = require("../app/vessle/company");
const { OwnerResolver } = require("../app/vessle/owner");
module.exports = {
    ID: new GraphQLScalarType({
        name: "ID",
        description: "The `ID` scalar type represents a ObjectId.",
        parseValue(value) {
            if (ObjectId.isValid(value)) return ObjectId(value);
            throw new GraphQLError(`ID cannot represent a non ObjectId value: ${value}`);
        },
        parseLiteral(ast) {
            if (ast.kind === Kind.STRING && ObjectId.isValid(ast.value)) return ObjectId(ast.value);
            throw new GraphQLError(`ID cannot represent a non ObjectId value: ${ast.value}`);
        },
        serialize(value) {
            return value.toString();
        },
    }),
    Upload: new GraphQLScalarType({
        name: "Upload",
        description: "The `Upload` scalar type represents a file upload.",
        parseValue(value) {
            if (value instanceof Upload) return value.promise;
            else if (typeof value === "string" && Validator.isURL(value)) return value;
            throw new GraphQLError("Upload value invalid.");
        },
        parseLiteral(ast) {
            if (ast.kind === Kind.STRING && Validator.isURL(ast.value)) return ast.value;
            throw new GraphQLError("Upload literal unsupported.", ast);
        },
        serialize() {
            throw new GraphQLError("Upload serialization unsupported.");
        },
    }),
    MultiMediaInfo: {
        s3Path: async (parent) => {
          if (parent.url) {
            const s3url = await AwsHelper.fetchFile(parent.url);
            return s3url;
          }
          return null;
        },
    },
    TrainingModuleContent: {
        thumbnail: async (parent) => {
          if (parent.thumbnail) {
            const s3url = await AwsHelper.fetchFile(parent.thumbnail);
            return s3url;
          }
          return null;
        },
    },
    Query: {
        ...AuthHelper.simplify(AppDataResolver.queries),
        ...AuthHelper.simplify(AppSettingsResolver.queries),
        ...AuthHelper.requiresEmployee(BatchResolver.queries),
        ...AuthHelper.requiresEmployee(BranchResolver.queries),
        ...AuthHelper.requiresEmployee(LogResolver.queries),
        ...AuthHelper.requiresEmployee(OrganizationResolver.queries),
        ...AuthHelper.requiresSaasAdmin(SaasPaymentResolver.queries),
        ...AuthHelper.requiresAdmin(SaasSubscriberResolver.queries),
        ...AuthHelper.requiresAdmin(SaasSubscriptionResolver.queries),
        ...AuthHelper.simplify(SaasSubscriptionPlanResolver.queries),
        ...AuthHelper.requiresEmployee(StatisticsResolver.queries),
        ...AuthHelper.requiresEmployee(TrainingRegistrationResolver.queries),
        ...AuthHelper.requiresEmployee(TrainingCertificateResolver.queries),
        ...AuthHelper.requiresEmployee(TrainingRegistrationInvoiceResolver.queries),
        ...AuthHelper.requiresEmployee(TrainingResolver.queries),
        ...AuthHelper.requiresEmployee(TrainingCategoryResolver.queries),
        ...AuthHelper.requiresLogin(EmployeeResolver.queries),
        ...AuthHelper.requiresEmployee(SubRoleResolver.queries),
        ...AuthHelper.requiresLogin(UserProfileResolver.queries),
        ...AuthHelper.requiresLogin(NotificationResolver.queries),
        ...AuthHelper.requiresLogin(ReportResolver.queries),
        ...AuthHelper.requiresLogin(SubscriberProfileResolver.queries),
        ...AuthHelper.requiresLogin(TrainingAttendanceResolver.queries),

        ...AuthHelper.requiresLogin(QuizContentResolver.queries),
        ...AuthHelper.requiresLogin(QuizAttemptResolver.queries),
        ...AuthHelper.requiresEmployee(DesignationResolver.queries),
        ...AuthHelper.requiresEmployee(GroupResolver.queries),
        ...AuthHelper.requiresEmployee(GroupMemebrResolver.queries),
        ...AuthHelper.requiresAdmin(TrainingModuleContentResolver.queries),
        ...AuthHelper.requiresAdmin(VesselTypeResolver.queries),
        ...AuthHelper.requiresAdmin(VesselResolver.queries),
        ...AuthHelper.requiresAdmin(LearningPlanResolver.queries),
        ...AuthHelper.requiresAdmin(OverallTrainingProgressResolver.queries),
        ...AuthHelper.requiresAdmin(CompanyResolver.queries),
        ...AuthHelper.requiresAdmin(OwnerResolver.queries),
    },
    Mutation: {
        ...AuthHelper.requiresSaasAdmin(AppSettingsResolver.mutations),
        ...AuthHelper.requiresEmployee(BatchResolver.mutations),
        ...AuthHelper.requiresEmployee(BranchResolver.mutations),
        ...AuthHelper.requiresEmployee(OrganizationResolver.mutations),
        ...AuthHelper.requiresEmployee(TrainingValidityResolver.mutations),
        ...AuthHelper.requiresAdmin(SaasPaymentResolver.mutations),
        ...AuthHelper.requiresAdmin(SaasSubscriberResolver.mutations),
        ...AuthHelper.requiresAdmin(SaasSubscriptionResolver.mutations),
        ...AuthHelper.requiresSaasAdmin(SaasSubscriptionPlanResolver.mutations),
        ...AuthHelper.requiresEmployee(TrainingRegistrationResolver.mutations),
        ...AuthHelper.requiresEmployee(TrainingProgressResolver.mutations),
        ...AuthHelper.requiresEmployee(TrainingAttendanceResolver.mutations),
        ...AuthHelper.requiresEmployee(TrainingRegistrationInvoiceResolver.mutations),
        ...AuthHelper.requiresEmployee(TrainingResolver.mutations),
        ...AuthHelper.requiresEmployee(TrainingCategoryResolver.mutations),
        ...AuthHelper.requiresEmployee(TrainingModuleResolver.mutations),
        ...AuthHelper.requiresEmployee(GroupTrainingModuleResolver.mutations),
        ...AuthHelper.requiresAdmin(TrainingModuleContentResolver.mutations),
        ...AuthHelper.simplify(UserResolver.mutations),
        ...AuthHelper.requiresLogin(EmployeeResolver.mutations),
        ...AuthHelper.requiresEmployee(SubRoleResolver.mutations),
        ...AuthHelper.requiresLogin(UserProfileResolver.mutations),
        ...AuthHelper.requiresAdmin(SubscriberProfileResolver.mutations),

        ...AuthHelper.requiresLogin(QuizContentResolver.mutations),
        ...AuthHelper.requiresLogin(QuizAttemptResolver.mutations),
        
        ...AuthHelper.requiresEmployee(DesignationResolver.mutations),
        ...AuthHelper.requiresEmployee(GroupResolver.mutations),
        ...AuthHelper.requiresEmployee(GroupMemebrResolver.mutations),
        ...AuthHelper.requiresAdmin(VesselTypeResolver.mutations),
        ...AuthHelper.requiresAdmin(VesselResolver.mutations),
        ...AuthHelper.requiresLogin(ContactSupportResolver.mutations),
        ...AuthHelper.requiresAdmin(UserVesselResolver.mutations),
        ...AuthHelper.requiresAdmin(QuestionResolver.mutations),
        ...AuthHelper.requiresAdmin(LearningPlanResolver.mutations),
        ...AuthHelper.requiresAdmin(CertificateLayoutResolver.mutations),
        ...AuthHelper.requiresLogin(ContentZipResolver.mutations),
        ...AuthHelper.requiresAdmin(OverallTrainingProgressResolver.mutations),
        ...AuthHelper.requiresAdmin(CompanyResolver.mutations),
        ...AuthHelper.requiresAdmin(OwnerResolver.mutations),
    },
    Subscription: {
        ...NotificationResolver.subscriptions,
    },
};
