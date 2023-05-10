const crypto = require("node:crypto");
const ejs = require("ejs");
const { log, table } = require("node:console");

// middleware functions for handling user accounts

const createAdmin = async function (req, res, next) {
    const DB = req.app.locals.database;
    const { email, schoolName, password, termType } = req.body;
    const [{ totalSameEmails }] = await DB.executeQuery(
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
        `INSERT INTO Schools SELECT id, "${schoolName}", ${termType || 2} FROM Users WHERE id = '${accountID}' ` +
        `LIMIT 1 ON DUPLICATE KEY UPDATE name = "${schoolName}", total_terms_yearly = ${termType || 2};`
    );
    req.accountID = accountID;
    next();
};

const createFaculty = async (req, res, next) => {
    const user = req.account;
    if (!user && (user.type == "admin" || user.type == "chair")) {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before creating new department."
            }
        })
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    const email = req.body.email;
    let sameEmails = await DB.executeQuery(`SELECT email FROM Users WHERE email = "${email}"`);

    if (sameEmails.length > 0) {
        return res.status(409).json({
            message: {
                mode: 2,
                title: "Duplicate E-mail",
                body: `<i>${email}</i> already belongs to another user, enter a different e-mail address.`
            }
        });
    }

    let data = req.body;
    const accountID = crypto.randomBytes(8).toString("base64url");
    const tempPassword = crypto.randomBytes(4).toString("hex").toUpperCase();
    const pass_salt = crypto.randomBytes(24).toString("base64");
    const password = crypto.createHash("sha256").update(tempPassword + pass_salt).digest("base64");

    const [{ totalDeptFaculty }] = await DB.executeQuery(
        `SELECT COUNT(f.id) AS totalDeptFaculty FROM Faculty f INNER JOIN Departments d ON f.dept_id = d.id ` +
        `WHERE d.id = '${req.params.deptID}'`
    );

    // if there are no faculty found, the new faculty will automatically be assigned as chairperson
    let accountType = (totalDeptFaculty > 0) ? 3 : 2;
    try {
        await DB.executeQuery(
            `INSERT INTO Users (id, type, email, password, pass_salt) VALUES ("${accountID}", ${accountType}, ` +
            `"${email}", "${password}", "${pass_salt}"); ` +
            `INSERT INTO Faculty VALUES ("${accountID}", "${req.params.deptID}", "${data.faculty_id}", ` +
            `"${data.first_name}", "${data.middle_name}", "${data.last_name}", "${data.status}", ${data.teach_load || 0});`
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

        console.log("Termporary faculty password: " + tempPassword);
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
    const [account] = await req.app.locals.database.executeQuery(
        `SELECT * FROM Users WHERE email = "${req.body.email}";`
    );

    // Check credentials
    if (!account) {
        res.locals.error_title = "Invalid Credentials";
        res.locals.error_body = "You entered the wrong e-mail/password.";
        return next();
    }

    const password = crypto.createHash("sha256").update(req.body.password + account.pass_salt).digest("base64");
    if (password != account.password) {
        res.locals.error_title = "Invalid Credentials";
        res.locals.error_body = "You entered the wrong e-mail/password.";
        return next();
    }

    // Check if (admin) email is verified
    if (account.type == 1 && account.opened_on == null) {
        res.locals.error_title = "Email not verified";
        res.locals.error_body = "Check your email for email verification method";
        return next();
    }

    // Change password if (chair) account is not yet opened
    if (account.type == "chair" && account.opened_on == null) {
        res.locals.change_pass = true
        res.locals.id = account.id
        return next()
    }

    // Remember User
    req.account = {
        type: account.type,
        id: account.id
    }
    next();
}

const getAdminData = async function (req, res, next) {
    const user = req.account;
    if (!user) {
        res.cookie("serverMessage", {
            mode: 0,
            title: "Unauthorized request",
            body: "Please login before accessing admin dashboard."
        })
        return res.redirect("/login");
    } else if (user.type != "admin") {
        return res.redirect("/" + user.type);
    }

    const DB = req.app.locals.database;
    const task = req.params.task || "profile";
    req.taskData = {};
    if (task == "departments") {
        const colleges = await DB.executeQuery(
            `SELECT id, name FROM Colleges WHERE school_id = "${user.id}"`
        );

        let currentCollege = req.params.current;
        if (!currentCollege && colleges.length > 0) {
            req.taskData.currentCollege = colleges[0];
        } else if (colleges.length > 0) {
            currentCollege = currentCollege.split("_").join(" ");
            req.taskData.currentCollege = colleges.find(col => col.name == currentCollege);
        }

        req.taskData.colleges = colleges;
    } else if (task == "faculty") {
        const departments = await DB.executeQuery(
            `SELECT d.id, d.name, col.id AS college_id, col.name AS college_name FROM Colleges col LEFT JOIN ` +
            `Departments d ON col.id = d.college_id WHERE col.school_id = "${user.id}" ORDER BY col.name, d.name`
        );
        console.table(departments);

        req.taskData.colleges = [];
        if (departments.length <= 0) {
            return next();
        }

        const currentDept = req.params.current;
        if (!currentDept) {
            req.taskData.currentDept = departments.find(dept => dept.id != null && dept.name != null);
        } else {
            req.taskData.currentDept = departments.find(dept => {
                return dept.name == currentDept.split("_").join(" ")
            }) || departments.find(dept => dept.id && dept.name);
        }

        let current = departments[0];
        while (departments.length > 0) {
            const currentDepts = departments.filter(dept => dept.college_id == current.college_id);
            req.taskData.colleges.push({
                id: current.college_id,
                name: current.college_name,
                departments: (currentDepts.length > 0 && current.id && current.name) ? currentDepts.map(dept => {
                    delete dept.college_id;
                    delete dept.college_name;
                    return dept;
                }) : []
            });
            departments.splice(0, currentDepts.length);
            current = departments[0];
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
        const { course } = req.query;
        const tableIndex = courses.findIndex(c => c.id == course);

        if (tableIndex >= 1) {
            req.taskData.prev = courses[tableIndex - 1];
            req.taskData.current = courses[tableIndex];
            req.taskData.next = courses[tableIndex + 1];
        } else if (tableIndex == 0) {
            req.taskData.prev = { id: "faculty", title: "Faculty" };
            req.taskData.current = courses[tableIndex];
            req.taskData.next = courses[tableIndex + 1];
        } else if (tableIndex < 0 && courses.length > 0) {
            req.taskData.current = { id: "faculty", title: "Faculty" };
            req.taskData.next = courses[tableIndex + 1];
        } else {
            req.taskData.current = { id: "faculty", title: "Faculty" };
        }

        let [openTerms, closedTerms] = await DB.executeQuery(
            `SELECT t.id, t.year, t.term FROM Terms t INNER JOIN Schools s ON t.school_id = s.id INNER JOIN ` +
            `Colleges col ON s.id = col.school_id INNER JOIN Departments d ON col.id = d.college_id ` +
            `WHERE d.chair_id = "${user.id}" AND t.status = 1 ORDER BY t.year, t.term; ` +
            `SELECT t.id, t.year, t.term FROM Terms t INNER JOIN Schools s ON t.school_id = s.id INNER JOIN ` +
            `Colleges col ON s.id = col.school_id INNER JOIN Departments d ON col.id = d.college_id ` +
            `WHERE d.chair_id = "${user.id}" AND t.status = 0 ORDER BY t.year, t.term;`
        );

        openTerms = openTerms.map(t => ({ ...t, term_ordinal: (t.term == 's') ? 'Summer' : toOrdinal(t.term) + ' Semester' }));
        closedTerms = closedTerms.map(t => ({ ...t, term_ordinal: (t.term == 's') ? 'Summer' : toOrdinal(t.term) + ' Semester' }));

        req.taskData.currentTerm = req.query.term;
        req.taskData.openTerms = openTerms;
        req.taskData.closedTerms = closedTerms;
    }
    next();
};

const getFacultyData = async (req, res, next) => {
    const user = req.account;
    if (!user) {
        return res.redirect("/logout");
    } else if (user.type != "faculty" && user.type != "chair") {
        return res.redirect("/" + user.type);
    }

    if (req.taskData && Object.keys(req.taskData).length > 0) {
        return next();
    }

    const DB = req.app.locals.database;
    req.taskData = { type: user.type };
    const { task } = req.params;

    console.log(task);
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
        let terms = await DB.executeQuery(
            `SELECT p.id as pref_id, t.year, t.term FROM Faculty f INNER JOIN Departments d ON f.dept_id = d.id ` +
            `INNER JOIN Colleges col ON d.college_id = col.id INNER JOIN Terms t ON col.school_id = t.school_id ` +
            `INNER JOIN Preferences p ON t.id = p.term_id AND f.id = p.faculty_id WHERE f.id = '${user.id}' ` +
            `AND p.status = 'pending' ORDER BY t.created_on`
        );

        if (terms.length <= 0) {
            return next();
        }

        terms = terms.map(t => ({ ...t, ordinal_term: (t.term == 's') ? 'Summer' : toOrdinal(t.term) }));

        const termCode = req.query.term;
        let prefFormIndex = 0;

        if (termCode) {
            prefFormIndex = terms.findIndex((({ year, term }) => (year + term) == termCode));
        }

        if (prefFormIndex < 0) {
            prefFormIndex = 0;
        }

        const { term } = terms[prefFormIndex];
        let deptSubjects = await DB.executeQuery(
            `SELECT DISTINCT s.title FROM Curricula cu INNER JOIN Courses co ON cu.course_id = co.id INNER JOIN Departments d ` +
            `ON co.dept_id = d.id INNER JOIN Subjects s ON cu.subj_id = s.id INNER JOIN Colleges col ON ` +
            `d.college_id = col.id AND s.college_id = col.id LEFT JOIN Faculty f ON d.id = f.dept_id WHERE ` +
            `(d.chair_id = '${user.id}' OR f.id = '${user.id}') AND cu.term = '${term}' ORDER BY s.title`
        );
        req.taskData.subjOptions = deptSubjects.map(sub => sub.title);
        console.table(deptSubjects);

        req.taskData.current = terms[prefFormIndex];
        req.taskData.forms = terms;
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
