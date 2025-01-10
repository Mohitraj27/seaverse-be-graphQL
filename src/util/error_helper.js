const { messaging } = require("firebase-admin");

const errorName = {
    BAD_REQUEST: "BAD_REQUEST",
    UNAUTHORIZED: "UNAUTHORIZED",
    FORBIDDEN: "FORBIDDEN",
    NOT_FOUND: "NOT_FOUND",
    FAILED: "FAILED",
    SEND_FAILED: "SEND_FAILED",
    SOME_ERROR: "SOME_ERROR",
    NO_CHANGES: "NO_CHANGES",
    ALREADY_EXIST: "ALREADY_EXIST",
    USER_ALREADY_EXIST: "USER_ALREADY_EXIST",
    FIELD_REQUIRED: "FIELD_REQUIRED",
    ARGUMENTS_REQUIRED: "ARGUMENTS_REQUIRED",
    INVALID: "INVALID",
    OTP_ERROR: "OTP_ERROR",
    WRONG_PASSWORD: "WRONG_PASSWORD",
    UPLOAD_FAILED: "UPLOAD_FAILED",
    INVALID_FILE: "INVALID_FILE",
    UNSUPPORTED_FILE: "UNSUPPORTED_FILE",
    EXTERNAL_API_ERROR: "EXTERNAL_API_ERROR",
    INVALID_PASSWORD: "INVALID_PASSWORD",
    SUBSCRIPTION_EXPIRED: "SUBSCRIPTION_EXPIRED",
    SERVER_ERROR: "SERVER_ERROR",
    ORGANIZATION_MISMATCH_ERROR: "ORGANIZATION_MISMATCH_ERROR",
    INVALID_DESIGNATION: "INVALID_DESIGNATION",
    BULK_USER_FILE_UPLOAD: "BULK_USER_FILE_UPLOAD",
    INVALID_MANAGER_OBJECTID: "INVALID_MANAGER_OBJECTID",
    VALIDATION_ERROR: "VALIDATION_ERROR",
    DUPLICATE_EMAIL: "DUPLICATE_EMAIL",
    DUPLICATE_COURSE_ID: "DUPLICATE_COURSE_ID",
    INVALID_COURSE_ID: "INVALID_COURSE_ID",
    INVALID_COURSE_TYPE: "INVALID_COURSE_TYPE",
    ERROR_FETCHING_CONTENT: "ERROR_FETCHING_CONTENT",
    CONTENT_NOT_FOUND: "CONTENT_NOT_FOUND",
    CONTENT_ALREADY_EXIST: "CONTENT_ALREADY_EXIST",
    DUPLICATE_TARGET_AUDIENCE_OBJECT_ID: "DUPLICATE_TARGET_AUDIENCE_OBJECT_ID",
    INVALID_TARGET_AUDIENCE_ID: "INVALID_TARGET_AUDIENCE_ID",
    INVALID_SKILLS_FORMAT: "INVALID_SKILLS_FORMAT",
    INVALID_DURATION_FORMAT: "INVALID_DURATION_FORMAT",
    ASSIGNTYPE_ERROR: "ASSIGNTYPE_ERROR",
    REMOVETYPE_ERROR: "REMOVETYPE_ERROR",
    ERROR_IN_EXPORT_CSV_USER_GROUP: "ERROR_IN_EXPORT_CSV_USER_GROUP",
    ERROR_IN_MANAGER_USER_CSV: "ERROR_IN_MANAGER_USER_CSV,",
    EMPLOYEE_ALREADY_REGISTERED: "EMPLOYEE_ALREADY_REGISTERED",
    EMPLOYEE_ALREADY_UNREGISTERED: "EMPLOYEE_ALREADY_UNREGISTERED",
    ROLE_ALREADY_ASSIGNED: "ROLE_ALREADY_ASSIGNED",
    MANAGER_EMAIL_NOT_FOUND: "MANAGER_EMAIL_NOT_FOUND",
    INVALID_ROLE_IN_CSV_FILE: "INVALID_ROLE_IN_CSV_FILE",
    ERROR_ADDING_TO_DELETE_COLLECTION: "ERROR_ADDING_TO_DELETE_COLLECTION",
    INVALID_DESIGNATION_IN_CSV_FILE: "INVALID_DESIGNATION_IN_CSV_FILE",
    NO_REFRESH_TOKEN: "NO_REFRESH_TOKEN",
    USER_NOT_FOUND: "USER_NOT_FOUND",
    PROVIDE_PASSWORDS: "PROVIDE_PASSWORDS",
    EXPIRED_TOKEN: "EXPIRED_TOKEN",
    INVALID_TOKEN: "INVALID_TOKEN",
    PASSWORD_MISMATCH: "PASSWORD_MISMATCH",
    PASSWORD_TOO_SHORT: "PASSWORD_TOO_SHORT",
    PASSWORD_NOT_ALPHANUMERIC: "PASSWORD_NOT_ALPHANUMERIC",
    ERROR_DELETING_GROUP: "ERROR_DELETING_GROUP",
    ERROR_DELETING_USER: "ERROR_DELETING_USER",
    ERROR_REJECTING_USER_REQUEST: "ERROR_REJECTING_USER_REQUEST",
    GROUP_TYPE_NOT_FOUND: "GROUP_TYPE_NOT_FOUND",
    ALREADY_IN_USE: "ALREADY_IN_USE",
    REASON_FOR_DELETE_NOT_FOUND: "REASON_FOR_DELETE_NOT_FOUND",
    VESSEL_NOT_FOUND: "VESSEL_NOT_FOUND",
    INVALID_FILE_FORMAT: "INVALID_FILE_FORMAT",
    NOT_ALL_PUBLISHED: "NOT_ALL_PUBLISHED",
    INVALID_PERCENTAGE_CRITERIA: "INVALID_PERCENTAGE_CRITERIA",
    ALREADY_DELETED: "ALREADY_DELETED",
    GROUP_NOT_FOUND: "GROUP_NOT_FOUND",
    INVALID_GROUP_ID: "INVALID_GROUP_ID",
    LEARNING_PLAN_ALREADY_EXISTS: "LEARNING_PLAN_ALREADY_EXISTS",
    LEARNING_PLAN_NOT_CREATED: "LEARNING_PLAN_NOT_CREATED",
    EMPLOYEE_NOT_REGISTERED: "EMPLOYEE_NOT_REGISTERED",
    INVALID_EMAIL: "INVALID_EMAIL",
    INVALID_LEARNING_PLAN_STATUS_UPDATE:"INVALID_LEARNING_PLAN_STATUS_UPDATE",
    INVALID_LEARNING_PLAN:"INVALID_LEARNING_PLAN",
    LEARNING_PLAN_NOT_FOUND:"LEARNING_PLAN_NOT_FOUND",
    MIGRATION_COURSES_NOT_FOUND:"MIGRATION_COURSES_NOT_FOUND",
    OVERALLTRAININGPROGRESSES_NOT_REGISTERED:"OVERALLTRAININGPROGRESSES_NOT_REGISTERED",
    CREATE_OR_UPDATE_TRAINING_MODULE:"CREATE_OR_UPDATE_TRAINING_MODULE",
    COURSE_TITLE_ALREADY_EXIST:"COURSE_TITLE_ALREADY_EXIST",
    NOTIFICATION_FAILED_TO_MARK_AS_READ:"NOTIFICATION_FAILED_TO_MARK_AS_READ",
    GET_NOTIFICATION_FAILED:"GET_NOTIFICATION_FAILED",
    MISSING_MANDATORY_FIELDS_FOR_EXPORT_USERS:"MISSING_MANDATORY_FIELDS_FOR_EXPORT_USERS",
    FAILED_TO_FETCH_EMPLOYESS: "FAILED_TO_FETCH_EMPLOYESS",
};

