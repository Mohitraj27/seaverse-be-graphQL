module.exports = {
    stringNormalize: value => {
        if (value && typeof value === "string") return value.normalize("NFKC");
    },
};
