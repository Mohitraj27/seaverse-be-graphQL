// src/constants/queues.js
const QUEUE_NAMES = {
    COURSE_ENROLLMENT: 'courseEnrollment',
    CSV_IMPORT: 'csvImport',
    NOTIFICATION: 'notification',
};

const JOB_NAMES = {
    CREATE_ENROLL: 'createLearnerEnroll',
    UPDATE_ENROLL: 'updateLearnerEnroll',
    IMPORT_CSV: 'importCsv',
    NOTIFY_USER: 'notifyUser',
};

module.exports = {
    QUEUE_NAMES,
    JOB_NAMES,
};
  