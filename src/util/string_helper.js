module.exports = {
    stringNormalize: value => {
        if (value && typeof value === "string") return value.normalize("NFKC");
    },
    convertMinutesToHHMMSS: (minutes) => {
        if (typeof minutes !== "number" || minutes < 0) {
            throw new Error("Invalid input. Minutes must be a non-negative number.");
        }
    
        const hours = Math.floor(minutes / 60);
        const mins = Math.floor(minutes % 60);
        const secs = Math.floor((minutes * 60) % 60);
    
        return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
};
