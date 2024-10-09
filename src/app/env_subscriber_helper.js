module.exports.EnvSubscriberHelper = {
    getEnvCertificateRelatedValues: () => {
        const is5mSubscriber = process.env.SUBSCRIBER === "5M";

        if (is5mSubscriber) {
            return {
                trainerName: "Sanuj Naimanapparambu Subair",
                trainerSignature:
                    "https://5m-trainings-files.s3.me-south-1.amazonaws.com/onlineTrainerSign.png",
                mdName: "Hamad Al Mutairi",
                mdSignature: "https://5m-trainings-files.s3.me-south-1.amazonaws.com/mdSign.png",
                approvalInfo: "KPC Approval Ref: V/C-C.1924-15-R-003L",
                contactInfo:
                    "Email: info@5m-int.com/Web. www.5m-int.com/Tel: +956 6606 6346",
            };
        }

        return {
            trainerName: "",
            trainerSignature: "",
            mdName: "",
            mdSignature: "",
            approvalInfo: "",
            contactInfo: "",
        };
    },
};
