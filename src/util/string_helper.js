module.exports = {
    // Normalize the input string by removing unicode styles etc.
    stringNormalize: value => {
        if (value && typeof value === "string") return value.normalize("NFKC");
    },
};
