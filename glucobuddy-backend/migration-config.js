require('dotenv').config()

modules.export = {
    databaseUrl: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_DATANASE,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL ==='true'
            ? {rejectedUnauthorised: false }
            : false,
    },

    migrationsTable: 'pgmigrations',
    dir: 'migrations',
    direction: 'up',
    migrationSchema: 'public',
};