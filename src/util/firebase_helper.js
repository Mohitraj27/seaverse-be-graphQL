const FirebaseAdmin = require("firebase-admin");
const { User } = require("../app/user/user_model");
const firebaseConfig = require("./firebaseConfig");
const generateFirebaseMessageInput = ({ title, body, content, webLink }) => {

    const message = {
        notification: {
            title: title || "Test notification title",
            body: body || "Test notification body",
        },
        data: {
            title: title || "Test notification title",
            body: body || "Test notification body",
            type: "background_notification", 
        },

        android: {
            notification: {
                click_action: "FLUTTER_NOTIFICATION_CLICK",
            },
        },
        apns: {
            payload: {
                aps: {
                    alert: {
                        title: title || "Test notification title",
                        body: body || "Test notification body",
                    },
                    sound: "default",
                    badge: 1,
                    "content-available": 1, 
                },
            },
        },
    };

    if (content && typeof content === "object") {
        message.data = { content: JSON.stringify(content) };
        message.apns.payload.customData = { content: JSON.stringify(content) };
    }

    if (webLink) {
        message.webpush = {
            notification: {
                icon: "",
            },
            fcm_options: {
                link: webLink,
            },
        };
    }

    return message;
};

module.exports = {
    init: () => {
        FirebaseAdmin.initializeApp({
            credential: FirebaseAdmin.credential.cert(firebaseConfig),
        });
    },
    sendNotification: ({token, topic, title, body, content, webLink }) => {
        try {
            const baseMessage = generateFirebaseMessageInput({ title, body, content, webLink });

            const message = token
            ? { token, ...baseMessage }  
            : { topic: topic || "news", ...baseMessage };


            FirebaseAdmin.messaging()
                .send(message)
                .catch(error => {
                    console.log("firebase_helper.sendNotification:error:", error);
                });
        } catch (e) {
            console.log("firebase_helper.sendNotification:exception:", e.message);
        }
    },
    sendMulticastNotification: ({ tokens, title, body, content, webLink }) => {
        try {
            const message = {
                tokens: tokens || [],
                ...generateFirebaseMessageInput({ title, body, content, webLink }),
            };

            if (message.tokens.length > 0) {
                const sendMessage = multicastMessage => {
                    FirebaseAdmin.messaging()
                        .sendEachForMulticast(multicastMessage)
                        .then(response => {
                            if (response.failureCount > 0) {
                                const failedTokens = [];

                                response.responses.forEach((resp, idx) => {
                                    if (!resp.success) {
                                        failedTokens.push(tokens[idx]);
                                    }
                                });


                            }
                        })
                        .catch(error => {
                            console.log("firebase_helper.sendMulticastNotification:error:", error);
                        });
                };

                if (tokens.length > 499) {
                    for (let i = 0; i < tokens.length; i += 499) {
                        sendMessage({
                            ...message,
                            tokens: tokens.slice(i, i + 499),
                        });
                    }
                } else {
                    sendMessage(message);
                }
            }
        } catch (e) {
            console.log("firebase_helper.sendMulticastNotification:exception:", e.message);
        }
    },
    subscribeTokenToTopic: async ({ token, topic }) => {
        try {
            if (token && topic) {
                return await new Promise(resolve => {
                    FirebaseAdmin.messaging()
                        .subscribeToTopic(token, topic)
                        .then(_ => {
                            resolve(true);
                        })
                        .catch(error => {
                            console.log("firebase_helper.subscribeTokenToTopic:error:", error);
                        });
                });
            }
        } catch (e) {
            console.log("firebase_helper.subscribeTokenToTopic:exception:", e.message);
        }
    },
    sendNotifications: async ({ userIds, title, body, content, webLink }) => {

        const usersWithTokens = await User.find({ _id: { $in: userIds }, isPushNotification: { $ne: false } }, { firebaseTokens: 1 });
        const tokens = usersWithTokens.reduce((acc, user) => {
            if (user.firebaseTokens && user.firebaseTokens.length > 0) {
                acc.push(...user.firebaseTokens);
            }
            return acc;
        }, []);
        if (tokens.length > 0) {
            module.exports.sendMulticastNotification({
                tokens,
                title,
                body,
                content,
                webLink,
            });
        }
    }
};
