# Elasticsearch/OpenSearch Usage Report

This document lists all files in the project that use Elasticsearch/OpenSearch.

## Summary

-   **Search Engine**: OpenSearch (AWS-managed Elasticsearch alternative)
-   **Client Library**: `@opensearch-project/opensearch` v3.5.1
-   **Index Name**: `users` (primary index)

---

## Core Files

### 1. **src/util/elastic_helper.js**

**Purpose**: Main Elasticsearch helper module with all core operations

**Exported Functions**:

-   `indexDocumenttoElasticSearch()` - Create/insert document
-   `updateDocumenttoElasticSearch()` - Update existing document
-   `deleteDocumenttoElasticSearch()` - Delete document
-   `getDocumentfromElasticSearch()` - Get document(s)
-   `deleteByQueryFromElasticSearch()` - Delete multiple documents by query
-   `updateByQueryToElasticSearch()` - Update multiple documents by query
-   `searchEmployeesFromElastic()` - Complex employee search with filters
-   `bulkIndexDocumentsToElasticSearch()` - Bulk insert documents
-   `client` - OpenSearch client instance

---

## Application Files (src/)

### User Management

#### 2. **src/app/user/user_resolver.js**

-   Updates user data in Elasticsearch when user profile changes
-   Uses: `updateByQueryToElasticSearch`, `indexDocumenttoElasticSearch`

#### 3. **src/app/user/user_helper.js**

-   User helper functions that sync with Elasticsearch
-   Uses: `updateByQueryToElasticSearch`

#### 4. **src/app/user/employee/employee_resolver.js**

-   Employee CRUD operations with Elasticsearch sync
-   Uses: `client`, `indexDocumenttoElasticSearch`, `getDocumentfromElasticSearch`, `updateByQueryToElasticSearch`, `searchEmployeesFromElastic`

#### 5. **src/app/user/employee/employee_helper.js**

-   Employee helper functions with bulk operations
-   Uses: `client`, `deleteByQueryFromElasticSearch`, `updateDocumenttoElasticSearch`, `updateByQueryToElasticSearch`, `indexDocumenttoElasticSearch`, `bulkIndexDocumentsToElasticSearch`

#### 6. **src/app/user/user-profile/user_profile_resolver.js**

-   User profile updates synced to Elasticsearch
-   Uses: `updateByQueryToElasticSearch`

#### 7. **src/app/user/user-profile/user_profile_helper.js**

-   User profile helper functions
-   Uses: `updateByQueryToElasticSearch`

#### 8. **src/app/user/user-vessel-bridge/userVessel_resolver.js**

-   Vessel assignment updates in Elasticsearch
-   Uses: `updateByQueryToElasticSearch`

### Vessel Management

#### 9. **src/app/vessle/vessel_resolver.js**

-   Vessel CRUD operations with Elasticsearch sync
-   Uses: `updateByQueryToElasticSearch`

### Training & Registration

#### 10. **src/app/training-registrations/training_registration_helper.js**

-   Training registration with course progress updates
-   Uses: `bulkUpdateDocumentsInElastic`

#### 11. **src/app/training-registrations/overall-course-progress/overall_progress_helper.js**

-   Course progress tracking in Elasticsearch
-   Uses: `bulkUpdateDocumentsInElastic`, `updateByQueryToElasticSearch`

### Reports

#### 12. **src/app/reports/reports_resolver.js**

-   Report generation using Elasticsearch search
-   Uses: `searchEmployeesFromElastic`

### Signup Requests

#### 13. **src/app/signup-request/signup-request-resolver.js**

-   Signup request management with Elasticsearch sync
-   Uses: `updateByQueryToElasticSearch`, `deleteByQueryFromElasticSearch`

### REST API

#### 14. **src/rest/user-registration-flag-api.js**

-   REST API for batch updating user registration flags
-   Direct OpenSearch client usage for bulk operations
-   Endpoints:
    -   `POST /api/users/update-registered-flag` - Batch update isRegistered flag
    -   `GET /api/users/registered-flag-stats` - Get registration statistics

---

## Root Level Files

#### 15. **app.js**

-   Main application entry point
-   Initializes Elasticsearch connection
-   Uses: `client`

#### 16. **bulkuserdelete.js**

-   Bulk user deletion utility
-   Uses: `indexDocumenttoElasticSearch`, `deleteDocumenttoElasticSearch`, `client`

---

## Scripts (scripts/)

### Sync & Migration Scripts

#### 17. **scripts/sync-opensearch-mongodb.js**

-   **Main sync script** - Bidirectional sync between MongoDB and OpenSearch
-   Features:
    -   Find missing users in either system
    -   Sync MongoDB → OpenSearch
    -   Sync OpenSearch → MongoDB
    -   Find and remove duplicates
    -   Data consistency verification
-   Command line options:
    -   `--find-duplicates` - Find duplicate entries
    -   `--remove-duplicates` - Remove duplicates (dry run)
    -   `--remove-duplicates --live` - Actually remove duplicates
    -   `--skip-opensearch` - Skip OpenSearch sync
    -   `--skip-mongodb` - Skip MongoDB sync
    -   `--skip-verify` - Skip verification

