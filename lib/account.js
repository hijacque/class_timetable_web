const crypto = require("node:crypto");
const ejs = require("ejs");

// middleware functions for handling user accounts

const createAdmin = async function (req, res, next) {
    const DB = req.app.locals.database;
    const {email, schoolName, password, termType} = req.body;
    const [{totalSameEmails}] = await DB.executeQuery(
        `SELECT COUNT(email) as totalSameEmails FROM Users WHERE email = "${email}" AND opened_on IS NOT NULL`
    );
    if (totalSameEmails > 0) {
        res.cookie("serverMessage", {
            mode: 0,
            title: "Invalid e-mail",
            body: "Please enter a different e-mail addess."
        });
        return res.redirect("/signup");
    }

    const accountID = crypto.randomBytes(8).toString("base64url");
    const passSalt = crypto.randomBytes(24).toString("base64");
    const hashPassword = crypto.createHash("sha256").update(password + passSalt).digest("base64");

    await DB.executeQuery(
        `INSERT INTO Users (id, type, email, password, pass_salt) VALUES ` +
        `("${accountID}", 1, "${email}", "${hashPassword}", "${passSalt}") ON DUPLICATE KEY UPDATE ` +
        `id = "${accountID}", password = "${hashPassword}", pass_salt = "${passSalt}"; ` +
        `INSERT INTO Schools SELECT id, "${schoolName}", ${termType || 2} FROM Users WHERE id = '${accountID}' LIMIT 1 ` +
        `ON DUPLICATE KEY UPDATE name = "${schoolName}";`
    );
    req.accountID = accountID;
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
    let accountType = (totalDeptFaculty > 0) ? 3 : 2;
    console.log(totalDeptFaculty, accountType);
    try {
        await DB.executeQuery(
            `INSERT INTO Users (id, type, email, password, pass_salt) VALUES ("${accountID}", ${accountType}, ` +
            `"${email}", "${password}", "${pass_salt}"); ` +
            `INSERT INTO Faculty VALUES ("${accountID}", "${req.params.deptID}", "${data.faculty_id}", ` +
            `"${data.first_name}", "${data.middle_name}", "${data.last_name}", ${data.teach_load || 21}, "${data.status}");`
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
        await mailer.sendEmail(mailOptions);
    } catch (error) {
        console.log(error);
        return await DB.executeQuery(
            `DELETE FROM Faculty WHERE id = '${accountID}'; DELETE FROM Users WHERE id = '${accountID}';`
        );
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
            `UPDATE Users SET opened_on = CURRENT_TIMESTAMP WHERE email = "${req.cookies.help.email}"`
        );
        res.clearCookie("help").clearCookie("otp");
    }
    next();
};

