const crypto = require("node:crypto");

const createAdmin = async function (req, res, next) {
    const DB = req.app.locals.database;
    const email = req.body.email;
    let sameEmails = await DB.executeQuery(
        `SELECT email FROM Schools WHERE email = "${email}" AND acc_status = "open" ` +
        `UNION SELECT email FROM Chairpersons WHERE email = "${email}" AND acc_status = "open"`
    );
    if (sameEmails.length > 0) {
        req.success = false;
        res.cookie("serverMessage", {
            mode: 0,
            title: "Invalid e-mail",
            body: "Please enter a different e-mail addess."
        });
        res.redirect("/signup");
    } else {
        req.success = true;
        const accountID = crypto.randomBytes(8).toString("base64");
        const passSalt = crypto.randomBytes(24).toString("base64");
        const hashPassword = crypto.createHash("sha256").update(req.body.password + passSalt).digest("base64");
        const schoolName = req.body.schoolName;

        await DB.executeQuery(
            `INSERT INTO Schools (id, name, email, password, pass_salt) VALUES ` +
            `("${accountID}", "${schoolName}", "${email}", "${hashPassword}", "${passSalt}") ` +
            `ON DUPLICATE KEY UPDATE name = "${schoolName}", password = "${hashPassword}", pass_salt = "${passSalt}"`
        );
    }
    next();
};

const createChair = async function (req, res, next) {
    const DB = req.app.locals.database;
    const email = req.body.email;
    let sameEmails = await DB.executeQuery(
        `SELECT email FROM Schools UNION SELECT email FROM Chairpersons ` +
        `WHERE email = "${email}" AND acc_status = "open"`
    );
    if (sameEmails.length > 0) {
        res.cookie("serverMessage", {
            mode: 0,
            title: "Invalid e-mail",
            body: "Please enter a different e-mail addess."
        });
        res.redirect("/signup");
    } else {
        const accountID = crypto.randomBytes(8).toString("base64");
        const passSalt = crypto.randomBytes(24).toString("base64");
        const hashPassword = crypto.createHash("sha256").update(req.body.password + passSalt).digest("base64");
        const schoolName = req.body.schoolName;

        await DB.executeQuery(
            `INSERT INTO Chairpersons (id, name, email, password, pass_salt) VALUES ` +
            `("${accountID}", "${schoolName}", "${email}", "${hashPassword}", "${passSalt}") ` +
            `ON DUPLICATE KEY UPDATE name = "${schoolName}", password = "${hashPassword}", pass_salt = "${passSalt}"`
        );
    }
    next();
};

const openAccount = async function (req, res, next) {
    const otpResult = req.message.mode;
    if (otpResult == 1) {
        const DB = req.app.locals.database;
        await DB.executeQuery(
            `UPDATE Schools AS S right join (SELECT email, acc_status, opened_on FROM Schools UNION ALL ` +
            `SELECT email, acc_status, opened_on FROM Chairpersons) AS X ON S.email = X.email SET ` +
            `S.acc_status = 2, S.opened_on = current_timestamp WHERE S.email = "${req.cookies.help.email}"`
        );
        res.clearCookie("help");
    }
    next();
};

const loginAccount = async function (req, res, next) {
    const DB = req.app.locals.database;
    const email = req.body.email;
    const account = await DB.executeQuery(
        `SELECT id, password, pass_salt, name FROM Schools WHERE ` +
        `email = "${email} AND acc_status = "open" LIMIT 1 UNION ` +
        `SELECT id, password, pass_salt, first_name, middle_name, last_name WHERE ` +
        `email = "${email} AND acc_status = "open" LIMIT 1;`
    );
    
}

module.exports = { createAdmin, openAccount };