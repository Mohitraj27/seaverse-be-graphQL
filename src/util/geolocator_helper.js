const findHaversineDistance = ({ location1, location2 }) => {
    const toRadian = x => (x * Math.PI) / 180;
    const R = 6371; //Radius of earth

    const lat1 = location1.latitude;
    const lon1 = location1.longitude;
    const lat2 = location2.latitude;
    const lon2 = location2.longitude;

    const x1 = lat2 - lat1;
    const x2 = lon2 - lon1;

    const dLat = toRadian(x1);
    const dLon = toRadian(x2);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadian(lat1)) *
            Math.cos(toRadian(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

module.exports = {
    findDistance: findHaversineDistance,
};