const loginAccount = async function (req, res, next) {
    const DB = req.app.locals.database;
    const email = req.body.email;
    const [account] = await DB.executeQuery(
        `SELECT id, password, pass_salt, type FROM Users WHERE email = "${email}" LIMIT 3;`
    );
    if (!account) {
        return next();
    }

    const password = crypto.createHash("sha256").update(req.body.password + account["pass_salt"]).digest("base64");
    if (password == account["password"]) {
        const type = account["type"];
        req.account = {
            type: type,
            id: account["id"]
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
    } else if (task == "rooms") {
        req.taskData.buildings = await DB.executeQuery(
            `SELECT b.id, b.name FROM Buildings b INNER JOIN Schools s ON b.school_id = s.id ` +
            `WHERE s.id = "${user.id}"`
        );
    }
    next();
}

const getChairData = async (req, res, next) => {
    const user = req.account;
    if (!user) {
        return res.redirect("/login");
    } else if (user.type != "chair") {
        return res.redirect("/" + user.type);
    }

    const DB = req.app.locals.database;
    const task = req.params.task || "profile";
    req.taskData = {};
    if (task == "faculty") {
        let department = await DB.executeQuery(`SELECT name, id from Departments WHERE chair_id = "${user.id}"`);
        req.taskData.department = department[0] || {};
    } else if (task == "courses") {
        const data = await DB.executeQuery(
            `SELECT co.id, co.title FROM Courses co INNER JOIN Departments d ON co.dept_id = d.id ` +
            `WHERE d.chair_id = "${user.id}";` +
            `SELECT s.total_terms_yearly FROM Schools s INNER JOIN Colleges col ON ` +
            `s.id = col.school_id INNER JOIN Departments d ON col.id = d.college_id ` +
            `WHERE d.chair_id = "${user.id}" LIMIT 1;`
        );
        req.taskData.courses = data[0];
        req.taskData.totalTerms = data[1][0]["total_terms_yearly"];
    } else if (task == "schedules") {
        const courses = await DB.executeQuery(
            `SELECT co.id, co.title FROM Courses co INNER JOIN Departments d ON co.dept_id = d.id ` +
            `WHERE d.chair_id = '${user.id}' ORDER by co.title`
        );
        const {course} = req.query;
        const tableIndex = courses.findIndex(c => c.id == course);
        
        if (tableIndex >= 1) {
            req.taskData.prev = courses[tableIndex - 1];
            req.taskData.current = courses[tableIndex];
            req.taskData.next = courses[tableIndex + 1];
        } else if (tableIndex == 0) {
            req.taskData.prev = {id: "faculty", title: "Faculty"};
            req.taskData.current = courses[tableIndex];
            req.taskData.next = courses[tableIndex + 1];
        } else if (tableIndex < 0 && courses.length > 0) {
            req.taskData.current = {id: "faculty", title: "Faculty"};
            req.taskData.next = courses[tableIndex + 1];
        } else {
            req.taskData.current = {id: "faculty", title: "Faculty"};
        }

        let [openTerms, closedTerms] = await DB.executeQuery(
            `SELECT t.id, t.year, t.term FROM Terms t INNER JOIN Schools s ON t.school_id = s.id INNER JOIN ` +
            `Colleges col ON s.id = col.school_id INNER JOIN Departments d ON col.id = d.college_id ` +
            `WHERE d.chair_id = "${user.id}" AND t.status = 1 ORDER BY t.year, t.term; ` +
            `SELECT t.id, t.year, t.term FROM Terms t INNER JOIN Schools s ON t.school_id = s.id INNER JOIN ` +
            `Colleges col ON s.id = col.school_id INNER JOIN Departments d ON col.id = d.college_id ` +
            `WHERE d.chair_id = "${user.id}" AND t.status = 0 ORDER BY t.year, t.term;`
        );
        
        openTerms = openTerms.map(t => ({...t, term_ordinal: (t.term == 's') ? 'Summer' : toOrdinal(t.term) + ' Semester'}));
        closedTerms = closedTerms.map(t => ({...t, term_ordinal: (t.term == 's') ? 'Summer' : toOrdinal(t.term) + ' Semester'}));
        
        req.taskData.currentTerm = req.query.term;
        req.taskData.openTerms = openTerms;
        req.taskData.closedTerms = closedTerms;
    }
    next();
};

const getFacultyData = async (req, res, next) => {
    const user = req.account;
    if (!user) {
        return res.redirect("/login");
    } else if (user.type != "faculty") {
        return res.redirect("/" + user.type);
    }

    const DB = req.app.locals.database;
    req.taskData = {};
    const {task} = req.params;
    
    if (!req.params.task) {
        //
    } else if (task == "schedule") {
        const [currentTerm] = await DB.executeQuery(
            `SELECT t.id, t.year, t.term FROM Faculty f INNER JOIN Departments d ON f.dept_id = d.id INNER JOIN ` +
            `Colleges col ON d.college_id = col.id INNER JOIN Terms t ON col.school_id = t.school_id WHERE ` +
            `f.id = '${user.id}' AND t.status = 'complete' ORDER BY t.year`
        );

        let schedule = [];
        if (currentTerm) {
            schedule = await DB.executeQuery(
                `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
                `AS subject, s.units, co.title AS course, b.year, b.block_no, TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) ` +
                `AS start, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end, sc.day, sc.mode, r.name AS room ` +
                `FROM Schedules sc INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Courses co ON ` +
                `b.course_id = co.id INNER JOIN Departments d ON co.dept_id = d.id LEFT JOIN Subjects s ON ` +
                `sc.subj_id = s.id LEFT JOIN Rooms r ON sc.room_id = r.id WHERE sc.term_id = '${currentTerm.id}' ` +
                `AND sc.faculty_id = '${user.id}' ORDER BY sc.day, sc.start`
            );
            currentTerm.term = (currentTerm.term == 's') ? "Summer" : toOrdinal(currentTerm.term);
            req.taskData = {
                term: currentTerm,
                classes: schedule
            };
        }
    } else if (task == "preference") {
        // TODO: add created_on column in Terms table
        // TODO: update POST terms in API to insert created_on date
        // TODO: get pending preference forms
        
        const termCode = req.query.term;
        const terms = await DB.executeQuery(
            `SELECT p.faculty_id, p.id as pref_id, t.year, t.term FROM Faculty f INNER JOIN Departments d ON f.dept_id = d.id ` +
            `INNER JOIN Colleges col ON d.college_id = col.id INNER JOIN Terms t ON col.school_id = t.school_id ` +
            `INNER JOIN Preferences p ON t.id = p.term_id AND f.id = p.faculty_id WHERE f.id = '${user.id}' ` +
            `AND p.status = 'pending' ORDER BY t.created_on`
        );

        if (terms.length <= 0) {
            return next();
        }

        console.table(terms);

        let prefFormIndex = terms.findIndex(({year, term}) => year + term == termCode);

        if (prefFormIndex < 0) {
            prefFormIndex++;
        }

        if (prefFormIndex >= 1) {
            if (terms.length > 2) {
                req.taskData.prev = terms[prefFormIndex - 1];
                req.taskData.current = terms[prefFormIndex];
                req.taskData.next = terms[prefFormIndex + 1];
            } else {
                req.taskData.prev = terms[prefFormIndex - 1];
                req.taskData.current = terms[prefFormIndex];
            }
        } else if (prefFormIndex == 0) {
            if (terms.length > 1) {
                req.taskData.current = terms[prefFormIndex];
                req.taskData.next = terms[prefFormIndex + 1];
            } else {
                req.taskData.current = terms[prefFormIndex];
            }
        }
        
        Object.values(req.taskData).map((data) => {
            // console.log(data);
            if (data && data.term) {
                data.term = (data.term == 's') ? 'Summer' : toOrdinal(data.term);
            }
        });
        console.log(req.taskData);

        req.taskData.subjOptions = await DB.executeQuery(
            `SELECT DISTINCT s.title FROM Faculty f INNER JOIN Departments d ON f.dept_id = d.id INNER JOIN ` +
            `Colleges col ON d.college_id = col.id INNER JOIN Courses co ON d.id = co.dept_id INNER JOIN ` +
            `Curricula cu ON co.id = cu.course_id INNER JOIN Subjects s ON col.id = s.college_id ` +
            `WHERE f.id = '${user.id}' ORDER BY s.title`
        );
        console.table(req.subjOptions);
    }
    next();
};

function toOrdinal(number) {
    if (number == 1) {
        return number + "<sup>st</sup>";
    } else if (number == 2) {
        return number + "<sup>nd</sup>";
    } else if (number == 3) {
        return number + "<sup>rd</sup>";
    } else if (number > 3) {
        return number + "<sup>th</sup>";
    } else {
        return number;
    }
}

module.exports = { createAdmin, createFaculty, openAdminAccount, loginAccount, getAdminData, getChairData, getFacultyData };