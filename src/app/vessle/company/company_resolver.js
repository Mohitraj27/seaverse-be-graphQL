const {
    CustomError,
    ErrorName,
    AuthUser
} = require("../../../util");

const { ObjectId } = require("../../../tools");
const { Company } = require("../company/company_model");

module.exports.queries = {
    getCompanies: async ({ search }, context) => {
        const { subscriberId } = AuthUser(context);
        try {
            const query = {
                subscriber: ObjectId(subscriberId),
                isDeleted: false
            };
            if (search) {
                query.name = { $regex: search, $options: "i" };
            }
            const companies = await Company.find(query).sort({ name: 1 });

            return {
                companies,
                totalCount: companies.length
            }
        } catch (error) {
            throw Error(error.message);
        }
    },
};

module.exports.mutations = {
    createCompany: async ({ input }, context) => {
        const { userId, subscriberId } = AuthUser(context);
        try {
            const { name, isActive } = input;
            const companyData = new Company({
                subscriber: subscriberId,
                name: name,
                isActive: isActive,
                createdBy: userId,
                updatedBy: userId
            });
            const company = await companyData.save();
            return {
                success: true,
                message: "Company created successfully",
                company
            }
        } catch (error) {
            throw Error(error.message);
        }
    },
};