const crypto = require("node:crypto");
const ejs = require("ejs");

// middleware functions for handling user accounts

const createAdmin = async function (req, res, next) {
    const DB = req.app.locals.database;
    const email = req.body.email;
    let sameEmails = await DB.executeQuery(
        `SELECT email FROM Users WHERE email = "${email}" AND opened_on IS NOT NULL`
    );
    if (sameEmails.length > 0) {
        res.cookie("serverMessage", {
            mode: 0,
            title: "Invalid e-mail",
            body: "Please enter a different e-mail addess."
        });
        return res.redirect("/signup");
    }

    const accountID = crypto.randomBytes(8).toString("base64url");
    const passSalt = crypto.randomBytes(24).toString("base64");
    const hashPassword = crypto.createHash("sha256").update(req.body.password + passSalt).digest("base64");
    const schoolName = req.body.schoolName;

    await DB.executeQuery(
        `INSERT INTO Users (id, type, email, password, pass_salt) VALUES ` +
        `("${accountID}", 1, "${email}", "${hashPassword}", "${passSalt}") ON DUPLICATE KEY UPDATE ` +
        `id = "${accountID}", password = "${hashPassword}", pass_salt = "${passSalt}"; ` +
        `INSERT INTO Schools VALUES ("${accountID}", "${schoolName}") ON DUPLICATE KEY UPDATE ` +
        `id = "${accountID}", name = "${schoolName}";`
    );
    req.account = true;
    next();
};

const createFaculty = async (req, res, next) => {
    if (!req.account) {
        return res.status(401).end();
    }
    const DB = req.app.locals.database;
    const email = req.body.email;
    let sameEmails = await DB.executeQuery(`SELECT email FROM USERS WHERE email = "${email}"`);

    if (sameEmails.length > 0) {
        return res.status(409).json({
            message: {
                mode: 2,
                title: "Duplicate E-mail",
                body: `'${email}' already belongs to another faculty, enter a different e-mail address.`
            }
        });
    }

    let data = req.body;
    const accountID = crypto.randomBytes(8).toString("base64url");
    const tempPassword = crypto.randomBytes(4).toString("hex").toUpperCase();
    const pass_salt = crypto.randomBytes(24).toString("base64");
    const password = crypto.createHash("sha256").update(tempPassword + pass_salt).digest("base64");

    let totalDeptFaculty = await DB.executeQuery(
        `SELECT COUNT(f.id) FROM Faculty f INNER JOIN Departments d ON f.dept_id = d.id ` +
        `WHERE d.id = '${req.params.deptID}'`
    );
    totalDeptFaculty = totalDeptFaculty[0]["COUNT(f.id)"];
    let accountType = (totalDeptFaculty < 0) ? 3 : 2;
    try {
        await DB.executeQuery(
            `INSERT INTO Users (id, type, email, password, pass_salt) VALUES ("${accountID}", ${accountType}, ` +
            `"${email}", "${password}", "${pass_salt}"); ` +
            `INSERT INTO Faculty VALUES ("${accountID}", "${req.params.deptID}", "${data.faculty_id}", ` +
            `"${data.first_name}", "${data.middle_name}", "${data.last_name}", ${data.teach_load}, "${data.status}");`
        );

        const mailer = req.app.locals.mailer;
        const content = await ejs.renderFile(
            __dirname + "/../views/mail-template/temp-password-email.ejs",
            { password: tempPassword, port: process.env.API_PORT }
        );
        let mailOptions = {
            to: email,
            subject: "Class Timetable Faculty Temporary Password",
            html: content
        };
        mailer.sendEmail(mailOptions);
    } catch (error) {
        console.log(error);
    }
    if (accountType == 2) {
        await DB.executeQuery(
            `UPDATE Departments SET chair_id = "${accountID}" WHERE id = "${req.params.deptID}" LIMIT 1`
        );
    }
    next();
}

const openAdminAccount = async function (req, res, next) {
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
    let accounts = await DB.executeQuery(
        `SELECT id, password, pass_salt, type FROM Users WHERE email = "${email}" LIMIT 3;`
    );
    if (accounts.length < 1) {
        return next();
    }

    for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        const password = crypto.createHash("sha256").update(req.body.password + account["pass_salt"]).digest("base64");
        console.log(password);
        if (password == account["password"]) {
            const type = account["type"];
            req.account = {
                type: type,
                id: account["id"]
            }
            break;
        }
    }
    next();
}

const getAdminData = async function (req, res, next) {
    const user = req.account;
    if (!user) {
        return res.redirect("/login");
    } else if (user.type != "admin") {
        return res.redirect("/" + user.type);
    }

    const DB = req.app.locals.database;
    const task = req.params.task || "profile";
    req.taskData = {};
    if (task == "departments") {
        req.taskData.colleges = await DB.executeQuery(
            `SELECT col.id, col.name FROM Colleges col INNER JOIN Schools s ON col.school_id = s.id ` +
            `WHERE s.id = "${user.id}"`
        );
    } else if (task == "faculty") {
        let colleges = await DB.executeQuery(
            `SELECT col.id, col.name FROM Colleges col INNER JOIN Schools s ON col.school_id = s.id ` +
            `WHERE s.id = "${user.id}"`
        );
        req.taskData.colleges = [];
        for (const college of colleges) {
            let departments = await DB.executeQuery(
                `SELECT d.id, d.name FROM Departments d INNER JOIN Colleges col ON col.id = d.college_id ` +
                `WHERE col.id = "${college.id}"`
            );
            college.departments = departments;
            req.taskData.colleges.push(college);
        }
    } else if (task == "subjects") {
        req.taskData.colleges = await DB.executeQuery(
            `SELECT col.id, col.name FROM Colleges col INNER JOIN Schools s ON col.school_id = s.id ` +
            `WHERE s.id = "${user.id}"`
        );
    }
    next();
}

module.exports = { createAdmin, createFaculty, openAdminAccount, loginAccount, getAdminData };