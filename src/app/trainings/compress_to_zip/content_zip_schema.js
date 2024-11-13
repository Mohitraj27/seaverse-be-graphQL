module.exports = {
    types: `
    input DownloadZipInput {
        training: ID!
        trainingModule: ID!
    }
    type DownloadZipResponse {
        status: String
        zipUrl: String
    }
    `,
    queries: `
    
    `,
    mutations: `
    downloadZip(input: DownloadZipInput!): DownloadZipResponse
    `,
};
