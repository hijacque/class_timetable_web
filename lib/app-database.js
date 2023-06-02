const sql = require("mysql2"); // forked npm from orig mysql package

class AppDatabase {
    #connection;
    constructor(host, user, password, database, multipleQueries = false) {
        this.#connection = sql.createPool({
            host: host,
            user: user,
            password: password,
            database: database,
            multipleStatements: multipleQueries,
            waitForConnections: true,
            connectionLimit: 10,
            keepAliveInitialDelay: 0,
            enableKeepAlive: true,

        });
        this.#connection.getConnection((error, conn) => {
            if (error) {
                console.log(error);
                process.exit(5);
            } else {
                console.log(`MySQL connected on DB "${database}"`);
            }
            this.#connection.releaseConnection(conn);
        });
    }

    convertDateTime(datetime, updateDate = {}) {
        for (const option in updateDate) {
            switch (option) {
                case 'years':
                    datetime.setDate(datetime.getFullYear() + updateDate[option]);
                    break;
                case 'months':
                    datetime.setDate(datetime.getMonth() + updateDate[option]);
                    break;
                case 'days':
                    datetime.setDate(datetime.getDate() + updateDate[option]);
                    break;
                case 'hours':
                    datetime.setDate(datetime.getHours() + updateDate[option]);
                    break;
                case 'minutes':
                    datetime.setDate(datetime.getMinutes() + updateDate[option]);
                    break;
                case 'seconds':
                    datetime.setDate(datetime.getSeconds() + updateDate[option]);
                    break;
                default:
                    break;
            }
        }
        datetime.toISOString();
        return datetime.toJSON().slice(0, 19).replace('T', ' ');

    }
    
    executeQuery = (query) => new Promise((accept, reject) => {
        this.#connection.query(query, (queryErr, result) => {
            if (queryErr) reject(queryErr);
            else accept(result);
        });
    })
}

module.exports = { AppDatabase };