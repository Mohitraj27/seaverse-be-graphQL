const { Schema, Model, ObjectId } = require("../../../tools");

/**
 * Denormalized User Search Cache Collection
 * Replaces Elasticsearch for fast user searches
 * Contains all user data in a single document for quick queries
 */
const userSearchCacheSchema = new Schema(
    {
        // User Basic Info
        userId: {
            type: ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true,
        },
        employeeId: {
            type: ObjectId,
            ref: "Employee",
            index: true,
        },
        UID: {
            type: String,
            index: true,
        },
        subscriber: {
            type: ObjectId,
            ref: "Subscriber",
            index: true,
        },

        // Personal Info (Encrypted)
        firstName: {
            type: String,
            index: true,
        },
        lastName: {
            type: String,
            index: true,
        },
        email: {
            type: String,
            index: true,
        },
        civilIdOrPassport: {
            type: String,
            index: true,
        },

        // Role & Permissions
        role: {
            type: String,
            index: true,
        },
        subRoles: [ObjectId],
        superAdmin: {
            type: Boolean,
            default: false,
            index: true,
        },

        // Employee Info
        designation: String,
        empDesignation: {
            type: ObjectId,
            index: true,
        },
        regType: {
            type: Number,
            index: true,
        },
        bulkId: String,

        // Vessel Info
        currentVessel: {
            type: ObjectId,
            index: true,
        },
        vesselName: String,
        vesselId: ObjectId,
        vesselStatus: {
            type: String,
            index: true,
        },
        vesselIsActive: Boolean,
        vesselIsDeleted: Boolean,
        typeOfVesselName: String,
        tyepOfVesselId: {
            type: ObjectId,
            index: true,
        },

        // Status Flags
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        isRegistered: {
            type: Boolean,
            default: true,
            index: true,
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        isDeleted_user: {
            type: Boolean,
            default: false,
        },
        isSignupAdminAprroved: {
            type: Boolean,
            index: true,
        },
        isResetPasswordDialog: {
            type: Boolean,
            default: false,
            index: true,
        },
        deleteRequest: {
            type: Boolean,
            default: false,
        },
        directSignup: {
            type: Boolean,
            default: false,
        },

        // Preferences
        languagePreference: {
            type: String,
            default: "en",
        },
        contentlanguages: [String],
        isEmailNotification: {
            type: Boolean,
            default: true,
        },
        isPushNotification: {
            type: Boolean,
            default: true,
        },

        // Course Info
        enrolledCourses: {
            type: Number,
            default: 0,
        },
        averageCourseProgress: {
            type: Number,
            default: 0,
        },

        // Timestamps
        lastLoginAt: Date,
        userCreatedAt: Date,
        userUpdatedAt: Date,
        indexedAt: {
            type: Date,
            default: Date.now,
        },
        updatedAt: {
            type: Date,
            default: Date.now,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        collection: 'user_search_cache'
    }
);

// Text index for search functionality
userSearchCacheSchema.index({
    firstName: "text",
    lastName: "text",
    email: "text",
    civilIdOrPassport: "text",
    designation: "text",
    vesselName: "text",
    UID: "text"
});

// Compound indexes for common queries
userSearchCacheSchema.index({ isDeleted: 1, isRegistered: 1, role: 1 });
userSearchCacheSchema.index({ subscriber: 1, isDeleted: 1 });
userSearchCacheSchema.index({ currentVessel: 1, isDeleted: 1 });
userSearchCacheSchema.index({ empDesignation: 1, isDeleted: 1 });
userSearchCacheSchema.index({ vesselStatus: 1, isDeleted: 1 });
userSearchCacheSchema.index({ lastLoginAt: 1, isResetPasswordDialog: 1 });

const UserSearchCache = Model("UserSearchCache", userSearchCacheSchema);

module.exports = { UserSearchCache };