const errorType = {
    BAD_REQUEST: {
        message: "Bad Request",
        statusCode: 400,
        type: "BAD_REQUEST",
    },
    UNAUTHORIZED: {
        message: "Unauthorized",
        statusCode: 401,
        type: "UNAUTHORIZED",
    },
    FORBIDDEN: {
        message: "Forbidden",
        statusCode: 403,
        type: "FORBIDDEN",
    },
    NOT_FOUND: {
        message: "Not Found",
        statusCode: 404,
        type: "NOT_FOUND",
    },
    FAILED: {
        message: "Failed",
        statusCode: 400,
        type: "FAILED",
    },
    SEND_FAILED: {
        message: "Couldn't Send Otp",
        statusCode: 400,
        type: "SEND_FAILED",
    },
    SOME_ERROR: {
        message: "Some error occurred",
        statusCode: 500,
        type: "SOME_ERROR",
    },
    NO_CHANGES: {
        message: "Nothing to update",
        statusCode: 400,
        type: "NO_CHANGES",
    },
    ALREADY_EXIST: {
        message: "Already exist",
        statusCode: 400,
        type: "ALREADY_EXIST",
    },
    USER_ALREADY_EXIST: {
        message: "User already exist",
        statusCode: 400,
        type: "USER_ALREADY_EXIST",
    },
    FIELD_REQUIRED: {
        message: "Please Input Required Fields",
        statusCode: 400,
        type: "FIELD_REQUIRED",
    },
    ARGUMENTS_REQUIRED: {
        message: "Required Arguments Missing",
        statusCode: 400,
        Type: "ARGUMENTS_REQUIRED",
    },
    INVALID: {
        message: "Invalid Entry",
        statusCode: 400,
        Type: "INVALID",
    },
    OTP_ERROR: {
        message: "Otp Expired Or Invalid",
        statusCode: 400,
        Type: "OTP_ERROR",
    },
    WRONG_PASSWORD: {
        message: "Wrong Password",
        statusCode: 400,
        Type: "WRONG_PASSWORD",
    },
    UPLOAD_FAILED: {
        message: "Upload Failed",
        statusCode: 400,
        Type: "UPLOAD_FAILED",
    },
    INVALID_FILE: {
        message: "Invalid File",
        statusCode: 400,
        Type: "INVALID_FILE",
    },
    UNSUPPORTED_FILE: {
        message: "Unsupported file format",
        statusCode: 400,
        Type: "UNSUPPORTED_FILE",
    },
    EXTERNAL_API_ERROR: {
        message: "Bad Request to External API",
        statusCode: 400,
        type: "EXTERNAL_API_ERROR",
    },
    MAX_ORDER_REACHED: {
        message: "Maximum Order Per Day Reached For The Item",
        statusCode: 400,
        type: "MAX_ORDER_REACHED",
    },
    INVALID_PASSWORD: {
        message: "Password must be 6-15 characters long.",
        statusCode: 400,
        type: "INVALID_PASSWORD",
    },
    SUBSCRIPTION_EXPIRED: {
        message: "Your subscription expired",
        statusCode: 400,
        type: "SUBSCRIPTION_EXPIRED",
    },
    SERVER_ERROR: {
        message: "Server error occurred",
        statusCode: 500,
        type: "SERVER_ERROR",
    },
    ORGANIZATION_MISMATCH_ERROR: {
        message: "Provided organization is different from employee organization",
        statusCode: 500,
        type: "ORGANIZATION_MISMATCH_ERROR",
    },
    INVALID_DESIGNATION: {
        message: "Invalid Designation Id",
        statusCode: 400,
        type: "INVALID_DESIGNATION",
    },
    BULK_USER_FILE_UPLOAD: {
        messgae: "File upload is required for bulk user registration.",
        statusCode: 400,
        type: "BULK_USER_FILE_UPLOAD",
    },
    INVALID_MANAGER_OBJECTID: {
        message: "Invalid Manager ObjectId",
        statusCode: 400,
        type: "INVALID_MANAGER_OBJECTID",
    },
    VALIDATION_ERROR: {
        message: "Validation Error",
        statusCode: 400,
        type: "VALIDATION_ERROR",
    },
    DUPLICATE_EMAIL: {
        message: "Duplicate email found in the file",
        statusCode: 400,
        type: "DUPLICATE_EMAIL",
    },
    DUPLICATE_COURSE_ID: {
        message: "Duplicate Course Id found",
        statusCode: 400,
        type: "DUPLICATE_EMAIL",
    },
    INVALID_COURSE_ID: {
        message: "Invalid Course Id format",
        statusCode: 400,
        type: "INVALID_COURSE_ID",
    },
    INVALID_COURSE_TYPE: {
        message: "Please select a valid CourseType",
        statusCode: 400,
        type: "INVALID_COURSE_TYPE",
    },
    ERROR_FETCHING_CONTENT: {
        message: "Error in fetching the Content",
        statusCode: 400,
        type: "ERROR_FETCHING_CONTENT",
    },
    CONTENT_NOT_FOUND: {
        message: "Content Not Found",
        statusCode: 404,
        type: "CONTENT_NOT_FOUND",
    },
    CONTENT_ALREADY_EXIST: {
        message: "Content Already Exist",
        statusCode: 400,
        type: "CONTENT_ALREADY_EXIST",
    },
    DUPLICATE_TARGET_AUDIENCE_OBJECT_ID: {
        message: "Duplicate Object Id Found for Target Audience",
        statusCode: 400,
        type: "DUPLICATE_TARGET_AUDIENCE_OBJECT_ID",
    },
    INVALID_TARGET_AUDIENCE_ID: {
        message: "Target Audience  Not Found",
        statusCode: 404,
        type: "INVALID_TARGET_AUDIENCE_ID",
    },
    INVALID_SKILLS_FORMAT: {
        message: "Skills must be in Array Format",
        statusCode: 400,
        type: "INVALID_SKILLS_FORMAT",
    },
    INVALID_DURATION_FORMAT: {
        message: "Duration format must be HH:MM:SS",
        statusCode: 400,
        type: "INVALID_DURATION_FORMAT",
    },
    ASSIGNTYPE_ERROR: {
        message: "Please provide assign type",
        statusCode: 400,
        type: "ASSIGNTYPE_ERROR",
    },
    REMOVETYPE_ERROR: {
        message: "Please provide remove type",
        statusCode: 400,
        type: "REMOVETYPE_ERROR",
    },
    ERROR_IN_EXPORT_CSV_USER_GROUP: {
        message: "Error in Downloading in CSV Group",
        statusCode: 400,
        type: "ERROR_IN_EXPORT_CSV_USER_GROUP",
    },
    ERROR_IN_MANAGER_USER_CSV: {
        message: "Invalid manager found in CSV group",
        statusCode: 400,
        type: "ERROR_IN_MANAGER_USER_CSV",
    },
    EMPLOYEE_ALREADY_REGISTERED: {
        message: "Employee Already Registered",
        statusCode: 400,
        type: "EMPLOYEE_ALREADY_REGISTERED",
    },
    EMPLOYEE_ALREADY_UNREGISTERED: {
        message: "Employee Already UnRegistered",
        statusCode: 400,
        type: "EMPLOYEE_ALREADY_UNREGISTERED",
    },
    ROLE_ALREADY_ASSIGNED: {
        message: "Role Already Assigned",
        statusCode: 400,
        type: "ROLE_ALREADY_ASSIGNED",
    },
    MANAGER_EMAIL_NOT_FOUND: {
        message: "Manager Email Not Found",
        statusCode: 400,
        type: "MANAGER_EMAIL_NOT_FOUND",
    },
    INVALID_ROLE_IN_CSV_FILE: {
        message: "Invalid Role In CSV File",
        statusCode: 400,
        type: "INVALID_ROLE_IN_CSV_FILE",
    },
    ERROR_ADDING_TO_DELETE_COLLECTION: {
        message: "Error Adding To Delete Collection",
        statusCode: 400,
        type: "ERROR_ADDING_TO_DELETE_COLLECTION"
    },
    INVALID_DESIGNATION_IN_CSV_FILE: {
        message: "Invalid Designation In CSV File",
        statusCode: 400,
        type: "INVALID_DESIGNATION_IN_CSV_FILE"
    },
    NO_REFRESH_TOKEN: {
        message: "No Refresh Token",
        statusCode: 400,
        type: "NO_REFRESH_TOKEN"
    },
    USER_NOT_FOUND: {
        message: "User Not Found",
        statusCode: 400,
        type: "USER_NOT_FOUND"
    },
    PROVIDE_PASSWORDS: {
        message: "Please enter Passwords",
        statusCode: 400,
        type: "PROVIDE_PASSWORDS"
    },
    EXPIRED_TOKEN: {
        message: "Token has expired!",
        statusCode: 400,
        type: "EXPIRED_TOKEN"
    },
    INVALID_TOKEN: {
        message: "Invalid Token",
        statusCode: 400,
        type: "INVALID_TOKEN"
    },
    PASSWORD_MISMATCH: {
        message: "Password Mismatch",
        statusCode: 400,
        type: "PASSWORD_MISMATCH"
    },
    PASSWORD_NOT_ALPHANUMERIC: {
        message: "Password must be alphanumeric",
        statusCode: 400,
        type: "PASSWORD_NOT_ALPHANUMERIC"
    },
    PASSWORD_TOO_SHORT: {
        message: "Password To short",
        statusCode: 400,
        type: "PASSWORD_TOO_SHORT"
    },
    ERROR_DELETING_GROUP: {
        message: "Error Deleting Group",
        statusCode: 400,
        type: "ERROR_DELETING_GROUP"
    },
    ERROR_DELETING_USER: {
        message: "Error Deleting User",
        statusCode: 400,
        type: "ERROR_DELETING_USER"
    },
    ERROR_REJECTING_USER_REQUEST: {
        message: "Error Rejecting User Request",
        statusCode: 400,
        type: "ERROR_REJECTING_USER_REQUEST"
    },
    GROUP_TYPE_NOT_FOUND: {
        message: "Group Type Not Found",
        statusCode: 400,
        type: "GROUP_TYPE_NOT_FOUND"
    },
    ALREADY_IN_USE: {
        message: "Already in use",
        statusCode: 400,
        type: "ALREADY_IN_USE"
    },
    REASON_FOR_DELETE_NOT_FOUND: {
        message: "Reason for Delete is missing",
        statusCode: 404,
        type: "REASON_FOR_DELETE_NOT_FOUND"
    },
    VESSEL_NOT_FOUND: {
        message: "Vessel Not Found",
        statusCode: 400,
        type: "VESSEL_NOT_FOUND"
    },
    INVALID_FILE_FORMAT: {
        message: "Invalid File Format",
        statusCode: 400,
        type: "INVALID_FILE_FORMAT"
    },
    NOT_ALL_PUBLISHED: {
        message: "All the selected contents are not published",
        statusCode: 400,
        type: "NOT_ALL_PUBLISHED"
    },
    INVALID_PERCENTAGE_CRITERIA: {
        message: "Percentage criteria should be less than the total score",
        statusCode: 400,
        type: "INVALID_PERCENTAGE_CRITERIA"
    },
    ALREADY_DELETED: {
        message: 'Already Deleted',
        statusCode: 400,
        type: "ALREADY_DELETED"
    },
    GROUP_NOT_FOUND: {
        message: 'Group Not Found',
        status: 400,
        type: "GROUP_NOT_FOUND"
    },
    INVALID_GROUP_ID: {
        message: 'Invalid Group Id',
        status: 400,
        type: "INVALID_GROUP_ID"
    },
    LEARNING_PLAN_ALREADY_EXISTS: {
        message: 'Learning Plan with this title already exists',
        status: 400,
        type: "LEARNING_PLAN_ALREADY_EXISTS"
    },
    LEARNING_PLAN_NOT_CREATED:{
        message: 'Learning Plan Not Created',
        status: 400,    
        type: "LEARNING_PLAN_NOT_CREATED"
    },
    EMPLOYEE_NOT_REGISTERED: {
        message: "Employee Not Registered",
        statusCode: 400,
        type: "EMPLOYEE_NOT_REGISTERED"
    },
    INVALID_EMAIL: {
        message: "Invalid Email",
        statusCode: 400,
        type: "INVALID_EMAIL"
    },
    INVALID_LEARNING_PLAN_STATUS_UPDATE: {
        message: "Learning Plan Status Update Cannot be DRAFT",
        statusCode: 400,
        type: "INVALID_LEARNING_PLAN_STATUS_UPDATE"
    },
    INVALID_LEARNING_PLAN: {
        message: "Invalid Learning Plan Provided",
        statusCode: 400,
        type: "INVALID_LEARNING_PLAN"
    },
    LEARNING_PLAN_NOT_FOUND: {
        message: "Learning Plan Not Found",
        statusCode: 400,
        type: "LEARNING_PLAN_NOT_FOUND"
    },
    MIGRATION_COURSES_NOT_FOUND:{
        message:"Migration Courses Not found",
        statusCode:400,
        type:"MIGRATION_COURSES_NOT_FOUND"
    },
    OVERALLTRAININGPROGRESSES_NOT_REGISTERED:{
        message:"Overalltrainingprogresses Not Registered",
        statusCode:400,
        type:"OVERALLTRAININGPROGRESSES_NOT_REGISTERED"
    },
    CREATE_OR_UPDATE_TRAINING_MODULE: {
        message: 'Error in Creating or Updating Training Module',
        statusCode: 400,
        type: "CREATE_OR_UPDATE_TRAINING_MODULE"
    },
    COURSE_TITLE_ALREADY_EXIST: {
        message: 'Course Title already exists',
        statusCode: 400,
        type: "COURSE_TITLE_ALREADY_EXIST"
    },
    NOTIFICATION_FAILED_TO_MARK_AS_READ:{
        message: 'Failed to mark notifications as read.',
        statusCode: 400,
        type: "NOTIFICATION_FAILED_TO_MARK_AS_READ"
    },
    GET_NOTIFICATION_FAILED:{
        message: 'Get Notification Failed',
        statusCode: 400,
        type: "GET_NOTIFICATION_FAILED"
    },
    MISSING_MANDATORY_FIELDS_FOR_EXPORT_USERS:{
        message: 'Missing mandatory fields for export',
        statusCode: 400,
        type: "MISSING_MANDATORY_FIELDS_FOR_EXPORT_USERS",
    },
    FAILED_TO_FETCH_EMPLOYESS: {
        message: "Failed to fetch employees",
        statusCode: 400,
        type: "FAILED_TO_FETCH_EMPLOYESS",
    },
};

const formatError = error => {
 
    let errorObject;
    try {
        errorObject = JSON.parse(error.message);

        if (errorObject.extra) {
            errorObject = {
                ...errorType[errorObject.error],
                extra: errorObject.extra,
            };
        }
    } catch (e) { }

    if (!errorObject) {
        errorObject = errorType[error.message];
    }

    return {
        message: errorObject?.message ?? "An error occurred",
        statusCode: errorObject?.statusCode ?? 500,
        type: errorObject?.type ?? errorName.SOME_ERROR,
        extra: errorObject?.extra ?? [],
    };
};

const customError = (error, extra) => {
    console.log({ error, extra });
    if (typeof error === "object" || extra?.length) {
        return new Error(JSON.stringify({ error, extra }));
    } else {
        return new Error(error);
    }
};

module.exports = {
    CustomError: customError,
    ErrorName: errorName,
    FormatError: formatError,
};
