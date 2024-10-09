const { Schema, Model, ObjectId, AggregatePaginate } = require("../../tools");

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
            required: true,
        },
        role: {
            type: String,
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
            default: false,
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

userSchema.index({ _id: 1, role: 1 });

userSchema.plugin(AggregatePaginate);

const User = Model("User", userSchema);
const DeletedUser = Model("DeletedUser", userSchema, "DeletedUser");

module.exports = {
    User,
    DeletedUser
};