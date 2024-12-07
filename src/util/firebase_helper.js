const FirebaseAdmin = require("firebase-admin");

const generateFirebaseMessageInput = ({ title, body, content, webLink }) => {
    const message = {
        notification: {
            title: title || "Test notification title",
            body: body || "Test notification body",
        },
        android: {
            notification: {
                click_action: "FLUTTER_NOTIFICATION_CLICK",
            },
        },
    };

    if (content && typeof content === "object") {
        message.data = { content: JSON.stringify(content) };
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
            credential: FirebaseAdmin.credential.cert({
                "type": "service_account",
                "project_id": "seaverse-dff00",
                "private_key_id": "7af6a3cbdaa19718312b26624e09d0ffa5c2eca9",
                "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDWAX7gEMyei44V\nHrK7P9VRIXSSdj91OAbFJaMb7sNW40W8H7PmI+ksu/8w+kp1/7ttmDdNqQaKjZw5\n7i0zKOAOBPV2r9/fEnRbx0mhUDryVA52eCt8ZPnoDS3CRNak3CDdl7Lf35lmNqCN\nBaDeGMUGqjVIJHIPvBJmycZuiwIj9KouB9ioW8a1PUcm/OJC4mVB/u8KlNNM2R7f\nB0U7oj2hTuvwY9w8HNE2TSxatUInFHhrnpqG38YF7rnd867KZnlBOMDKqBxBrZbM\njujRbPhVKkyf71t2nFipfynRFIMSK9gTCxawUq/wonGzCKULrPiLyx0y7kDMtstv\nn4EWdmH1AgMBAAECggEAQRv1YPBbgMUOtkg/so6KNQPLtp+5UM156dM4m8/5qF6/\nIaw3jIZSc+TCkEEmFF54xLAx6zPIpLDO3iUjpVQDTuCdWb3Ki9DOi/nG4ghJ1t5S\nBCMtf8ws6DfSOy+8ai365dA4gLpDroBiOmWC+u9oSk3QpiFIfpcGtjUfZRRv00YX\nVDRTUTaBNlR3syUXzK0BrXM/NGwHu3+dIpzQGJ4STkgMdA3XVLq4i9MzhFHxISa0\nA/+1hDD8va72Mj/XHIhtu2fbTOFizJ+dROtKeEpjgQmzd7XbBH2H+wUycnj5uwII\nJ3IoAoRMVxekJEpeI8FvpUd9nI9qGlmPGvKxlpSFBQKBgQDzW56Nm/RdugvIju3q\nByAswMM//B8IO0W4ZbdHRVN9DVDwTYk7mabk1APuclHjhk4h4WK1jWi8bi0uVA+F\naAXQp9frpyB7tGqC1BCMkPa6lW0P9tsZgevV2/bfT0zbN0D33bHQB3bOh1mq52R0\nx6C/9vC7i6kAlTprK6QJfEgOOwKBgQDhH4cZV1XnpEN0w5/Y8obPNHtLHudxiM8B\nHl+VH/fym5aeSANfwEJ5K9ATBK4GCWCmVtRaU18EKoLuFt1gwTnx842OHa3dxM/P\nNcsbnKyuj6qw0ur1InrPwPKedCBfJa7We6bol142cKQwN/wHTqvRyC6ouvcnkY6Q\nM1HUT3FdjwKBgDUQGyhhgw0UzhDzKWlIGHnppilDfji7Q96LP0VpFmVEDAv5vByk\nykFHAXxyrOxhkpPMo0tXBCliFLPvXFsIbYwrrOcTT//pPPg96UXdLg9NGbTLbMbJ\nD3VYOyJCFk4OZDonuufTWNJ7rM+ZGMxl4uU4oREjyLv5zf0kTOZMlSGVAoGBALjm\nDy0WGT1nIexOHASwtV6L6VP6rvcF+Zcenjy6BAjkF2IrHXJQU4h4Hq7wIgpdO1+D\nY2hIn3qpe94XM34bVf9OHY6C++Fwm4nB0e780KuS3gvbQBVUW3A1NlBEaq4bIi2R\nY7YXVM771y6vXLWXvPFRLFlzLjn2iBQRwnzRPvgrAoGBANKkGtUnXmpH8tmBZWOT\nK6MiMwUvIxkRcboJ8HCpEqPQslCaPewOlRYcnFJv56PB6/kGa2kKJBjoH2ifUjmJ\nVVdS9hs8PyRrJSGGyBOrF6d/ilT4kJxKyCZM5xwGvxGhhzjtSE7e48eI7ak9mS+s\n1ayigqSA/Nc9yILTyKFY3gf4\n-----END PRIVATE KEY-----\n",
                "client_email": "firebase-adminsdk-f7x9r@seaverse-dff00.iam.gserviceaccount.com",
                "client_id": "114371887120127006634",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-f7x9r%40seaverse-dff00.iam.gserviceaccount.com",
                "universe_domain": "googleapis.com"
              }
              ),
        });
    },
    sendNotification: ({ topic, title, body, content, webLink }) => {
        try {
            const message = {
                topic: topic || "news",
                ...generateFirebaseMessageInput({ title, body, content, webLink }),
            };

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
                        .sendMulticast(multicastMessage)
                        .then(response => {
                            if (response.failureCount > 0) {
                                const failedTokens = [];

                                response.responses.forEach((resp, idx) => {
                                    if (!resp.success) {
                                        failedTokens.push(tokens[idx]);
                                    }
                                });

                                console.log(
                                    "firebase_helper.sendMulticastNotification:failedTokens: " +
                                        failedTokens
                                );
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
};
