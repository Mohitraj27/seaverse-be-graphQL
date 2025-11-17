const { Schema, Model, ObjectId, AggregatePaginate } = require("../../tools");
const { type } = require("../../util/firebaseConfig");

const StringNormalize = require("../../util/string_helper").stringNormalize;
const Language = require("../../util/language.json");

const userSchema = new Schema(
    {
        UID: String,
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
        },
        firstName: {
            type: String,
            trim: true,
            set: StringNormalize,
        },
        lastName: {
            type: String,
            trim: true,
            set: StringNormalize,
        },
        civilIdOrPassport: {
            type: String,
            trim: true,
            index: { unique: true, sparse: true },
        },
        email: {
            type: String,
            trim: true,
            index: { unique: true, sparse: true },
        },
        companyEmail: {
            type: String,
            trim: true,
        },
        phone: {
            type: {
                countryCode: {
                    type: String,
                    required: true,
                },
                number: {
                    type: String,
                    required: true,
                },
            },
            index: true,
        },
        avatar: String,
        password: {
            type: String,
        },
        dummyPassword: {
            type: String,
            default: null,
        },
        role: {
            type: String,
            default: 'LEARNER',
            uppercase: true,
            required: true,
            index: true,
        },
        subRoles: [
            {
                type: ObjectId,
                ref: "SubRole",
            },
        ],
        firebaseTokens: [String],
        deviceIds: [String],
        languagePreference: {
            type: String,
            lowercase: true,
            default: Language.en,
        },
        lastLoginAt: {
            type: Date,
            default: Date.now,
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isRegistered: {
            type: Boolean,
            default: true,
        },
        lastUnregisteredAt: {
            type: Date,
            default: null,
        },
        isProfileCompleted: {
            type: Boolean,
            default: false,
        },
        isOrganizationManager: {
            type: Boolean,
            default: false,
        },
        managingOrganization: {
            type: ObjectId,
            ref: "Organization",
        },
        superAdmin: {
            type: Boolean,
            default: false,
        },
        createdBy: {
            type: ObjectId,
            ref: "User",
        },
        updatedBy: {
            type: ObjectId,
            ref: "User",
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        resetPasswordToken: {
            type: String,
        },
        resetPasswordExpires: {
            type: Date,
        },
        deleteRequest: {
            type: Boolean,
            default: false
        },
        deleteRequestDate: {
            type: Date
        },
        isResetPasswordDialog: {
            type: Boolean,
            default: false,
        },
        reasonForDelete: {
            type: String
        },
        currentVessel: {
            type: ObjectId,
            ref: "Vessel",
            default: null,
        },
        vesselStatus: {
            type: String,
            default: null,
        },
        directSignup: {
            type: Boolean,
            default: false
        },
        isSignupAdminAprroved: {
            type: Boolean
        },
        roleAssignmentDate: {
            type: Date
        },
        contentlanguages: {
            type: [String],
            default: ["english"]
        },
        consents: [
            {
                consentType: { type: String },
                message: { type: String },
                title: { type: String },
                status: { type: Boolean },
                timestamps: { type: Date, default: Date.now }
            }
        ],
        // country: {
        //     type: String,
        // },
        isEmailNotification: {
            type: Boolean,
            default: true
        },
        isPushNotification: {
            type: Boolean,
            default: true
        },
        deletionDate: {
            type: Date,
            default: null
        },
        recentlyAddedDummyPass: {
            type: Boolean,
            default: false
        },
    },
    { timestamps: true }
);

userSchema.virtual("address", {
    ref: "UserAddress",
    localField: "_id",
    foreignField: "user",
    justOne: true,
});

userSchema.virtual("employee", {
    ref: "Employee",
    localField: "_id",
    foreignField: "user",
    justOne: true,
});

userSchema.index({ email: "text" });

userSchema.index({ _id: 1, role: 1, currentVessel: 1 });
userSchema.index({ isDeleted: 1, role: 1, vesselStatus: 1, lastLoginAt: 1 });
userSchema.index({
    "firstName": "text",
    "lastName": "text",
    "email": "text",
    "civilIdOrPassport": "text"
});
userSchema.plugin(AggregatePaginate);

const deletedUserSchema = userSchema.clone();
deletedUserSchema.path('civilIdOrPassport').index(false);
deletedUserSchema.path('email').index(false);

// For app signup
const appUserSchema = userSchema.clone();

const User = Model("User", userSchema);
const DeletedUser = Model("DeletedUser", deletedUserSchema);
const AppUser = Model("AppUser", appUserSchema);

module.exports = {
    User,
    DeletedUser,
    AppUser,
};
