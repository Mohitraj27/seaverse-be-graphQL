// src/util/redis_helper.js
const { Redis } = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });


const redis = new Redis(
    // process.env.REDIS_URL || "rediss://default:AZfsAAIjcDE5OWIwZDJjNmRlYjk0MThjODljYWRjOTYzZDA4MjYwZXAxMA@viable-hermit-38892.upstash.io:6379" ,
    {
        host: process.env.REDIS_HOST || 'redis-19535.c264.ap-south-1-1.ec2.redns.redis-cloud.com',
        port: Number(process.env.REDIS_PORT) || 19535,
    
        username: process.env.REDIS_USERNAME || "default", // optional
        password: process.env.REDIS_PASSWORD || "OaEpO0TMWl5MwMPJt4JqlUaqJ6B2GmL5", // optional
       maxRetriesPerRequest: null, // ✅ Required by BullMQ
       enableReadyCheck: true,     // Helps detect if Redis is ready
    // tls:{},
    reconnectOnError: (err) => {
        const targetMessage = 'READONLY';
        if (err.message.includes(targetMessage)) {
            console.warn('Redis in readonly mode. Attempting reconnect...');
            return true;
        }
        return false;
    },
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});



redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err));
redis.on('reconnecting', () => console.log('🔁 Redis reconnecting...'));

module.exports = redis;
