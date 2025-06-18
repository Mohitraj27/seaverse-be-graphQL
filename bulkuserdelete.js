const mongoose = require("mongoose");
// const { encrypt } = require("./helpers/cryptoHelper"); // Adjust path
// import { encrypt } from "./src/util/encryption_helper";
const { encrypt } = require("./src/util/encryption_helper"); 
// const { User, Employee, Designation, UserVessel, Vessel } = require("./models");
const { Employee } = require("./src/app/user/employee/employee_model");
const { User, DeletedUser } = require("./src/app/user/user_model");
const { UserVessel } = require("./src/app/user/user-vessel-bridge/userVessel_model");
// import { UserVessel } from "./src/app/user/user-vessel-bridge/userVessel_model";
// const { Designation } = require("../../designations/designation_model");
const {Designation}=require("./src/app/designations/designation_model")
const { generateUserUID, generateEmployeeUID } = require("./src/app/user/employee/employee_helper");
// const { indexDocumenttoElasticSearch } = require("./helpers/elasticHelper");
const { indexDocumenttoElasticSearch,deleteDocumenttoElasticSearch,client } = require("./src/util/elastic_helper");
const { ObjectId } = mongoose.Types;
const bcrypt = require("bcryptjs");
// import { Vessel } from "./src/app/vessle/vessel_model";
// import { CryptoHelper } from "./src/tools";
const { Vessel } = require("./src/app/vessle/vessel_model");
const { CryptoHelper } = require("./src/tools/index");
const defaultPassword = "123456789@S";
const sampleUsers = [
  {
    firstName: "Aditya",
    lastName: "Kapoor",
    email: "aditya+1@example.com",
    civilIdOrPassport: "CIVIL1101",
    isRegistered: true,
    currentVessel: null,
    vesselStatus: null,
    country: "IN"
  },
  {
    firstName: "Neha",
    lastName: "Bhatia",
    email: "neha+1@example.com",
    civilIdOrPassport: "CIVIL1102",
    isRegistered: true,
    currentVessel: null,
    vesselStatus: null,
    country: "IN"
  },
  {
    firstName: "Rahul",
    lastName: "Yadav",
    email: "rahul+1@example.com",
    civilIdOrPassport: "CIVIL1103",
    isRegistered: true,
    currentVessel: null,
    vesselStatus: null,
    country: "IN"
  },
  {
    firstName: "Pooja",
    lastName: "Saxena",
    email: "pooja+1@example.com",
    civilIdOrPassport: "CIVIL1104",
    isRegistered: true,
    currentVessel: null,
    vesselStatus: null,
    country: "IN"
  },
  {
    firstName: "Kabir",
    lastName: "Thakur",
    email: "kabir+1@example.com",
    civilIdOrPassport: "CIVIL1105",
    isRegistered: true,
    currentVessel: null,
    vesselStatus: null,
    country: "IN"
  },
  {
    firstName: "Tanya",
    lastName: "Nair",
    email: "tanya+1@example.com",
    civilIdOrPassport: "CIVIL1106",
    isRegistered: true,
    currentVessel: null,
    vesselStatus: null,
    country: "IN"
  },
  {
    firstName: "Siddharth",
    lastName: "Gupta",
    email: "siddharth+1@example.com",
    civilIdOrPassport: "CIVIL1107",
    isRegistered: true,
    currentVessel: null,
    vesselStatus: null,
    country: "IN"
  },
  {
    firstName: "Isha",
    lastName: "Sen",
    email: "isha+1@example.com",
    civilIdOrPassport: "CIVIL1108",
    isRegistered: true,
    currentVessel: null,
    vesselStatus: null,
    country: "IN"
  },
  {
    firstName: "Ritik",
    lastName: "Mehra",
    email: "ritik+1@example.com",
    civilIdOrPassport: "CIVIL1109",
    isRegistered: true,
    currentVessel: null,
    vesselStatus: null,
    country: "IN"
  },
  {
    firstName: "Shruti",
    lastName: "Chowdhury",
    email: "shruti+1@example.com",
    civilIdOrPassport: "CIVIL1110",
    isRegistered: true,
    currentVessel: null,
    vesselStatus: null,
    country: "IN"
  },
  // 40 more programmatically generated users
  ...Array.from({ length: 40 }, (_, i) => {
    const n = i + 1111; // CIVIL1111 to CIVIL1150
    return {
      firstName: `AutoFirst${n}`,
      lastName: `AutoLast${n}`,
      email: `autouser${n}+1@example.com`,
      civilIdOrPassport: `CIVIL${n}`,
      isRegistered: true,
      currentVessel: null,
      vesselStatus: null,
      country: "IN"
    };
  })
];
// const bulkCreate = async () => {
//   await mongoose.connect("mongodb://localhost:27017/seaverse"); // Replace DB name
//   const session = await mongoose.startSession();
//   session.startTransaction();
//   const indexedESDocs = [];
//   try {
//     const subscriberId = ObjectId("66975e0e7835373dbcebf1e8");
//     const designationId = "679095418696f1b59a392140";
//     const existingDesignation = await Designation.findById(designationId);
//     if (!existingDesignation) throw new Error("Invalid designation");
//     for (const input of sampleUsers) {
//       const encryptedFirstName = encrypt(input.firstName);
//       const encryptedLastName = encrypt(input.lastName);
//       const encryptedEmail = encrypt(input.email);
//       const encryptedCivilId = encrypt(input.civilIdOrPassport);
//       const existingUser = await User.findOne({ email: encryptedEmail });
//       if (existingUser) {
//         console.log(`User already exists: ${input.email}`);
//         continue;
//       }
//       const passwordHash = await CryptoHelper.hash(defaultPassword, 10);
//       const dummyPassword = `${passwordHash}~~~${defaultPassword}`;
//       const savedUser = await User.create([{
//         subscriber: subscriberId,
//         firstName: encryptedFirstName,
//         lastName: encryptedLastName,
//         civilIdOrPassport: encryptedCivilId,
//         isRegistered: input.isRegistered,
//         currentVessel: input.currentVessel,
//         vesselStatus: input.vesselStatus,
//         email: encryptedEmail,
//         role: "LEARNER",
//         password: passwordHash,
//         dummyPassword,
//         isSignupAdminAprroved: true,
//         country: input.country.toUpperCase(),
//         UID: await generateUserUID({ session }),
//       }], { session });
//       const savedEmployee = await Employee.create([{
//         subscriber: subscriberId,
//         user: savedUser[0]._id,
//         branch: null,
//         organization: null,
//         empDesignation: designationId,
//         designation: existingDesignation.name,
//         UID: await generateEmployeeUID({ subscriberId, session }),
//       }], { session });
//       let savedUserVessel = null;
//       let vessel = null;
//       if (input.currentVessel || input.vesselStatus) {
//         const userVesselUpdate = {
//           user: savedUser[0]._id,
//           vessel: input.currentVessel && input.currentVessel !== "" ? ObjectId(input.currentVessel) : null,
//           vesselStatus: input.vesselStatus && input.vesselStatus !== "" ? input.vesselStatus : null,
//         };
//         savedUserVessel = await UserVessel.create([userVesselUpdate], { session });
//         if (!savedUserVessel || !savedUserVessel[0]) throw new Error("Failed to create UserVessel");
//         if (savedUserVessel[0].vessel) {
//           vessel = await Vessel.findById(savedUserVessel[0].vessel).populate("typeOfVessel", "_id name");
//         }
//       }
//        const document = {
//             // Employee fields
//             employeeId: savedEmployee[0]._id?.toString(),
//             UID: savedEmployee[0].UID,
//             designation: savedEmployee[0].designation,
//             empDesignation: savedEmployee[0].empDesignation?.toString(),
//             bulkId: savedEmployee[0].bulkId,
//             regType: savedEmployee[0].regType,
//             isActive: savedEmployee[0].isActive,
//             isDeleted: savedEmployee[0].isDeleted,
//             subscriber: savedEmployee[0].subscriber?.toString(),
//             createdAt: savedEmployee[0].createdAt,
//             updatedAt: savedEmployee[0].updatedAt,
//             // Nested User fields
//             userId: savedUser[0]._id?.toString(),
//             firstName: savedUser[0].firstName,
//             lastName: savedUser[0].lastName,
//             email: savedUser[0].email,
//             civilIdOrPassport: savedUser[0].civilIdOrPassport,
//             country: savedUser[0].country,
//             languagePreference: savedUser[0].languagePreference,
//             role: savedUser[0].role,
//             subRoles: savedUser[0].subRoles,
//             isVerified: savedUser[0].isVerified,
//             isRegistered: savedUser[0].isRegistered,
//             superAdmin: savedUser[0].superAdmin,
//             deleteRequest: savedUser[0].deleteRequest,
//             isDeleted_user: savedUser[0].isDeleted,
//             directSignup: savedUser[0].directSignup,
//             contentlanguages: savedUser[0].contentlanguages,
//             currentVessel: savedUser[0].currentVessel?.toString() || null,
//             vesselStatus: savedUser[0].vesselStatus,
//             isEmailNotification: savedUser[0].isEmailNotification,
//             isPushNotification: savedUser[0].isPushNotification,
//             lastLoginAt: savedUser[0].lastLoginAt,
//             isSignupAdminAprroved: savedUser[0].isSignupAdminAprroved,
//             isResetPasswordDialog: savedUser[0].isResetPasswordDialog,
//             userCreatedAt: savedUser[0].createdAt,
//             userUpdatedAt: savedUser[0].updatedAt,
//             // Vessel fields (populated)
//             vesselName: vessel?.name || null,
//             vesselId: vessel?._id?.toString() || null,
//             vesselIsDeleted: vessel?.isDeleted || false,
//             vesselIsActive: vessel?.isActive || false,
//             typeOfVesselName: vessel?.typeOfVessel?.name || null,
//             typeOfVesselId: vessel?.typeOfVessel?._id?.toString() || null,
//             // Metadata
//             indexedAt: new Date(),
//         };
//       await indexDocumenttoElasticSearch("users", savedEmployee[0]._id, document);
//       indexedESDocs.push(savedEmployee[0]._id);
      
