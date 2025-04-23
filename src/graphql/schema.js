const { GqlHelper } = require("../tools");
const { Language } = require("../util");

const { AppDataSchema } = require("../app/app-data");
const { AppSettingsSchema } = require("../app/app-settings");
const { BatchSchema } = require("../app/batches");
const { BranchSchema } = require("../app/branches");
const { LogSchema } = require("../app/logs");
const { OrganizationSchema } = require("../app/organizations");
const { TrainingValiditySchema } = require("../app/organizations/training-validity");
const { SaasPaymentSchema } = require("../app/saas/saas-payment");
const { SaasSubscriberSchema } = require("../app/saas/subscriber");
const { SaasSubscriptionSchema } = require("../app/saas/subscriber/subscription");
const { SaasSubscriptionPlanSchema } = require("../app/saas/subscription-plans");
const { StatisticsSchema } = require("../app/statistics");
const { TrainingRegistrationSchema } = require("../app/training-registrations");
const {
    TrainingRegistrationInvoiceSchema,
} = require("../app/training-registrations/training-registration-invoices");
const { TrainingSchema } = require("../app/trainings");
const { TrainingCategorySchema } = require("../app/trainings/training_categories");
const { TrainingModuleSchema } = require("../app/trainings/training_modules");
const { GroupTrainingModuleSchema } = require("../app/trainings/training_modules/group_training_module");
const {
    TrainingModuleContentSchema,
} = require("../app/trainings/training_modules/training_module_contents");
const { TrainingAttendanceSchema } = require("../app/training-registrations/training-attendance");
const {
    TrainingCertificateSchema,
} = require("../app/training-registrations/training-certificates");
const { UserSchema } = require("../app/user");
const { EmployeeSchema } = require("../app/user/employee");
const { TrainingProgressSchema } = require("../app/training-registrations/training-progress");
const { SubRoleSchema } = require("../app/user/sub-roles");
const { UserAddressSchema } = require("../app/user/user-addresses");
const { UserProfileSchema } = require("../app/user/user-profile");
const { NotificationSchema } = require("../app/notifications");
const { ReportSchema } = require("../app/reports");
const {
    TrainingSubCategorySchema,
} = require("../app/trainings/training_categories/training_sub_categories");
const { SubscriberProfileSchema } = require("../app/user/subscriber-profile");

const { FeedbackContentSchema } = require("../app/feedbacks");
const { QuizContentSchema } = require("../app/quizzes");
const { QuizAttemptSchema } = require("../app/quizzes/quiz-attempts");

const { DesignationSchema } = require("../app/designations");
const { GroupSchema, GroupMemberSchema } = require("../app/user/group-user");
const { VesselTypeSchema } = require("../app/vessle/vessel-type");
const { VesselSchema } = require("../app/vessle");
const { ContactSupportSchema } = require('../app/contact-support');
const { UserVesselSchema } = require('../app/user/user-vessel-bridge');
const { QuestionSchema } = require('../app/trainings/training_modules/training_module_contents/question');
const { LearningPlanSchema } = require("../app/learning-plan");
const { CertificateLayoutSchema } = require("../app/trainings/certificate_layout/index");
const { ContentZipSchema } = require("../app/trainings/compress_to_zip");
const { CompanySchema } = require("../app/vessle/company");
const { OwnerSchema } = require("../app/vessle/owner");
const { migrationcoursesSchema } = require("../app/trainings/migrationcourses");
const { SignupRequestSchema } = require("../app/signup-request");
const { SignupRequestHistorySchema } = require("../app/signup-request-history");
const { contentLanguagesSchema} = require("../app/trainings/training_modules/training_module_contents/content_languages");
const schemas = [
    AppDataSchema,
    AppSettingsSchema,
    BatchSchema,
    BranchSchema,
    LogSchema,
    OrganizationSchema,
    TrainingValiditySchema,
    SaasPaymentSchema,
    SaasSubscriberSchema,
    SaasSubscriptionSchema,
    SaasSubscriptionPlanSchema,
    TrainingRegistrationSchema,
    TrainingRegistrationInvoiceSchema,
    TrainingSchema,
    TrainingCategorySchema,
    TrainingModuleSchema,
    GroupTrainingModuleSchema,
    TrainingModuleContentSchema,
    UserSchema,
    EmployeeSchema,
    TrainingProgressSchema,
    TrainingAttendanceSchema,
    TrainingCertificateSchema,
    SubRoleSchema,
    StatisticsSchema,
    UserAddressSchema,
    UserProfileSchema,
    NotificationSchema,
    ReportSchema,
    TrainingSubCategorySchema,
    SubscriberProfileSchema,

    FeedbackContentSchema,
    QuizContentSchema,
    QuizAttemptSchema,

    DesignationSchema,
    GroupSchema,
    GroupMemberSchema,
    VesselTypeSchema,
    VesselSchema,
    ContactSupportSchema,
    UserVesselSchema,
    QuestionSchema,
    LearningPlanSchema,
    CertificateLayoutSchema,
    ContentZipSchema,
    CompanySchema,
    OwnerSchema,
    migrationcoursesSchema,
    SignupRequestSchema,
    SignupRequestHistorySchema,
    contentLanguagesSchema
];

const types = [];
const queries = [];
const mutations = [];
const subscriptions = [];

schemas.forEach(schema => {
    if (schema.types) types.push(schema.types);
    if (schema.queries) queries.push(schema.queries);
    if (schema.mutations) mutations.push(schema.mutations);
    if (schema.subscriptions) subscriptions.push(schema.subscriptions);
});

module.exports = GqlHelper(`
    scalar JSON
    scalar Upload
    enum SortType {
        ASCENDING
        DESCENDING
    }
    enum Language {
        ${Object.keys(Language).join(" ")}
    }
    type LocalisedData {
        lang: String
        value: String
    }
    type MultiMediaInfo {
        _id: ID
        lang: String
        url: String
        s3Path: String
        isDefault: Boolean
        duration: String
        isShowSubtitle: Boolean
        subtitles: [MultiMediaInfo]
    }
    input LocalisedDataInput {
        lang: String
        value: String
    }
    input MultiMediaInfoInput {
        _id: ID
        lang: Language
        url: Upload 
        isDefault: Boolean
        duration: String
    }
    input PageInput {
        skip: Int
        limit: Int
    }
    ${types.join("\n")}
    type Query {
        ${queries.join("\n")}
    }
    type Mutation {
        ${mutations.join("\n")}
    }
    type Subscription {
        ${subscriptions.join("\n")}
    }
`);
