require('dotenv').config()

const {
  NODE_ENV,
  DB_DRIVER,
  DB_CHARSET,
  DB_DATABASE,
  DB_USERNAME,
  DB_PASSWORD,
  DB_MIGRATIONS_TABLE,
} = process.env

const defaultParams = {
  client: DB_DRIVER,
  connection: {
    database: DB_DATABASE,
    password: DB_PASSWORD,
    user: DB_USERNAME,
    charset: DB_CHARSET,
  },
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    tableName: DB_MIGRATIONS_TABLE,
  },
}

const config = {
  staging: defaultParams,
  production: defaultParams,
  development: defaultParams,
}

module.exports = config[NODE_ENV]
