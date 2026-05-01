import type { Knex } from 'knex'
import path from 'path'

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: path.resolve(__dirname, 'lamusica.db'),
    },
    migrations: {
      directory: path.resolve(__dirname, 'src/db/migrations'),
      extension: 'ts',
    },
    useNullAsDefault: true,
  },
  production: {
    client: 'better-sqlite3',
    connection: {
      filename: path.resolve(__dirname, 'lamusica.db'),
    },
    migrations: {
      directory: path.resolve(__dirname, 'src/db/migrations'),
      extension: 'ts',
    },
    useNullAsDefault: true,
  },
}

export default config
