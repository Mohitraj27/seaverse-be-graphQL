// Product Release Version Configuration
// Update this file for each release following semantic versioning
// Major.Minor.Patch (e.g., 1.0.0, 1.0.1, 1.1.0, 2.0.0)

module.exports = {
    RELEASE_VERSION: '1.0.0',
    BUILD_DATE: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
    APP_NAME: 'SeaVerse LMS',
    DESCRIPTION: 'Learning Management System for Maritime Training',

    // Version history for reference
    VERSION_HISTORY: [
        {
            version: '1.0.0',
            title: 'Initial Release',
            date: '2024-10-24',
            description: 'First stable release of SeaVerse LMS with core features including user management, training modules, and certification tracking.',
            type: 'major'
        }
    ]
};