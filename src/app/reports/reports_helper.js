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

const formatDate = (date) => {
    if (date) {
        const formattedDate = new Date(date);
        return formattedDate.toLocaleString('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'UTC',
        });
    }
    return null;
};

const generateSortingStage = async(fieldMapping, lowercaseFields = [], defaultField = "FIRST_NAME",sortInput) => {
    const sortingStage = [];
    const sortOrder = sortInput?.sortOrder ?? 1;
    
    const field = sortInput?.field ?? defaultField;
    const fieldPath = fieldMapping[field];

    if (fieldPath) {
        // if the field is a text value, we need to sort by lowercase value for consistency
        const isLowercaseRequired = lowercaseFields.includes(field);
        
        if (isLowercaseRequired) {
            sortingStage.push({
                $addFields: {
                    [`lowercase${field}`]: { $toLower: `$${fieldPath}` }
                }
            });
            sortingStage.push({
                $sort: {
                    [`lowercase${field}`]: sortOrder
                }
            });
        } else {
            sortingStage.push({
                $sort: {
                    [fieldPath]: sortOrder
                }
            });
        }
    } else {
        // If the fieldPath doesn't exist in fieldMapping, apply default sorting (by defaultField)
        sortingStage.push({
            $addFields: {
                [`lowercase${defaultField}`]: { $toLower: `$${fieldMapping[defaultField]}` }
            }
        });
        sortingStage.push({
            $sort: {
                [`lowercase${defaultField}`]: sortOrder
            }
        });
    }

    return sortingStage;
}

module.exports ={
    generateFileNameTimestamp,
    getAppliedFilters,
    convertUnderscoreSeperatedStringToCamelCase,
    formatDate,
    generateSortingStage,
}