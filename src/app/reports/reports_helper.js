const  generateFileNameTimestamp= async ()=> {
    const now = new Date();

    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear().toString().slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${day}-${month}-${year}_(${hours}:${minutes})`;
}

const  getAppliedFilters = async (input) => {
    let appliedFilters = [];

    if (input.courseIds && Array.isArray(input.courseIds) && input.courseIds.length > 0) {
        appliedFilters.push("Course Names filter");
    }
    if (input.vesselName && Array.isArray(input.vesselName) && input.vesselName.length > 0) {
        appliedFilters.push("Vessel Name filter");
    }
    if (input.vesselType && Array.isArray(input.vesselType) && input.vesselType.length > 0) {
        appliedFilters.push("Vessel Type filter");
    }
    if (input.courseStatus && Array.isArray(input.courseStatus) && input.courseStatus.length > 0) {
        appliedFilters.push("Course Status filter");
    }
    if (input.learnerStatus && Array.isArray(input.learnerStatus) && input.learnerStatus.length > 0) {
        appliedFilters.push("Learner Status filter");
    }
    if (appliedFilters.length === 0) {
        return "No filters were applied.";
    }
    return `Filters applied: ${appliedFilters.join(', ')}`;
}

const convertUnderscoreSeperatedStringToCamelCase = async (str) => {
    if (str == null) { 
        return null;
    }

    return str
        .split('_') 
        .map((word, index) => {
            
            if (index === 0) {
                return word.toLowerCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(''); 
}

module.exports ={
    generateFileNameTimestamp,
    getAppliedFilters,
    convertUnderscoreSeperatedStringToCamelCase,
}