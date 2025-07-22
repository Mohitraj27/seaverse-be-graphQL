module.exports = {
    apps: [
        {
            name: "seaverse",
            script: "./app.js",   // adjust if yours is `app.js` or `index.js`
            instances: "max",         // max means 1 per vCPU
            exec_mode: "cluster",
            env: {
                NODE_ENV: "stage"
            }
        }
    ]
};