#### 18. **scripts/sync-api.js**

-   API wrapper for sync operations
-   Spawns sync-opensearch-mongodb.js as child process

#### 19. **scripts/quick-sync.js**

-   Quick sync utility with preset configurations
-   Commands:
    -   `full` - Full sync with verification
    -   `quick` - Quick sync without verification
    -   `check` - Check differences only
    -   `opensearch` - Sync to OpenSearch only
    -   `verify` - Verify consistency only

#### 20. **scripts/verify-mongodb-elastic-sync.js**

-   Verification script to check data consistency
-   Compares encrypted data between MongoDB and Elasticsearch
-   Generates detailed mismatch reports

### Data Management Scripts

#### 21. **scripts/add-fullname-to-elastic.js**

-   Adds fullName field to Elasticsearch user documents
-   Direct OpenSearch client usage

#### 22. **scripts/update-is-registered-flag.js**

-   Batch update isRegistered flag in both MongoDB and Elasticsearch
-   Supports large-scale updates (10k+ users)

#### 23. **scripts/create-user-course-count.js**

-   Generates user course count report
-   Fetches all users from Elasticsearch using scroll API
-   Direct OpenSearch client usage

### Search & Debug Scripts

#### 24. **scripts/debug-elastic-search.js**

-   Debug Elasticsearch search functionality
-   Tests various search queries and patterns

#### 25. **scripts/comprehensive-search-test.js**

-   Comprehensive search testing
-   Tests multiple search variations
-   Uses: `searchEmployeesFromElastic`

#### 26. **scripts/debug-ari-s-query.js**

-   Debug specific search query ("ari s")
-   Uses: `client`

#### 27. **scripts/debug-ari-s-issue.js**

-   Debug search issues with encrypted data
-   Direct OpenSearch client usage

#### 28. **scripts/debug-ari-s-detailed.js**

-   Detailed debugging for search functionality
-   Uses: `searchEmployeesFromElastic`

#### 29. **scripts/debug-ari-su-user.js**

-   Debug specific user search
-   Uses: `searchEmployeesFromElastic`, direct client

#### 30. **scripts/check-actual-ari-encryption.js**

-   Check encryption in Elasticsearch
-   Direct OpenSearch client usage

#### 31. **scripts/check-index-data.js**

-   Check index data structure
-   Uses: `client`

#### 32. **scripts/check-keyword-fields.js**

-   Check keyword field mappings
-   Uses: `client`

---

## Configuration Files

#### 33. **package.json**

-   Dependencies:
    -   `@opensearch-project/opensearch`: ^3.5.1
    -   `@elastic/elasticsearch`: ^9.0.2 (legacy, not actively used)

#### 34. **.env**

-   Environment variables:
    -   `OPENSEARCH_URL` - OpenSearch endpoint
    -   `OPENSEARCH_USERNAME` - Authentication username
    -   `OPENSEARCH_PASSWORD` - Authentication password

---

## Key Features & Patterns

### 1. **Data Encryption**

-   All sensitive user data (firstName, lastName, email, civilIdOrPassport) is encrypted before storing in Elasticsearch
-   Uses custom encryption helper (`src/util/encryption_helper.js`)

### 2. **Search Strategies**

The `searchEmployeesFromElastic` function implements multiple search strategies:

-   Text field searches (analyzed data)
-   Keyword field searches (exact encrypted data)
-   Prefix matching
-   Wildcard matching
-   Full name search (firstName + lastName combinations)
-   Support for filters: designation, vessel, role, registration status

### 3. **Bulk Operations**

-   Bulk indexing for performance
-   Batch processing for large datasets
-   Scroll API for fetching large result sets

### 4. **Sync Patterns**

-   Bidirectional sync between MongoDB and OpenSearch
-   Duplicate detection and removal
-   Data consistency verification
-   Orphaned record handling

### 5. **Error Handling**

-   Custom error types for Elasticsearch operations
-   Conflict resolution with `conflicts: 'proceed'`
-   Comprehensive error logging

---

## Index Structure

### Primary Index: `users`

**Key Fields**:

-   `userId` - User ID
-   `firstName` - Encrypted first name (text + keyword)
-   `lastName` - Encrypted last name (text + keyword)
-   `email` - Encrypted email (text + keyword)
-   `civilIdOrPassport` - Encrypted ID (text + keyword)
-   `designation` - User designation
-   `empDesignation` - Employee designation
-   `regType` - Registration type
-   `vesselName` - Current vessel name
-   `currentVessel` - Current vessel ID
-   `vesselStatus` - Vessel status
-   `tyepOfVesselId` - Vessel type ID
-   `isRegistered` - Registration flag
-   `isResetPasswordDialog` - Password reset flag
-   `isDeleted` - Deletion flag
-   `isSignupAdminAprroved` - Admin approval flag
-   `role` - User role
-   `subRoles` - Sub-roles array
-   `lastLoginAt` - Last login timestamp
-   `updatedAt` - Last update timestamp

---

## Total Files Using Elasticsearch: 34

**Breakdown**:

-   Core utility: 1
-   Application files: 13
-   Root level: 2
-   Scripts: 16
-   Configuration: 2
