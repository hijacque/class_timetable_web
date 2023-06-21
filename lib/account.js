const crypto = require("crypto");
const ejs = require("ejs");
const jwt = require("jsonwebtoken");
const { convertMinutesTime, toWeekDay, toOrdinal } = require("./../lib/time-conversion");

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

    // for verifying account in the system
    req.account = {
        id: accountID,
        type: "admin",
        email: email,
        subHelp: "/open-account/admin" // route where to open adin account
    };

    req.otpMessage = "Hi! Here is your OTP to activate your class timetable account.";
    next();
};

const createFaculty = async (req, res, next) => {
    const user = req.account;
    if (!user || (user.type != "admin" && user.type != "chair")) {
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
        console.log(sameEmails);
        return res.status(409).json({
            message: {
                mode: 2,
                title: "Duplicate E-mail",
                body: `<b>${email}</b> already belongs to another user, enter a different e-mail address.`
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

    // if there are no existing faculty in the department, 
    // the new faculty will automatically be assigned as chairperson
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
            { password: tempPassword, loginLink: `http://${process.env.API_DOMAIN}/login` }
        );
        let mailOptions = {
            to: email,
            subject: "Class Timetable Faculty Temporary Password",
            html: content
        };
        await mailer.sendEmail(mailOptions);

        console.log("Termporary faculty password: " + tempPassword);
        const openTerms = await DB.executeQuery(
            `SELECT DISTINCT t.id AS term_id, NULL AS pref_id, '${accountID}' AS faculty_id, p.deadline FROM Departments d INNER JOIN Colleges col ON d.college_id = col.id ` +
            `INNER JOIN Terms t ON col.school_id = t.school_id LEFT JOIN Preferences p ON t.id = p.id ` +
            `WHERE d.chair_id = '${user.id}' OR col.school_id = '${user.id}' GROUP BY t.id, d.id, p.deadline`
        );
        
        if (openTerms.length > 0) {
            console.log("Adding preference record...");
            for (const term of openTerms) {
                term.pref_id = crypto.randomBytes(6).toString("base64url");
                term.faculty_id = accountID;
            }
            console.table(openTerms);
            console.log(
                `INSERT INTO Preferences (term_id, id, faculty_id, deadline) VALUES ` +
                `('${openTerms.map(t => Object.values(t).join("', '")).join("'), ('")}')`
            );
            await DB.executeQuery(
                `INSERT INTO Preferences (term_id, id, faculty_id, deadline) VALUES ` +q
                `('${openTerms.map(t => Object.values(t).join("', '")).join("'), ('")}')`
            );
        }
    } catch (error) {
        console.log(error);
        await DB.executeQuery(
            `DELETE FROM Faculty WHERE id = '${accountID}'; DELETE FROM Users WHERE id = '${accountID}';`
        );
        return res.status(500).json({
            message: {
                mode: 0,
                title: "Server error",
                body: "We were unable to create the faculty account, please try again later."
            }
        });
    }
    if (accountType == 2) {
        await DB.executeQuery(
            `UPDATE Departments SET chair_id = "${accountID}" WHERE id = "${req.params.deptID}" LIMIT 1`
        );
        return res.status(200).json({
            message: {
                mode: 1,
                title: "Chairperson signed up",
                body: "A temporary password was sent to their e-mail address."
            }
        });
    }
    next();
}

const openAdminAccount = async function (req, res, next) {
    if (req.account) {
        const DB = req.app.locals.database;
        await DB.executeQuery(
            `UPDATE Users SET opened_on = CURRENT_TIMESTAMP WHERE id = "${req.account.id}"`
        );
    }
    next();
};

const loginAccount = async function (req, res, next) {
    const [account] = await req.app.locals.database.executeQuery(
        `SELECT * FROM Users WHERE email = "${req.body.email}";`
    );

    if (req.signedCookies.helpID || req.cookies.helpID) res.clearCookie("helpID");

    // Check if account exists
    if (!account) {
        res.locals.error_title = "Account does not exist";
        res.locals.error_body = "There is no account with that email, try signing up now.";
        return next();
    }

    // Check credentials
    const password = crypto.createHash("sha256").update(req.body.password + account.pass_salt).digest("base64");
    if (password != account.password) {
        res.locals.error_title = "Invalid Credentials";
        res.locals.error_body = "You entered the wrong e-mail/password.";
        return next();
    }

    // Check if (admin) email is verified
    if (account.type == "admin" && account.opened_on == null) {
        res.locals.error_title = "Email not verified";
        res.locals.error_body = "Check your email for email verification method";
        return next();
    }

    // Change password if (chair/faculty) account is not yet opened
    // Hindi kasama admin kasi signup ginagamit nila
    if (account.opened_on == null) {
        req.change_pass = true;
        res.locals.id = account.id;

        // create new different helpID for changing password
        res.cookie("helpID", jwt.sign({
            type: account.type,
            id: account.id,
            email: account.email,
            subHelp: "/help/change-password"
        }, process.env.HELP_KEY, { expiresIn: "3m" }),
            { httpOnly: true, signed: true });
        return res.status(200).json({ redirect: "/help/change-password" });
    } else if (account.type == "chair") {
        res.cookie("ctsActivity", "Logged in");
    }

    // Remember User
    req.account = {
        type: account.type,
        id: account.id,
        email: account.email,
        subHelp: "/verify"
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
        return res.redirect("/logout");
    } else if (user.type != "admin") {
        return res.redirect("/" + user.type);
    }

    const DB = req.app.locals.database;
    const task = req.params.task || "profile";
    req.taskData = {};
    if (task == "departments") {
        const colleges = await DB.executeQuery(
            `SELECT id, name FROM Colleges WHERE school_id = "${user.id}" ORDER BY name`
        );

        let currentCollege = req.params.current;
        if (!currentCollege && colleges.length > 0) {
            req.taskData.currentCollege = colleges[0];
        } else if (colleges.length > 0) {
            currentCollege = currentCollege.split("_").join(" ");
            req.taskData.currentCollege = colleges.find(col => col.name == currentCollege);
        }

        req.taskData.colleges = colleges || [];
    } else if (task == "faculty") {
        const departments = await DB.executeQuery(
            `SELECT d.id, d.name, d.chair_id, col.id AS college_id, col.name AS college_name FROM Colleges col LEFT JOIN ` +
            `Departments d ON col.id = d.college_id WHERE col.school_id = "${user.id}" ORDER BY col.name, d.name`
        );

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

        req.taskData.colleges = [];
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
        const colleges = await DB.executeQuery(
            `SELECT col.id, col.name FROM Colleges col INNER JOIN Schools s ON col.school_id = s.id ` +
            `WHERE s.id = "${user.id}" ORDER BY col.name`
        );

        const currentCollege = req.params.current;
        if (currentCollege) {
            req.taskData.currentCollege = colleges.find(col => currentCollege == col.name.split(" ").join("_"));
        } else {
            req.taskData.currentCollege = colleges[0];
        }
        req.taskData.colleges = colleges;
    } else if (task == "rooms") {
        const buildings = await DB.executeQuery(
            `SELECT b.id, b.name FROM Buildings b INNER JOIN Schools s ON b.school_id = s.id ` +
            `WHERE s.id = "${user.id}"`
        );

        if (buildings.length > 0) {
            const currentBldg = req.params.current;
            if (!currentBldg) {
                req.taskData.currentBldg = buildings[0];
            } else {
                req.taskData.currentBldg = buildings.find(({ name }) => name == currentBldg.split("_").join(" "));
            }
        }

        req.taskData.buildings = buildings;
    }
    next();
}

const getChairData = async (req, res, next) => {
    const user = req.account;
    if (!user) {
        return res.redirect("/logout");
    } else if (user.type != "chair") {
        return res.redirect("/" + user.type);
    }

    const DB = req.app.locals.database;
    const task = req.params.task || "profile";
    req.taskData = {};
    if (task == "faculty") {
        let department = await DB.executeQuery(`SELECT name, id from Departments WHERE chair_id = "${user.id}"`);
        req.taskData.department = department[0];
    } else if (task == "courses") {
        const [courses, [termType]] = await DB.executeQuery(
            `SELECT co.id, co.title FROM Courses co INNER JOIN Departments d ON co.dept_id = d.id ` +
            `WHERE d.chair_id = "${user.id}" ORDER BY co.title;` +
            `SELECT s.total_terms_yearly FROM Schools s INNER JOIN Colleges col ON ` +
            `s.id = col.school_id INNER JOIN Departments d ON col.id = d.college_id ` +
            `WHERE d.chair_id = "${user.id}" LIMIT 1;`
        );

        let currentCourse = req.params.current;
        if (currentCourse && courses.length > 0) {
            currentCourse = courses.find(co => currentCourse == co.title.split(" ").join("_")) || courses[0];
        } else if (courses.length > 0) {
            currentCourse = courses[0];
        }

        if (currentCourse) {
            const [{ schoolID }] = await DB.executeQuery(
                `SELECT col.school_id AS schoolID FROM Departments d INNER JOIN Colleges col ON d.college_id = col.id ` +
                `WHERE d.chair_id = '${user.id}' LIMIT 1`
            );

            req.taskData.subjects = await DB.executeQuery(
                `SELECT DISTINCT s.id, s.code, CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ` +
                `ELSE s.title END AS title, CASE WHEN cu.course_id = '${currentCourse.id}' THEN 1 ELSE ` +
                `0 END AS taken FROM Curricula cu RIGHT JOIN Subjects s ON cu.subj_id = s.id INNER JOIN ` +
                `Colleges col ON s.college_id = col.id WHERE col.school_id = '${schoolID}' AND ` +
                `(cu.course_id = '${currentCourse.id}' OR cu.course_id IS NULL) ORDER BY title, s.code`
            );

            console.table(req.taskData.subjects);
        }

        req.taskData.currentCourse = currentCourse;
        req.taskData.courses = courses;
        req.taskData.totalTerms = termType["total_terms_yearly"];
    } else if (task == "schedules") {
        const [courses, [{department}]] = await DB.executeQuery(
            `SELECT co.id, CONCAT(co.title, ' Blocks') AS title FROM Courses co INNER JOIN Departments d ON co.dept_id = d.id ` +
            `WHERE d.chair_id = '${user.id}' ORDER by co.title; ` +

            `SELECT name AS department FROM Departments WHERE chair_id = '${user.id}' LIMIT 1;`
        );
        
        courses.unshift({ id: "faculty", title: department + " Faculty" });

        const { course } = req.query;
        const tableIndex = courses.findIndex(c => course == c.title.split(" ").join("_"));
        
        req.taskData.current = courses[tableIndex] || courses[0];
        console.log(req.taskData.current);
        
        let terms = await DB.executeQuery(
            `SELECT t.id, t.year, t.term, SUM(pr.sched_status IN ('open', 'saved', 'posted')) AS totalFaculty, ` +
            `SUM(pr.sched_status = 'saved') AS totalSaved, SUM(pr.sched_status = 'posted') AS totalPosted, ` +
            `DATE_FORMAT(pr.deadline, '%Y-%m-%d') AS deadline_date, DATE_FORMAT(pr.deadline, '%H:%i') AS ` +
            `deadline_time FROM Terms t INNER JOIN Preferences pr ON t.id = pr.term_id INNER JOIN Faculty f ON ` +
            `pr.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id ` +
            `WHERE d.chair_id = "${user.id}" GROUP BY t.id, pr.deadline ORDER BY t.year DESC, t.term DESC`
        );
        console.table(terms);

        terms = terms.map(t => ({
            ...t, term_ordinal: (t.term == 's') ? 'Summer' : toOrdinal(t.term),
            isPosted: t.totalPosted == t.totalFaculty,
            isSaved: t.totalSaved == t.totalFaculty,
        }));

        const [{ totalTerms }] = await DB.executeQuery(
            `SELECT DISTINCT s.total_terms_yearly AS totalTerms FROM Departments d INNER JOIN Colleges col ON ` +
            `d.college_id = col.id INNER JOIN Schools s ON col.school_id = s.id WHERE d.chair_id = '${user.id}'`
        );

        req.taskData.semesters = [];
        for (let i = 1; i <= totalTerms; i++) {
            req.taskData.semesters.push(toOrdinal(i));
        }

        req.taskData.terms = terms;
        req.taskData.tables = courses;

        if (req.params.current) {
            req.taskData.currentTerm = terms.find(({ year, term }) => year + term == req.params.current) || terms [0];
        }
        
        if (!req.taskData.currentTerm && terms.length > 0) {
            return res.redirect("/chair/schedules/" + terms[0].year + terms[0].term);
        } else if (terms.length <=  0) {
            return next();
        }
        console.table(courses)
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

    if (!task) {
        //
    } else if (task == "consultation") {
        await DB.executeQuery(
            `SELECT start, end, day FROM ConsultationHours WHERE faculty_id = '${user.id}' ORDER BY day`
        ).then((data) => {
            const consultHours = [];
            for (let i = 1; i <= 7; i++) {
                if (!data[0] || data[0].day != i) {
                    consultHours.push({ day: toWeekDay(i), unassigned: 1 });
                    continue;
                }

                let { day, start, end } = data[0];
                data[0].day = toWeekDay(day);
                data[0].start = convertMinutesTime(start);
                data[0].end = convertMinutesTime(end);
                consultHours.push(data.shift());
            }
            req.taskData.consultation = consultHours;
        });
    } else if (task == "schedule") {
        let postedTerms = await DB.executeQuery(
            `SELECT t.id, t.year, t.term FROM Preferences pr INNER JOIN Terms t ON pr.term_id = t.id WHERE ` +
            `pr.faculty_id = '${user.id}' AND pr.sched_status = 'posted' ORDER BY t.year DESC, t.term DESC`
        );

        if (postedTerms.length <= 0) {
            return next();
        }

        postedTerms = postedTerms.map(t => ({ ...t, ordinal_term: (t.term == 's') ? "Summer" : toOrdinal(t.term) }));

        let currentIndex = 0;
        if (req.params.current) {
            currentIndex = postedTerms.findIndex(t => (t.id + t.term) == req.params.current) || postedTerms[0];
        }

        let schedule = [];
        if (currentIndex >= 0) {
            let currentTerm = postedTerms[currentIndex];
            schedule = await DB.executeQuery(
                `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
                `AS subject, s.units, co.title AS course, b.year, b.block_no, TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) ` +
                `AS start, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end, sc.day, sc.mode, sc.block_id, sc.subj_id, r.name AS room ` +
                `FROM Schedules sc INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Courses co ON ` +
                `b.course_id = co.id INNER JOIN Departments d ON co.dept_id = d.id LEFT JOIN Subjects s ON ` +
                `sc.subj_id = s.id LEFT JOIN Rooms r ON sc.room_id = r.id WHERE sc.term_id = '${currentTerm.id}' ` +
                `AND sc.faculty_id = '${user.id}' ORDER BY sc.subj_id, sc.block_id`
            ).then((data) => {
                const colors = [...new Set(data.map(sched => sched.subj_id + sched.block_id))];
                let i = 1;
                req.taskData.current = {
                    term: currentTerm,
                    classes: data.map((sched) => {
                        sched.color = (sched.subj_id + sched.block_id == colors[i - 1]) ?
                            "hsl(" + (i * (360 / colors.length) % 360) + ",70%,75%)" :
                            "hsl(" + (++i * (360 / colors.length) % 360) + ",70%,75%)";
                        return sched;
                    }) || []
                };
                console.table(req.taskData.current.classes);
            });
        } else if (postedTerms.length > 0) {
            currentIndex = 0;
            return res.redirect("schedule/" + postedTerms[currentIndex].year +  postedTerms[currentIndex].term);
        }

        req.taskData.currentTerm = postedTerms[currentIndex];
        req.taskData.terms = postedTerms;
    } else if (task == "preference") {
        let forms = await DB.executeQuery(
            `SELECT p.id as pref_id, t.year, t.term, CONCAT(MONTHNAME(p.deadline), ' ', DAY(p.deadline), ', ', ` +
            `YEAR(p.deadline)) AS deadline_date, DATE_FORMAT(p.deadline, '%h:%i %p') AS deadline_time, ` +
            `UPPER(p.status) AS status FROM Faculty f INNER JOIN Departments d ON f.dept_id = d.id INNER JOIN ` +
            `Colleges col ON d.college_id = col.id INNER JOIN Terms t ON col.school_id = t.school_id INNER JOIN ` +
            `Preferences p ON t.id = p.term_id AND f.id = p.faculty_id WHERE f.id = '${user.id}' AND ` +
            `CURRENT_TIMESTAMP < p.deadline ORDER BY t.created_on`
        );

        if (forms.length <= 0) {
            return next();
        }

        forms = forms.map(t => ({ ...t, ordinal_term: (t.term == 's') ? 'Summer' : toOrdinal(t.term) }));

        const termCode = req.params.current;
        let current = 0;

        if (termCode) {
            current = forms.findIndex((({ year, term }) => (year + term) == termCode));
        } else if (forms.length > 0) {
            current = forms.find((({ status }) => status == 'PENDING')) || forms[0];
            return res.redirect(`/${user.type}/preference/${current.year + current.term}`);
        }

        const { term } = forms[current];
        let deptSubjects = await DB.executeQuery(
            `SELECT DISTINCT s.title FROM Curricula cu INNER JOIN Courses co ON cu.course_id = co.id INNER JOIN Departments d ` +
            `ON co.dept_id = d.id INNER JOIN Subjects s ON cu.subj_id = s.id INNER JOIN Colleges col ON ` +
            `d.college_id = col.id AND s.college_id = col.id LEFT JOIN Faculty f ON d.id = f.dept_id WHERE ` +
            `(d.chair_id = '${user.id}' OR f.id = '${user.id}') AND cu.term = '${term}' ORDER BY s.title`
        );
        deptSubjects = deptSubjects.map(sub => sub.title);

        req.taskData.current = forms[current] || forms[0];
        
        if (forms[current].status == 'SUBMITTED') {
            await DB.executeQuery(
                `SELECT DISTINCT s.title FROM PrefSubjects ps INNER JOIN Subjects s ON ps.subj_id = s.id ` +
                `WHERE ps.pref_id = '${forms[current].pref_id}' ORDER BY s.title; ` +

                `SELECT * FROM PrefSchedules WHERE pref_id = '${forms[current].pref_id}' ORDER BY day;`
            ).then(([subjects, schedules]) => {
                req.taskData.current.subjects = subjects.map(subj => subj.title);
                schedules = schedules.map((sc) => (
                    { ...sc, start_time: convertMinutesTime(sc.start), end_time: convertMinutesTime(sc.end) }
                ));
                for (let i = 0; i < 7; i++) {
                    if (!schedules[i] || schedules[i].day != (i + 1)) {
                        schedules.splice(i, 0, { day: toWeekDay(i + 1) });
                    } else {
                        schedules[i].day = toWeekDay(i + 1);
                    }
                }
                req.taskData.current.schedules = schedules;
                console.table(schedules);
            });
        } else {
            let schedules = [];
            for (let i = 1; i <= 7; i++) {
                schedules.push({ day: toWeekDay(i) });
            }
            req.taskData.current.schedules = schedules;
        }

        req.taskData.subjOptions = deptSubjects;
        req.taskData.forms = forms;
    }
    next();
};

module.exports = { createAdmin, createFaculty, openAdminAccount, loginAccount, getAdminData, getChairData, getFacultyData };
