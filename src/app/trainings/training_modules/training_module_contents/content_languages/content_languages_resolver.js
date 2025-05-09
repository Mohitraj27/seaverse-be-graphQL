const { CustomError, ErrorName, AuthUser} = require("../../../../../util")
const contentLanguage = require("./content_languages_model")
const { contentLanguagesSchema } = require("./content_languages_schema")
module.exports.queries = {
    getAllContentLanguages: async ({ filterInput }, context) => {
        const { subscriberId } = AuthUser(context);
        if (!subscriberId) throw CustomError(ErrorName.FORBIDDEN);

        try {
            

            const contentLanguages = await contentLanguage.find({
                title: { $regex: filterInput?.title || "", $options: "i" },
              })
                .sort({ createdAt: -1 })
                .lean();
            return {
                contentLanguages: contentLanguages,
                totalCount: contentLanguages?.length || 0,
            };
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_FETCH_CONTENT_LANGUAGES, error.message);
        }
    }
};



module.exports.mutations = {
    createContentLanguage: async ({ input }, context) => {
        const { userId, subscriberId, userInfo } = AuthUser(context);

        try {
            const contactSupportData = new contentLanguage({
                title: input?.title,
                contentLanguageCode: input?.contentLanguageCode,
                createdBy: userId,
                updatedBy: userId,
            });
            await contactSupportData.save();
            return contactSupportData;
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_CREATE_CONTENT_LANGUAGE, error.message)
        }
    },
    updateContentLanguage: async ({ input }, context) => {
        const { userId, subscriberId, userInfo } = AuthUser(context);
        try {
            const contactSupportData = await contentLanguage.findByIdAndUpdate(input?._id, {
                title: input?.title,
                contentLanguageCode: input?.contentLanguageCode,
                updatedBy: userId,
            }, { new: true });
            return contactSupportData;
        } catch (error) {
            throw CustomError(ErrorName.FAILED_TO_UPDATE_CONTENT_LANGUAGE, error.message)
        }
    },
}