//       console.log(`Created & indexed: ${input.email}`);
//     }
//     await session.commitTransaction();
//   } catch (err) {
//     await session.abortTransaction();
//     console.error("Error in bulk creation:", err);
//     // Rollback elasticsearch
//   for (const id of indexedESDocs) {
//     // await client.delete({
//     //   index: "users",
//     //   id: id.toString()
//     // });
//     await deleteDocumenttoElasticSearch("users", id);
//     console.log(`Rolled back ES index for ID: ${id}`);
//   }
//   } finally {
//     session.endSession();
//     mongoose.disconnect();
//   }
// };
const bulkDeleteAllExcept = async () => {
  await mongoose.connect("mongodb://localhost:27017/seaverse");
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const encryptedEmail = encrypt("mohit@squadramedia.com");
    // Step 1: Find all users to be deleted (excluding the specific one)
    const usersToDelete = await User.find(
      { email: { $ne: encryptedEmail } },
      { _id: 1 }
    ).lean();
    const userIdsToDelete = usersToDelete.map(u => u._id);
    // Step 2: Delete from User, Employee, UserVessel
    await User.deleteMany({ _id: { $in: userIdsToDelete } }, { session });
    await Employee.deleteMany({ user: { $in: userIdsToDelete } }, { session });
    await UserVessel.deleteMany({ user: { $in: userIdsToDelete } }, { session });
    // Step 3: Delete from Elasticsearch
    const esDeleteResponse = await client.deleteByQuery({
      index: "users",
      refresh: true,
      body: {
        query: {
          bool: {
            must_not: {
              term: {
                email: encryptedEmail
              }
            }
          }
        }
      }
    });
    console.log("Elasticsearch delete result:", esDeleteResponse);
    await session.commitTransaction();
    console.log("Bulk delete completed successfully");
  } catch (err) {
    await session.abortTransaction();
    console.error("Error in bulk delete:", err);
  } finally {
    session.endSession();
    await mongoose.disconnect();
  }
};
// bulkCreate();
bulkDeleteAllExcept()