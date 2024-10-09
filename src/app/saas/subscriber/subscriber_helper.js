const { CustomError, ErrorName, Role } = require("../../../util");

const { Subscriber } = require("./subscriber_model");
const { SubRole } = require("../../user/sub-roles/sub_role_model");
const { SubscriberProfile } = require("../../user/subscriber-profile/subscriber_profile_model");

const UserHelper = require("../../user/user_helper");

module.exports = {
    createSubscriber: async ({ input }) => {
        if (!input?.userInput) throw CustomError(ErrorName.BAD_REQUEST);

        const savedUser = await UserHelper.createUser({
            input: {
                ...input.userInput,
                role: Role.ADMIN,
            },
        });

        if (savedUser) {
            const savedSubscriber = await new Subscriber({
                user: savedUser,
                name: input.name ?? savedUser.firstName,
            }).save();

            if (savedSubscriber) {
                savedUser.subscriber = savedSubscriber;
                await savedUser.save();

                //TODO: things to consider: there's no permission set initially and createdBy on sub role
                await SubRole.create([
                    {
                        subscriber: savedSubscriber._id,
                        name: "TRAINER",
                    },
                    {
                        subscriber: savedSubscriber._id,
                        name: "ORGANIZATION_MANAGER",
                    },
                ]);

                await new SubscriberProfile({
                    subscriber: savedSubscriber,
                    user: savedUser,
                }).save();

                savedSubscriber.user = savedUser;
                return savedSubscriber;
            }

            await savedUser.deleteOne();
        }

        throw CustomError(ErrorName.FAILED);
    },
};
