# sea_verse-api-demo

# node: v16.15.0

# npm: v8.5.5

# qwerty =>

# ////urls////
api-stage: 
admin-stage: 
user-stage: 

# ////credentials////
admin => 
user => 

# ////deployment////
#!/bin/bash
sudo /opt/bitnami/ctlscript.sh stop apache
sudo mv /etc/monit/conf.d/apache.conf /etc/monit/conf.d/apache.conf.disabled
sudo mv /opt/bitnami/apache2/scripts/ctl.sh /opt/bitnami/apache2/scripts/ctl.sh.disabled
sudo npm install pm2@latest -g
********************
sudo setcap 'cap_net_bind_service=+ep' `which node` &&
sudo pm2 startup ubuntu &&
DIR="sea_verse_demo_stage_8094" &&
git clone -b demo git_url $DIR &&
cd $DIR &&
npm install &&
sudo pm2 start npm --time --exp-backoff-restart-delay=100 --name $DIR -- run stage -i max &&
sudo pm2 save

# coding style
1. space after colon(:), before brace open ({) in schema
2. PascalCase - type, input, enum
3. camelCase - field, query, mutation, subscription
4. Input suffix for input type
5. follow enum, type, input order while writing schema

# cloned items

subscription schema - subscription plan details
trainingCertificate schema - organization name, training name, trainer name, employee name, civil id
trainingRegistrationInvoice schema - organization details, training name, bank details, currency

trainingRegistration schema - sortedTrainingModules
trainingProgress schema - trainingModuleContentData

# new hosting file update

.env - mongo, secret, region, bucket, files, domain, subscriber
.gitlab-ci.yml - branch
package.json - name
README.md - api, admin, employee

# org login - filtering

**query**
getNotifications, getOrganizations,
getQuizReports, getFeedbackReports, getTrainingMatrixReports, getTrainingRegistrations,
getTrainingRegistrationAttendances, getTrainingCertificates,
getEmployeeProfiles, getEmployees,

**mutation**

# org login - blocked

**query**
getRevenueReports, getSubscriberStatistics, getGraphStatistics, getTraining,
getTrainingRegistrationInvoices, getTrainingRegistrationsForInvoiceGeneration,

**mutation**
createOrUpdateBranch, deleteBranch,
createOrUpdateOrganization, deleteOrganization,
createTrainingRegistration, updateTrainingRegistration, deleteTrainingRegistration,
updateTrainingProgress, createOrUpdateTrainingAttendance,
createOrUpdateTrainingRegistrationInvoice, generateTrainingRegistrationInvoice,
createOrUpdateTraining, deleteTraining, updateTrainingStatus,
createOrUpdateTrainingCategory, deleteTrainingCategory,
createEmployees, createEmployee, updateEmployee, deleteEmployee,
createOrUpdateSubRole, deleteSubRole,
