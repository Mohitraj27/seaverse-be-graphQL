const { ApolloServer, gql, PubSub, withFilter } = require("apollo-server-express");
const lodash = require("lodash");
const { insidePolygon, Location } = require("geolocation-utils");
const mongoose = require("mongoose");
const { inspect } = require("util");

//Express server related
const express = require("express");
const expressServer = express();
expressServer.use(express.json());
expressServer.use(require("compression")());
expressServer.use(require("cors")());
expressServer.use(require("graphql-upload").graphqlUploadExpress());

//graphql subscription related
const { EventEmitter } = require("events");
const biggerEventEmitter = new EventEmitter();
biggerEventEmitter.setMaxListeners(1000);
const pubSub = new PubSub({ eventEmitter: biggerEventEmitter });

module.exports = {
    ApolloServer,
    GqlHelper: gql,
    PubSubHelper: pubSub,
    SubscriptionFilter: withFilter,

    Lodash: lodash,
    CloneDeep: lodash.cloneDeep,
    isFunction: lodash.isFunction,
    isObject: lodash.isObject,
    mapValues: lodash.mapValues,

    InsidePolygon: insidePolygon,
    Location,

    Mongoose: mongoose,
    ObjectId: mongoose.Types.ObjectId,
    Schema: mongoose.Schema,
    Model: mongoose.model,

    ExpressServer: expressServer,
    ExpressRouter: express.Router(),

    AggregatePaginate: require("mongoose-aggregate-paginate-v2"),
    ApiHelper: require("axios"),
    Base64: require("js-base64").Base64,
    Buffer: require("buffer").Buffer,
    Crypto: require("crypto"),
    CryptoHelper: require("bcryptjs"),
    FileHelper: require("fs"),
    HttpHelper: require("http"),
    HttpsHelper: require("https"),
    JwtHelper: require("jsonwebtoken"),
    Moment: require("moment"),
    MomentTimezone: require("moment-timezone"),
    NanoId: require("nanoid").nanoid,
    PathHelper: require("path"),
    Utf8: require("utf8"),
    Validator: require("validator"),
    IpHelper: require("geoip-lite"),
    CronHelper: require("node-cron"),
    MimeHelper: require("mime-types"),
    ConsoleLog: (description = "", object) => {
        console.log(
            description ?? "",
            inspect(object, { showHidden: false, depth: null, colors: true })
        );
    },

    AppleSigInHelper: require("apple-signin"),
    GoogleSignInHelper: require("google-auth-library").OAuth2Client,
};
