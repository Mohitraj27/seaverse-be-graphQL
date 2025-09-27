const mysql = require('mysql2'); // Non-promise version for streaming
const mysqlPromise = require('mysql2/promise'); // Promise version for normal queries
const { Readable } = require('stream');
require('dotenv').config();

let pool;
let poolPromise;

function initSQLConnection() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.SQL_HOST,
      port: process.env.SQL_PORT || 3306,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // For async/await normal queries
    poolPromise = mysqlPromise.createPool({
      host: process.env.SQL_HOST,
      port: process.env.SQL_PORT || 3306,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    console.log('✅ SQL connection pool created.');
  }

  return { pool, poolPromise };
}


async function runQuery(sql, params = []) {
  if (!poolPromise) {
    initSQLConnection();
  }
  const [rows] = await poolPromise.execute(sql, params);
  return rows;
}

async function* runQueryStream(sql, params = []) {
  if (!poolPromise) {
    initSQLConnection();
  }

  // Use promise-based pool to get connection
  const connection = await poolPromise.getConnection();

  try {
    // Create the query stream using the connection
    const queryStream = connection.connection.query(sql, params).stream({
      highWaterMark: 50
    });

    // Yield rows as they come
    for await (const row of queryStream) {
      yield row;
    }

  } finally {
    connection.release();
  }
}

module.exports = {
  initSQLConnection,
  runQuery,
  runQueryStream
};