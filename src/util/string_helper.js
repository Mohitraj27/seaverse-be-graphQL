module.exports = {
    stringNormalize: value => {
        if (value && typeof value === "string") return value.normalize("NFKC");
    },
    toUpperCaseFirstLetter: (str) => {
        if (typeof str !== 'string') {
            return str;
        }
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    convertMinutesToHHMMSS: (decimalMinutes) => {
        if (typeof decimalMinutes !== "number" || decimalMinutes < 0) {
            throw new Error("Invalid input. Minutes must be a non-negative number.");
        }

        const minutesPart = Math.floor(decimalMinutes);
        const secondsPart = Math.round((decimalMinutes % 1) * 100);

        const totalSeconds = minutesPart * 60 + secondsPart;

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
};