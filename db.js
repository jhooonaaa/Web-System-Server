import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

let newPool;

console.log(process.env.NODE_ENV)

if (process.env.NODE_ENV === 'development') {
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_PORT } = process.env;

  newPool = new Pool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: DB_PORT
  });

} else {
  const {
    PROD_DB_HOST,
    PROD_DB_NAME,
    PROD_DB_USER,
    PROD_DB_PASSWORD,
    PROD_DB_PORT
  } = process.env;

  newPool = new Pool({
    connectionString: `postgres://${PROD_DB_USER}:${PROD_DB_PASSWORD}@${PROD_DB_HOST}:${PROD_DB_PORT}/${PROD_DB_NAME}`,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

const db = newPool;

db.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.error('Connection error', err.stack));

export default db;
