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
        const accountID = crypto.randomBytes(8).toString("base64url");
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
    if (!req.account) {
        return res.status(401).end();
    }
    const DB = req.app.locals.database;
    const email = req.body.email;
    let sameEmails = await DB.executeQuery(
        `SELECT email FROM Schools WHERE id = "${req.account.accID}" AND email = "${email}" UNION ` +
        `SELECT c.email FROM Schools s INNER JOIN Colleges col ON s.id = col.school_id ` +
        `INNER JOIN Departments d ON col.id = d.college_id INNER JOIN Chairpersons c ON ` +
        `d.id = c.div_id WHERE c.email = "${email}" LIMIT 1`
    );
    if (sameEmails.length > 0) {
        return res.status(409).json({ message: {
            mode: 2,
            title: "Duplicate E-mail",
            body: `'${email}' already belongs to another chairperson, enter a different e-mail address.`
        }});
    } else {
        const deptID = crypto.randomBytes(6).toString("base64url");
        const tempPassword = crypto.randomBytes(3).toString("hex");
        const passSalt = crypto.randomBytes(24).toString("base64");
        const hashPassword = crypto.createHash("sha256").update(tempPassword + passSalt).digest("base64");
        
        let firstName = req.body.firstName;
        let lastName = req.body.lastName;
        let middleName = req.body.middleName;
        await DB.executeQuery(
            `INSERT INTO Departments VALUES ('${deptID}', '${req.body.collegeID}', '${req.body.department}') ` +
            `ON DUPLICATE KEY UPDATE name = '${req.body.department}'; ` +
            `INSERT INTO Chairpersons (div_id, last_name, first_name, middle_name, email, password, pass_salt) ` +
            `VALUES ("${deptID}", "${lastName}", "${firstName}", "${middleName}", "${email}", "${hashPassword}", "${passSalt}");`
        );

        next();
        // send temporary password to e-mail
        const mailer = req.app.locals.mailer;
        try {
            const content = await ejs.renderFile(
                __dirname + "/../views/temp-password-email.ejs",
                { password: tempPassword, port: process.env.API_PORT }
            );
            let mailOptions = {
                to: email,
                subject: "Class Timetable Account One-Time-Pin Verification",
                html: content
            };
            mailer.sendEmail(mailOptions);
        } catch (error) {
            console.log(error);
        }
    }
};

const openAccount = async function (req, res, next) {
    const otpResult = req.message;
    if (otpResult && otpResult.mode == 1) {
        const DB = req.app.locals.database;
        await DB.executeQuery(
            `UPDATE Schools AS S right join (SELECT email, acc_status, opened_on FROM Schools UNION ALL ` +
            `SELECT email, acc_status, opened_on FROM Chairpersons) AS X ON S.email = X.email SET ` +
            `S.acc_status = 2, S.opened_on = current_timestamp WHERE S.email = "${req.cookies.help.email}"`
        );
        res.clearCookie("help").clearCookie("otp");
    }
    next();
};

const loginAccount = async function (req, res, next) {
    const DB = req.app.locals.database;
    const email = req.body.email;
    let account = await DB.executeQuery(
        `SELECT id, password, pass_salt, "admin" AS type FROM Schools WHERE ` +
        `email = "${email}" AND acc_status = "open" UNION ` +
        `SELECT div_id, password, pass_salt, "chair" AS type FROM Chairpersons ` +
        `WHERE email = "${email}" AND acc_status = "open"`
    );
    if (account.length < 1) {
        req.message = {
            title: "Invalid Credentials",
            body: "You entered incorrect email/password.",
            mode: 0
        }
    } else {
        account = account[0];
        const password = crypto.createHash("sha256").update(req.body.password + account["pass_salt"]).digest("base64");
        if (password == account["password"]) {
            req.account = {
                type: account["type"],
                id: account["id"] || account["div_id"]
            }
        }
    }
    next();
}

const getAdminData = async function (req, res, next) {
    // TODO: distinguish admin tasks and access DB according to page
    const user = req.account;
    if (user && user.type == "admin") {
        const DB = req.app.locals.database;
        const task = req.params.task || "profile";
        req.taskData = {};
        if (task == "departments") {
            req.taskData.colleges = await DB.executeQuery(
                `SELECT col.id, col.name FROM Colleges col INNER JOIN Schools s ON col.school_id = s.id ` +
                `WHERE s.id = "${user.accID}"`
            );
        } else if (task == "faculty") {

        }
    }
    next();
}

module.exports = { createAdmin, createChair, openAccount, loginAccount, getAdminData };