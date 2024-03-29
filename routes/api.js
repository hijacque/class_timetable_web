const router = require("express").Router();

const crypto = require("crypto");
const fs = require("fs");
const csv = require("csv-parser");
const multer = require("multer");
const ejs = require("ejs");

const { verifySession } = require("./../lib/verification");
const { createFaculty } = require("./../lib/account");
const { saveFacultySchedule, unsaveFacultySchedule } = require("./../lib/schedule");
const { convertMinutesTime, toWeekDay, toOrdinal, monthNames } = require("./../lib/time-conversion");

// Configure multer to handle file uploads
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage });

// for CRUD purposes, sub-directly controlled from client side
router.use(verifySession);

// for admin control
router.route("/departments/:collegeID?")
    .get(async (req, res) => { // gets departments per college
        // check user credentials
        const user = req.account;
        if (!user || user.type != "admin") {
            res.cookie("serverMessage", {
                message: {
                    mode: 0,
                    title: "Unauthorized request",
                    body: "Please login before accessing admin dashboard."
                }
            })
            return res.status(401).json({ redirect: "/logout" });
        }

        const DB = req.app.locals.database;
        let query = `SELECT d.id, d.name AS department, CASE WHEN d.chair_id IS NULL THEN "To be assigned..." ELSE ` +
            `CONCAT(f.last_name, ", ", f.first_name, " ", f.middle_name) END AS ` +
            `chairperson, d.chair_id FROM Schools s INNER JOIN Colleges col ON ` +
            `s.id = col.school_id INNER JOIN Departments d ON col.id = d.college_id LEFT JOIN Faculty f ON ` +
            `d.chair_id = f.id WHERE s.id = "${user.id}"`;

        if (req.params.collegeID) {
            // get departments in specific college
            query += ` AND col.id = "${req.params.collegeID}"`;
        }
        query += " ORDER BY d.name";

        res.status(200).json({ departments: await DB.executeQuery(query) });

    }).post(async (req, res) => { // creates new department
        // check user credentials
        const user = req.account;
        if (!user || user.type != "admin") {
            res.cookie("serverMessage", {
                message: {
                    mode: 0,
                    title: "Unauthorized request",
                    body: "Please login before updating a department."
                }
            })
            return res.status(401).json({ redirect: "/logout" });
        }

        const deptName = req.body.department;
        if (!req.params.collegeID || !deptName) {
            return res.status(400).json({
                message: {
                    mode: 2,
                    title: "Missing requirement/s",
                    body: "A name is needed to create new department.",
                }
            });
        }

        const DB = req.app.locals.database;
        const deptID = crypto.randomBytes(6).toString("base64url");
        await DB.executeQuery(
            `INSERT INTO Departments (id, college_id, name) VALUES ('${deptID}', ` +
            `'${req.params.collegeID}', '${req.body.department}')`
        );
        console.log("creating new department ID: " + deptID);
        res.status(200).json({
            message: {
                mode: 1,
                title: "New Department created",
                body: "You can now add faculty members in the department and assign a chairperson."
            }
        });
    });

router.post("/department/:deptID?", async (req, res) => { // updates department info (name and/or chairperson)
    const user = req.account;
    if (!user || user.type != "admin") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before updating department name or chairperson."
            }
        });
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    let newChairID;
    if (req.body.chair) {
        let [lastName, chairID] = req.body.chair.split("(");
        lastName = lastName.split(",")[0];
        chairID = chairID.slice(0, -1);
        console.log(lastName, chairID);
        [newChairID] = await DB.executeQuery(
            `SELECT id FROM Faculty WHERE faculty_id = '${chairID}' AND last_name = '${lastName}' ` +
            `AND dept_id = '${req.params.deptID}' LIMIT 1;`
        );

        if (!newChairID) {
            return res.status(404).json({
                message: {
                    mode: 2,
                    title: "Faculty not found",
                    body: "Unable to change chairperson because candidate faculty was not found."
                }
            });
        }

        newChairID = newChairID.id;
    }

    try {
        await DB.executeQuery(
            // change old chairperson to faculty account type
            `UPDATE Users u LEFT JOIN Departments d ON u.id = d.chair_id SET type = 3 WHERE u.id = d.chair_id AND ` +
            `d.id = '${req.params.deptID}' LIMIT 1;` +

            // change account type of new chair
            (newChairID ? `UPDATE Users SET type = 2 WHERE id = "${newChairID}" LIMIT 1;` : "") +

            // replace old chairperson in departments table
            `UPDATE Departments d INNER JOIN Colleges col ON d.college_id = col.id ` +
            `SET d.chair_id = "${newChairID}" ${req.body.deptName ? `d.name = '${req.body.deptName}' ` : ''}` +
            `WHERE d.id = "${req.params.deptID}" AND col.school_id = "${user.id}" LIMIT 1;`
        );
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            message: {
                mode: 0,
                title: "Chairperson not changed",
                body: "An error occured and the chairperson was unable to be changed."
            }
        })
    }

    res.status(200).cookie("serverMessage", {
        mode: 1,
        title: "Chairperson changed",
        body: "All privileges have been transferred to the new chairperson."
    }).end();
});

router.post("/colleges", async (req, res) => { // creates new college
    // check user credentials
    const user = req.account;
    if (!user || user.type != "admin") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before creating new college."
            }
        })
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    const [{ totalDuplicates }] = await DB.executeQuery(
        `SELECT COUNT(*) AS totalDuplicates FROM Colleges WHERE school_id = '${req.account.id}' AND name = '${req.body.name}'`
    );
    if (totalDuplicates > 0) {
        return res.status(409).json({
            message: {
                mode: 2,
                title: "Duplicate college name",
                body: "Could not add college with same name"
            }
        });
    }

    const collegeID = crypto.randomBytes(6).toString("base64url");
    await DB.executeQuery(
        `INSERT INTO Colleges VALUES ('${collegeID}', '${req.account.id}', '${req.body.name}')`
    );
    res.status(200).json({
        message: {
            mode: 1,
            title: "New College Created",
            body: `${req.body.name} is ready for new departments.`
        }
    });
});

router.route("/faculty/:deptID?")
    .get(async (req, res) => { // gets faculty per department
        // check user credentials
        const user = req.account;
        if (!user || (user.type != "admin" && user.type != "chair")) {
            res.cookie("serverMessage", {
                message: {
                    mode: 0,
                    title: "Unauthorized request",
                    body: "Please login before accessing admin dashboard."
                }
            })
            return res.status(401).json({ redirect: "/logout" });
        }

        const DB = req.app.locals.database;
        let { columns } = req.query;
        const validColumns = ['faculty_id', 'teach_load', 'status', 'first_name', 'middle_name', 'last_name'];
        let query;

        if (!columns) {
            query = `SELECT f.${validColumns.join(", f.")}, `;
        } else if (columns.every(col => validColumns.includes(col))) {
            // specifies what columns to get
            query = `SELECT f.${columns.join(", f.")}, `;
        } else {
            return res.status(400).json({
                message: {
                    mode: 0,
                    title: "Invalid faculty column data",
                    body: "You requested invalid column/s for faculty data."
                }
            });
        }

        let consultHours = [];
        await DB.executeQuery(
            `SELECT ch.* FROM ConsultationHours ch INNER JOIN Faculty f ON ch.faculty_id = f.id INNER JOIN ` +
            `Departments d ON f.dept_id = d.id INNER JOIN Colleges col ON d.college_id = col.id WHERE ` +
            `d.chair_id = '${user.id}' OR col.school_id = '${user.id}' ORDER BY ch.faculty_id`
        ).then((data) => {
            if (data.length <= 0) {
                return;
            }

            let current = { faculty: data[0].faculty_id, hours: [] };
            for (const consult of data) {
                if (current.faculty == consult.faculty_id) {
                    delete consult.faculty_id;
                    current.hours.push(
                        `${toWeekDay(consult.day, true).toUpperCase()} ${convertMinutesTime(consult.start, false)}` +
                        `${consult.start >= 720 ? 'PM' : 'AM'} - ${convertMinutesTime(consult.end, false)}` +
                        `${consult.end >= 720 ? 'PM' : 'AM'}`
                    );
                } else {
                    consultHours.push(current);
                    current = {
                        faculty: consult.faculty_id, hours: [
                            `${toWeekDay(consult.day, true).toUpperCase()} ${convertMinutesTime(consult.start, false)}` +
                            `${consult.start >= 720 ? 'PM' : 'AM'} - ${convertMinutesTime(consult.end, false)}` +
                            `${consult.end >= 720 ? 'PM' : 'AM'}`
                        ]
                    };
                }
            }
            consultHours.push(current);
        });

        query += `f.id, u.email, CASE WHEN f.id = d.chair_id THEN 1 ELSE 0 END AS is_chair FROM ` +
            `Colleges col INNER JOIN Departments d ON col.id = d.college_id INNER JOIN Faculty f ON ` +
            `d.id = f.dept_id INNER JOIN Users u ON f.id = u.id ` +
            `WHERE (col.school_id = "${user.id}" OR d.chair_id = "${user.id}")`;
        if (req.params.deptID) {
            query += ` AND d.id = "${req.params.deptID}"`
        }
        query += " ORDER BY f.status, f.last_name, f.first_name, f.middle_name";

        await DB.executeQuery(query).then((data) => {
            res.status(200).json({
                faculty: data.map((fac) => {
                    let consult = consultHours.find((ch) => fac.id == ch.faculty);
                    return { ...fac, consultation: consult ? consult.hours.join("<br>") : "" };
                })
            });
        });

    }).post(createFaculty, (req, res) => { // creates new faculty in
        res.status(200).end();
    });

router.route("/subjects/:collegeID?")
    .get(async (req, res) => { // gets subjects offered per college
        // check user credentials
        const user = req.account;
        if (!user || user.type != "admin") {
            res.cookie("serverMessage", {
                message: {
                    mode: 0,
                    title: "Unauthorized request",
                    body: "Please login before accessing admin dashboard."
                }
            })
            return res.status(401).json({ redirect: "/logout" });
        }

        const DB = req.app.locals.database;
        let query = `SELECT sub.code, sub.title, sub.units, sub.req_hours, sub.type, sub.pref_rooms FROM Subjects sub ` +
            `INNER JOIN Colleges col ON sub.college_id = col.id AND col.school_id = '${user.id}'`
        if (req.params.collegeID) {
            query += ` AND col.id = "${req.params.collegeID}"`
        }
        query += " ORDER BY sub.title, sub.type"
        res.status(200).json({ subjects: await DB.executeQuery(query) });
    })
    .post(async (req, res) => { // adds new subject in a college
        // check user credentials
        const user = req.account;
        if (!user || user.type != "admin") {
            res.cookie("serverMessage", {
                message: {
                    mode: 0,
                    title: "Unauthorized request",
                    body: "Please login before adding new subject."
                }
            })
            return res.status(401).json({ redirect: "/logout" });
        }

        const DB = req.app.locals.database;
        let { code, title, type, units, req_hours, pref_rooms } = req.body;

        type = (type == "LEC") ? 1 : (type == "LAB") ? 2 : "NULL";
        const [{ totalDuplicates }] = await DB.executeQuery(
            `SELECT COUNT(*) AS totalDuplicates FROM Subjects s INNER JOIN Colleges col ON s.college_id = col.id ` +
            `WHERE col.school_id = '${user.id}' AND s.code = '${code}' OR (s.title = '${title}' AND s.type = ${type})`
        );

        if (totalDuplicates > 0) {
            return res.status(409).json({
                message: {
                    mode: 2,
                    title: "Duplicate subject",
                    body: "Subject with same title, type, and/or code already exists."
                }
            });
        }

        const subjID = crypto.randomBytes(6).toString("base64url");
        await DB.executeQuery(
            `INSERT INTO Subjects VALUES ('${subjID}', '${req.params.collegeID}', '${code}', '${title}', ` +
            `${type}, ${units || 0}, ${req_hours || 0}, '${pref_rooms}')`
        );
        res.status(200).end();
    });

router.route("/rooms/:bldgID?")
    .get(async (req, res) => { // gets rooms in chosen building
        // check user credentials
        const user = req.account;
        if (!user || user.type != "admin") {
            res.cookie("serverMessage", {
                message: {
                    mode: 0,
                    title: "Unauthorized request",
                    body: "Please login before accessing admin dashboard."
                }
            })
            return res.status(401).json({ redirect: "/logout" });
        }

        const DB = req.app.locals.database;
        let query = `SELECT r.name, r.level, r.capacity FROM Rooms r INNER JOIN Buildings b ON r.bldg_id = b.id ` +
            `WHERE b.school_id = '${req.account.id}'`;
        if (req.params.bldgID) {
            query += ` AND b.id = "${req.params.bldgID}"`;
        }
        query += ` ORDER BY r.level, r.name`;
        res.status(200).json({ rooms: await DB.executeQuery(query) });
    })
    .post(async (req, res) => { // adds a room building
        // check user credentials
        const user = req.account;
        if (!user || user.type != "admin") {
            res.cookie("serverMessage", {
                message: {
                    mode: 0,
                    title: "Unauthorized request",
                    body: "Please login as admin before adding a class"
                }
            })
            return res.status(401).json({ redirect: "/logout" });
        }

        const DB = req.app.locals.database;
        let { name, level, capacity } = req.body;

        const roomID = crypto.randomBytes(6).toString("base64url");
        if (name && level) {
            await DB.executeQuery(
                `INSERT INTO Rooms VALUES ('${req.params.bldgID}', '${roomID}', '${name}', ` +
                `${level}, ${capacity || "NULL"})`
            );
        }

        res.status(200).json({
            message: {
                mode: 1,
                title: "New Room Created",
                body: `${name} is open for new class schedules.`
            }
        });
    });

router.post("/buildings", async (req, res) => { // adds school building
    // check user credentials
    const user = req.account;
    if (!user || user.type != "admin") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login as before adding a school building"
            }
        })
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    const bldgID = crypto.randomBytes(6).toString("base64url");
    await DB.executeQuery(
        `INSERT INTO Buildings VALUES ('${bldgID}', '${user.id}', '${req.body.name}')`
    );
    res.status(200).send("Successfully added building.");
});

// for chairperson control
router.post("/courses", async (req, res) => {
    // check user credentials
    const user = req.account;
    if (!user || user.type != "chair") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before creating new course."
            }
        })
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    const [{ totalDuplicates }] = await DB.executeQuery(
        `SELECT COUNT(*) AS totalDuplicates FROM (SELECT col.school_id AS id FROM Departments d INNER JOIN ` +
        `Colleges col ON d.college_id = col.id WHERE d.chair_id = '${user.id}' LIMIT 1) AS school INNER JOIN ` +
        `Colleges col ON school.id = col.school_id INNER JOIN Departments d ON col.id = d.college_id INNER JOIN ` +
        `Courses co ON d.id = co.dept_id WHERE co.title = '${req.body.name}'`
    );

    if (totalDuplicates > 0) {
        return res.status(409).json({
            message: {
                mode: 2,
                title: "Duplicate course program",
                body: "A course with the same name already exists"
            }
        });
    }

    const courseID = crypto.randomBytes(6).toString("base64url");
    await DB.executeQuery(
        `INSERT INTO Courses (SELECT '${courseID}', id, '${req.body.name}' FROM Departments ` +
        `WHERE chair_id = '${user.id}' LIMIT 1)`
    );
    res.status(200).json({
        courseID: courseID,
        message: {
            mode: 1,
            title: "New course created",
            body: "The new course needs a curriculum to follow"
        }
    });
});

router.route("/curricula/:courseID?") // getting and adding the semesters in a course's curriculum
    .get(async (req, res) => {
        // check user credentials
        const user = req.account;
        if (!user || user.type != "chair") {
            res.cookie("serverMessage", {
                message: {
                    mode: 0,
                    title: "Unauthorized request",
                    body: "Please login before accessing the chairperson dashboard."
                }
            })
            return res.status(401).json({ redirect: "/logout" });
        }

        const DB = req.app.locals.database;
        const terms = await DB.executeQuery(
            `SELECT DISTINCT year, term FROM Curricula WHERE course_id = "${req.params.courseID}" ORDER BY year, term`
        );
        if (terms.length < 1) {
            return res.status(200).json({ curriculum: terms, totalUnits: 0 });
        }

        for (let i = 0; i < terms.length; i++) {
            terms[i]["subjects"] = await DB.executeQuery(
                `SELECT sub.code, sub.units, CASE WHEN sub.type IS NULL THEN sub.title ELSE ` +
                `CONCAT(sub.title, " (", sub.type, ")") END as title FROM Curricula cu ` +
                `LEFT JOIN Subjects sub ON cu.subj_id = sub.id WHERE cu.course_id = "${req.params.courseID}" AND ` +
                `cu.year = ${terms[i]["year"]} AND cu.term = "${terms[i]["term"]}" AND cu.subj_id IS NOT NULL ` +
                `ORDER BY sub.title, sub.code`
            );
        }
        const [{ totalUnits }] = await DB.executeQuery(
            `SELECT SUM(sub.units) AS totalUnits FROM Curricula cu INNER JOIN Subjects sub ON cu.subj_id = sub.id ` +
            `WHERE cu.course_id = "${req.params.courseID}" AND cu.subj_id IS NOT NULL`
        );
        res.status(200).json({ curriculum: terms, totalUnits: totalUnits });
    }).post(async (req, res) => {
        // check user credentials
        const user = req.account;
        if (!user || user.type != "chair") {
            res.cookie("serverMessage", {
                message: {
                    mode: 0,
                    title: "Unauthorized request",
                    body: "Please login before handling curriculum."
                }
            })
            return res.status(401).json({ redirect: "/logout" });
        }

        const { forNewYear, totalTerms } = req.body;
        if (forNewYear === undefined || !totalTerms) {
            return res.status(400).json({
                message: {
                    mode: 0,
                    title: "Missing/invalid input",
                    body: "Requires more input create new term/s in curriculum."
                }
            })
        }

        const DB = req.app.locals.database;
        let [{ latestYear }] = await DB.executeQuery(
            `SELECT MAX(year) AS latestYear FROM Curricula WHERE course_id = "${req.params.courseID}"`
        );
        latestYear = latestYear ? latestYear + 1 : 1;

        let query = `INSERT INTO Curricula VALUES `;
        let message;
        let openSchedules;
        console.log("total terms: " + totalTerms);
        if (forNewYear == 1) {
            message = `A new academic year with ${totalTerms} semesters is ready.`;
            let values = [];
            let terms = [];
            for (let i = 1; i <= totalTerms; i++) {
                values.push(`'${req.params.courseID}', NULL, ${latestYear}, '${i}'`);
                terms.push(i);
            }
            query += `(${values.join("), (")}); `;

            openSchedules = await DB.executeQuery(
                `SELECT t.id, SUM(pr.sched_status IN ('open', 'saved', 'posted')) AS totalFaculty, ` +
                `SUM(pr.term_id IS NULL) AS totalClosed FROM Terms t INNER JOIN Preferences pr ON ` +
                `t.id = pr.term_id INNER JOIN Faculty f ON pr.faculty_id = f.id INNER JOIN Departments d ON ` +
                `f.dept_id = d.id WHERE d.chair_id = "${user.id}" AND t.term IN ` +
                `('${terms.join("', '")}') ` +
                `GROUP BY t.id HAVING totalClosed != totalFaculty ORDER BY t.year DESC, t.term DESC`
            );
        } else {
            message = "A summer term in the curriculum is ready."
            query += `('${req.params.courseID}', NULL, ${latestYear - 1}, 's'); `;

            openSchedules = await DB.executeQuery(
                `SELECT t.id, SUM(pr.sched_status IN ('open', 'saved', 'posted')) AS totalFaculty, ` +
                `SUM(pr.term_id IS NULL) AS totalClosed FROM Terms t INNER JOIN Preferences pr ON ` +
                `t.id = pr.term_id INNER JOIN Faculty f ON pr.faculty_id = f.id INNER JOIN Departments d ON ` +
                `f.dept_id = d.id WHERE d.chair_id = "${user.id}" AND t.term = 's' ` +
                `GROUP BY t.id HAVING totalClosed != totalFaculty ORDER BY t.year DESC, t.term DESC`
            );
        }
        console.table(openSchedules);

        blocks = [];
        for (const { id } of openSchedules) {
            let blockID = crypto.randomBytes(6).toString("base64url");
            blocks.push(
                `('${blockID}', '${req.params.courseID}', '${id}', ${latestYear}, 1)`
            );
        }

        if (blocks.length > 0) {
            query += `INSERT INTO Blocks (id, course_id, term_id, year, block_no) VALUES ${blocks.join(", ")};`
        }

        await DB.executeQuery(query);
        res.status(200).json({
            message: {
                mode: 1,
                title: "Curriculum Updated",
                body: message
            }
        });
    });

router.post("/curriculum/:courseID", async (req, res) => { // adding a subject in a semester per course's curriculum
    // check user credentials
    const user = req.account;
    if (!user || user.type != "chair") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before handling curriculum."
            }
        })
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    const { code, title } = req.body;
    const { courseID } = req.params;
    const [{ schoolID }] = await DB.executeQuery(
        `SELECT col.school_id AS schoolID FROM Departments d INNER JOIN Colleges col ON d.college_id = col.id ` +
        `WHERE d.chair_id = '${user.id}' LIMIT 1`
    );
    let subjID;
    if (code && title) {
        subjID = await DB.executeQuery(
            `SELECT DISTINCT s.id, s.code, s.units, cu.course_id, CASE WHEN s.type IS NULL THEN s.title ELSE ` +
            `CONCAT(s.title, ' (', s.type, ')') END AS title FROM Subjects s INNER JOIN Colleges col ON ` +
            `s.college_id = col.id LEFT JOIN (SELECT course_id, subj_id FROM Curricula cu WHERE ` +
            `course_id = '${courseID}') AS cu ON s.id = cu.subj_id WHERE cu.course_id IS NULL AND ` +
            `col.school_id = '${schoolID}' AND s.code LIKE '%${code.split(" ").join("%")}%' AND s.title LIKE ` +
            `'%${title.split(" ").join("%")}%'`
        );
    } else if (code) {
        subjID = await DB.executeQuery(
            `SELECT DISTINCT s.id, s.code, s.units, cu.course_id, CASE WHEN s.type IS NULL THEN s.title ELSE ` +
            `CONCAT(s.title, ' (', s.type, ')') END AS title FROM Subjects s INNER JOIN Colleges col ON ` +
            `s.college_id = col.id LEFT JOIN (SELECT course_id, subj_id FROM Curricula cu WHERE ` +
            `course_id = '${courseID}') AS cu ON s.id = cu.subj_id WHERE cu.course_id IS NULL AND ` +
            `col.school_id = '${schoolID}' AND s.code LIKE '%${code.split(" ").join("%")}%'`
        );
    } else {
        subjID = await DB.executeQuery(
            `SELECT DISTINCT s.id, s.code, s.units, cu.course_id, CASE WHEN s.type IS NULL THEN s.title ELSE ` +
            `CONCAT(s.title, ' (', s.type, ')') END AS title FROM Subjects s INNER JOIN Colleges col ON ` +
            `s.college_id = col.id LEFT JOIN (SELECT course_id, subj_id FROM Curricula cu WHERE ` +
            `course_id = '${courseID}') AS cu ON s.id = cu.subj_id WHERE cu.course_id IS NULL AND ` +
            `col.school_id = '${schoolID}' AND s.title LIKE '%${title.split(" ").join("%")}%'`
        );
    }
    console.table(subjID);

    if (subjID.length <= 0) {
        console.log(subjID);
        return res.status(409).json({
            message: {
                mode: 2,
                title: "Subject not found or a duplicate",
                body: `The subject is not offered by the school or<br>is already added in the curriculum.`
            }
        });
    }

    subjID = subjID[0];
    const { year, semester } = req.body;
    const [{ semesterContent }] = await DB.executeQuery(
        `SELECT COUNT(subj_id) AS semesterContent FROM Curricula WHERE course_id = '${req.params.courseID}' ` +
        `AND year = ${year} AND term = '${semester}' AND subj_id IS NOT NULL`
    );

    if (semesterContent <= 0) {
        await DB.executeQuery(
            `UPDATE Curricula SET subj_id = '${subjID.id}' WHERE course_id = '${req.params.courseID}' ` +
            `AND year = ${year} AND term = '${semester}' LIMIT 1`
        );
    } else {
        await DB.executeQuery(
            `INSERT INTO Curricula VALUES ('${req.params.courseID}', '${subjID.id}', ${year}, '${semester}')`
        );
    }

    await DB.executeQuery(
        `INSERT INTO Schedules (term_id, subj_id, block_id) SELECT t.id, '${subjID.id}', b.id ` +
        `FROM Blocks b INNER JOIN Terms t ON b.term_id = t.id INNER JOIN Courses co ON ` +
        `b.course_id = co.id LEFT JOIN Departments d ON co.dept_id = d.id WHERE ` +
        `d.chair_id = '${user.id}' AND t.term = '${semester}' AND b.year = ${year} ORDER BY b.year, b.block_no`
    )

    res.status(200).json({
        newSubject: subjID,
        message: {
            mode: 1,
            title: "New Subject Added",
            body: `You can now assign classes for the blocks taking this course.`
        }
    });
});

router.post("/terms", async (req, res) => { // creates new academic term to start schedule
    // check user credentials
    const user = req.account;
    if (!user || user.type != "chair") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before creating new semester schedule."
            }
        })
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    const { year, term } = req.body;
    const [{ totalDuplicates }] = await DB.executeQuery(
        `SELECT COUNT(*) AS totalDuplicates FROM Departments d INNER JOIN Colleges col ON d.college_id = col.id INNER JOIN ` +
        `Terms t ON col.school_id = t.school_id WHERE d.chair_id = "${user.id}" AND ` +
        `t.year = ${year} AND t.term = "${term}"`
    );

    if (totalDuplicates > 0) {
        return res.status(409).json({
            message: {
                mode: 2,
                title: "Duplicate academic term",
                body: "An academic term with the same year and semester already exists"
            }
        });
    }

    const [{ schoolID }] = await DB.executeQuery(
        `SELECT col.school_id AS schoolID FROM Departments d INNER JOIN Colleges col ON d.college_id = col.id ` +
        `WHERE d.chair_id = "${user.id}" LIMIT 1`
    );

    const termID = crypto.randomBytes(6).toString("base64url");
    const faculty = await DB.executeQuery(
        `SELECT f.id, u.email, CONCAT(f.first_name, ' ', f.middle_name, ' ', f.last_name) AS name FROM ` +
        `Faculty f INNER JOIN Users u ON f.id = u.id INNER JOIN Departments d ON f.dept_id = d.id INNER JOIN ` +
        `Colleges col ON d.college_id = col.id WHERE col.school_id = '${schoolID}' ORDER by f.dept_id`
    );

    console.table(faculty);

    let deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);
    deadline = {
        date: `${deadline.getFullYear()}-${deadline.getMonth() + 1}-${deadline.getDate()}`,
        time: `${deadline.getHours()}:${deadline.getMinutes()}`,
        full: `${deadline.toLocaleTimeString().replace(/([\d]+:[\d]{2})(:[\d]{2})(.*)/, "$1$3")} of ` +
        `${monthNames[deadline.getMonth() + 1]} ${deadline.getDate()}, ${deadline.getFullYear()}`
    };

    for (let i = 0; i < faculty.length; i++) {
        const prefID = crypto.randomBytes(6).toString("base64url");
        faculty[i].query = `('${prefID}', '${termID}', '${faculty[i].id}', '${deadline.date} ${deadline.time}')`
    }

    const courses = await DB.executeQuery(
        `SELECT DISTINCT co.id, MAX(cu.year) AS total_years FROM Courses co INNER JOIN Curricula cu ON co.id = cu.course_id ` +
        `INNER JOIN Departments d ON co.dept_id = d.id GROUP BY co.id`
    );

    const blocks = [];
    for (const course of courses) {
        const { id, total_years } = course;
        for (let i = 1; i <= total_years; i++) {
            const blockID = crypto.randomBytes(6).toString("base64url");
            blocks.push(`('${blockID}', '${id}', '${termID}', ${i})`);
        }
    }

    let query = `INSERT INTO Terms VALUES ('${termID}', '${schoolID}', ${year}, '${term}', 1, current_timestamp); ` +
        `INSERT INTO Preferences (id, term_id, faculty_id, deadline) VALUES ${faculty.map(f => f.query).join(",")};`;

    if (blocks.length > 0) {
        query += `INSERT INTO Blocks (id, course_id, term_id, year) VALUES ${blocks.join(",")}; `;
    }
    query += `INSERT INTO Schedules (term_id, subj_id, block_id) ` +
        `SELECT b.term_id, cu.subj_id, b.id FROM Blocks b INNER JOIN Curricula cu ON b.course_id = cu.course_id ` +
        `AND b.year = cu.year WHERE b.term_id = '${termID}' AND cu.term = '${term}' AND cu.subj_id IS NOT NULL ` +
        `ORDER BY b.year, b.block_no`

    await DB.executeQuery(query);
    res.status(200).json({ termID: termID });
    
    const mailer = req.app.locals.mailer;
    const content = await ejs.renderFile(
        __dirname + "/../views/mail-template/new-preference-form.ejs",
        { year: parseInt(year), semester: toOrdinal(term), loginLink: `http://${process.env.API_DOMAIN}/login`, deadline: deadline.full }
    );
    console.log(content);
    let mailOptions = {
        to: faculty.map(f => f.email),
        subject: `New Preference Form (A.Y. ${year}-${term})`,
        html: content
    };
    await mailer.sendEmail(mailOptions);
});

router.post("/save_schedule/:term", saveFacultySchedule, async (req, res) => {
    console.log("saving schedule");
    if (req.incompleteScheds && req.body.facultyID) {
        res.status(409).json({
            message: {
                mode: 2,
                title: "Unable to save faculty schedule",
                body: "<p>Some classes are not fully plotted.</p>"
            }
        });
    } else if (req.body.facultyID) {
        let [aboutProf] = await req.app.locals.database.executeQuery(
            `SELECT * FROM Preferences WHERE faculty_id = '${req.body.facultyID}' LIMIT 1`
        );
        console.log(aboutProf);
        res.status(200).json(aboutProf);
    } else if (req.incompleteScheds) {
        res.cookie("serverMessage", {
            mode: 2,
            title: "Incomplete schedules not saved",
            body: "Could not save schedule of the following faculty:<br>" +
                `<ul><li>${req.incompleteScheds.join("</li><li>")}</li></ul>` +
                `<br>Please completely plot their classes.`
        }).status(200).end();
    } else {
        res.cookie("serverMessage", {
            mode: 1,
            title: "Saved all faculty schedules",
            body: "You can't edit their schedules when in saved mode."
        }).status(200).end();
    }
});

router.post("/unsave_schedule/:term", unsaveFacultySchedule, async (req, res) => {
    console.log("unsaving schedule");
    if (req.body.facultyID) {
        let [aboutProf] = await req.app.locals.database.executeQuery(
            `SELECT * FROM Preferences WHERE faculty_id = '${req.body.facultyID}' LIMIT 1`
        );
        console.log(aboutProf);
        return res.status(200).json(aboutProf);
    }
    res.status(500).json({
        message: {
            mode: 0,
            title: "Server Error",
            body: "An unexpected error occured, try again later as we fix this issue."
        }
    });
});

router.route("/schedules/:termID")
    .get(async (req, res) => { // get faculty or block details per term schedule
        // check user credentials
        const user = req.account;
        if (!user || user.type != "chair") {
            res.cookie("serverMessage", {
                message: {
                    mode: 0,
                    title: "Unauthorized request",
                    body: "Please login before accessing chair dashboard."
                }
            })
            return res.status(401).json({ redirect: "/logout" });
        }

        const DB = req.app.locals.database;
        let query;
        if (req.query.category == "faculty") {
            query = `SELECT f.id, CONCAT(f.last_name, ", ", f.first_name, " ", f.middle_name) AS name, CASE ` +
                `WHEN pref.sched_status = 'saved' THEN '<input class="form-check-input save-schedule" ` +
                `type="checkbox" checked/>' ELSE '<input class="form-check-input save-schedule" type="checkbox" />' ` +
                `END AS sched_status_checkbox, f.faculty_id, CONCAT(pref.assigned_load, " / ", f.teach_load) AS ` +
                `teach_load, pref.sched_status, CASE WHEN CURRENT_TIMESTAMP > pref.deadline AND ` +
                `pref.status = 'pending' THEN 'unanswered' ELSE pref.status END AS pref_status, f.status AS ` +
                `faculty_status FROM Terms t INNER JOIN Preferences pref ON t.id = pref.term_id INNER JOIN ` +
                `Faculty f ON pref.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id WHERE ` +
                `d.chair_id = '${user.id}' AND t.id = '${req.params.termID}' ORDER BY f.status, name`;
        } else {
            query = `SELECT id, year, block_no, total_students, CASE WHEN is_complete THEN 'COMPLETE' ELSE ` +
                `'incomplete' END AS sched_status FROM Blocks WHERE course_id = "${req.query.category}" ` +
                `AND term_id = "${req.params.termID}" ORDER BY year, block_no`;
        }

        res.status(200).json({ schedules: await DB.executeQuery(query) });

    }).post(async (req, res) => { // manual input of schedule
        // check user credentials
        const user = req.account;
        if (!user || user.type != "chair") {
            res.cookie("serverMessage", {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before assigning class."
            })
            return res.status(401).json({ redirect: "/logout" });
        }

        const DB = req.app.locals.database;
        const { termID } = req.params;
        const { faculty, block, partial, mode, room, subject } = req.body.schedule;

        const [[{ assigned_load, teach_load }], [{ units }]] = await DB.executeQuery(
            `SELECT p.assigned_load, f.teach_load FROM Faculty f INNER JOIN Preferences p ON ` +
            `f.id = p.faculty_id WHERE f.id = '${faculty}' AND p.term_id = '${termID}' LIMIT 1;` +
            `SELECT units FROM Subjects WHERE id = '${subject}' LIMIT 1;`
        );

        console.log(assigned_load, teach_load, units);
        if (!partial && assigned_load + units > teach_load) {
            res.cookie("serverMessage", {
                mode: 0,
                title: "Overload faculty",
                body: "Did not assign class to this faculty because it will exceed their required load."
            })
            return res.status(200).end();
        }

        let [prefRooms] = await DB.executeQuery(
            `SELECT pref_rooms AS room FROM Subjects WHERE id = '${subject}' LIMIT 1`
        );
        prefRooms = prefRooms ? prefRooms.room.split(",") : [];

        // check if classroom exists
        let classroom;
        if (mode == 1 && (!room || room == "")) {
            [classroom] = await DB.executeQuery(
                `SELECT r.id, r.name FROM Rooms r INNER JOIN Buildings b ON r.bldg_id = b.id INNER JOIN ` +
                    `Terms t ON b.school_id = t.school_id WHERE t.id = '${termID}' ` +
                    (prefRooms.length > 0) ? "OR r.name LIKE '%" +
                    prefRooms.map(r => r.split(" ").join("%")).join("%' OR r.name LIKE '%") + "%'" : "" + "LIMIT 1"
            );
            message = `Auto-assigned schedule into classroom ${classroom.name}`;
        } else if (mode == 1) {
            [classroom] = await DB.executeQuery(
                `SELECT r.id, r.name FROM Rooms r INNER JOIN Buildings b ON r.bldg_id = b.id INNER JOIN ` +
                `Terms t ON b.school_id = t.school_id WHERE t.id = '${termID}' AND r.id = '${room}' LIMIT 1`
            );
        }

        if (mode == 1 && !classroom) {
            return res.status(404).json({
                message: {
                    mode: 0,
                    title: "Classroom not found",
                    body: "The classroom does not exist"
                }
            });
        }

        let { day, start, end } = req.body.schedule;
        let conflicts = await DB.executeQuery(
            `SELECT sc.faculty_id, sc.subj_id, sc.block_id, sc.room_id, sc.day, sc.start, sc.end, r.name, ` +
            `CONCAT(co.title, ' ', b.year, ' - block ', b.block_no) AS block, CONCAT(f.last_name, ', ', ` +
            `f.first_name, ' ', f.middle_name) AS faculty, CASE WHEN s.type IS NULL THEN s.title ELSE ` +
            `CONCAT(s.title, ' (', s.type, ')') END AS subject FROM Schedules sc LEFT JOIN Rooms r ON ` +
            `sc.room_id = r.id INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Subjects s ON ` +
            `sc.subj_id = s.id LEFT JOIN Courses co ON b.course_id = co.id LEFT JOIN Faculty f ON ` +
            `sc.faculty_id = f.id WHERE sc.term_id = '${termID}' AND (sc.block_id = '${block}'` +
            (faculty != "pass" ? ` OR sc.faculty_id = '${faculty}'` : " AND sc.faculty_id IS NULL") +
            (classroom ? ` OR sc.room_id = '${classroom.id}'` : "") +
            `) AND sc.day = ${day} AND ((sc.start <= ${start} AND ${start} < sc.end) OR ` +
            `(sc.start < ${end} AND ${end} <= sc.end) OR (${start} <= sc.start AND sc.start < ${end}) ` +
            `OR (${start} < sc.end AND sc.end <= ${end})) ORDER BY sc.start, sc.day`
        );

        console.log("Found conflicts:");
        console.table(conflicts);

        if (conflicts.length > 0) {
            conflicts = conflicts[0];
            console.log(req.body.schedule);
            let message = {
                mode: 0,
                title: "Conflicting schedule",
                body: "Could not specify faculty/block/room conflict, try changing time/room input."
            };

            if (conflicts.faculty_id == faculty) {
                message.title = "Conflicting faculty schedule";
                message.body = `<b>Prof. ${conflicts.faculty}</b> has "${conflicts.subject}" class with ` +
                    `${conflicts.block} at the time.<br>Try changing time input.`;
            } else if (conflicts.block_id == block) {
                message.title = "Conflicting block schedule";
                message.body = `<b>${conflicts.block}</b> has "${conflicts.subject}" class ` +
                    (conflicts.faculty_id == null ? "but NO PROFESSOR " : "") +
                    `at the time.<br>Try changing time input.`;
            } else if (mode == 1 && conflicts.room_id == classroom.id) {
                message.title = "Conflicting room schedule";
                message.body = `<b>${conflicts.name}</b> is already taken at the time.<br>Try changing classroom input.`;
            }

            return res.status(409).json({ message: message });
        }

        let query;
        if (partial == 1) {
            query = `INSERT INTO Schedules VALUES ('${termID}', '${subject}', '${block}', ` +
                (faculty != "pass" ? `'${faculty}',` : "NULL, ") +
                (classroom ? `'${classroom.id}',` : "NULL, ") + ` ${day}, ${start}, ${end}, ${mode})`;
        } else {
            query = `UPDATE Schedules SET faculty_id = ${faculty != "pass" ? `'${faculty}'` : "NULL"}, ` +
                `room_id = ${classroom ? `'${classroom.id}'` : "NULL"}, ` +
                `day = ${day}, start = ${start}, end = ${end}, mode = ${mode} WHERE block_id = '${block}' AND ` +
                `subj_id = '${subject}' AND term_id = '${termID}' AND faculty_id IS NULL LIMIT 1;`;

            if (faculty != "pass") {
                query += `UPDATE Schedules sc LEFT JOIN Subjects s ON sc.subj_id = s.id INNER JOIN ` +
                    `Preferences p ON sc.term_id = p.term_id AND sc.faculty_id = p.faculty_id SET ` +
                    `p.assigned_load = (p.assigned_load + s.units) WHERE sc.term_id = '${termID}' AND ` +
                    `sc.subj_id = '${subject}' AND sc.block_id = '${block}' AND ` +
                    `sc.faculty_id = '${faculty}' LIMIT 1`;
            }
        };

        console.log(await DB.executeQuery(query));
        res.status(200).end();
    });

router.route("/schedule/:termID")
    .get(async (req, res) => { // gets individual block or faculty schedule
        // check user credentials
        const user = req.account;
        if (!user || user.type != "chair") {
            res.cookie("serverMessage", {
                message: {
                    mode: 0,
                    title: "Unauthorized request",
                    body: "Please login before accessing chair dashboard."
                }
            })
            return res.status(401).json({ redirect: "/logout" });
        }

        if (!req.query.blockID || !req.query.facultyID) {
            return res.status(400).json({
                message: "Invalid inputs, cannot get schedule."
            });
        }

        console.log(req.query);
        const DB = req.app.locals.database;
        const classes = await DB.executeQuery(
            `SELECT day, (TRUNCATE(start/60, 0) - 7) * 2 AS start_time, (TRUNCATE(end/60, 0) - 7) * 2 ` +
            `AS end_time FROM Schedules WHERE term_id = '${req.params.termID}' AND mode IS NOT NULL AND ` +
            `(block_id = '${req.query.blockID}' OR faculty_id = '${req.query.facultyID}') ORDER BY start_time, day`
        );

        console.table(classes);
        res.status(200).json({
            classes: classes
        });
    }).post(async (req, res) => { // changes or removes a class schedule
        // check user credentials
        const user = req.account;
        if (!user || user.type != "chair") {
            res.cookie("serverMessage", {
                message: {
                    mode: 0,
                    title: "Unauthorized request",
                    body: "Please login before accessing chair dashboard."
                }
            })
            return res.status(401).json({ redirect: "/logout" });
        }

        const { action, oldSched } = req.body;
        const DB = req.app.locals.database;
        const { termID } = req.params;

        if (action == "change") {
            const { faculty, block, partial } = req.body.newSched;
            if (oldSched.faculty != faculty && partial) {
                return res.status(409).json({
                    message: {
                        mode: 0,
                        title: "Cannot share classes",
                        body: "Professors cannot teach the same block of the same subject."
                    }
                });
            }

            console.log("Changing schedule...");
            const { mode, room, subject } = req.body.newSched;
            let [{ pref_rooms, req_hours }] = await DB.executeQuery(
                `SELECT pref_rooms, req_hours FROM Subjects WHERE id = '${subject}' LIMIT 1`
            );
            pref_rooms = pref_rooms ? pref_rooms.split(",") : [];

            // check if classroom exists
            let classroom;
            if (mode == 1 && (!room || room == "")) {
                [classroom] = await DB.executeQuery(
                    `SELECT r.id, r.name FROM Rooms r INNER JOIN Buildings b ON r.bldg_id = b.id INNER JOIN ` +
                        `Terms t ON b.school_id = t.school_id WHERE t.id = '${termID}' ` +
                        (pref_rooms.length > 0) ? "OR r.name LIKE '%" +
                        pref_rooms.map(r => r.split(" ").join("%")).join("%' OR r.name LIKE '%") + "%'" : "" + "LIMIT 1"
                );
                message = `Auto-assigned schedule into classroom ${classroom.name}`;
            } else if (mode == 1) {
                [classroom] = await DB.executeQuery(
                    `SELECT r.id, r.name FROM Rooms r INNER JOIN Buildings b ON r.bldg_id = b.id INNER JOIN ` +
                    `Terms t ON b.school_id = t.school_id WHERE t.id = '${termID}' AND r.id = '${room}' LIMIT 1`
                );
            }

            if (mode == 1 && !classroom) {
                return res.status(404).json({
                    message: {
                        mode: 0,
                        title: "Classroom not found",
                        body: "The classroom does not exist"
                    }
                });
            }

            let { day, start, end } = req.body.newSched;
            let conflicts = await DB.executeQuery(
                `SELECT sc.faculty_id, sc.subj_id, sc.block_id, sc.room_id, sc.day, sc.start, sc.end, r.name, ` +
                `CONCAT(co.title, ' ', b.year, ' - block ', b.block_no) AS block, CONCAT(f.last_name, ', ', ` +
                `f.first_name, ' ', f.middle_name) AS faculty, CASE WHEN s.type IS NULL THEN s.title ELSE ` +
                `CONCAT(s.title, ' (', s.type, ')') END AS subject FROM Schedules sc LEFT JOIN Rooms r ON ` +
                `sc.room_id = r.id INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Subjects s ON ` +
                `sc.subj_id = s.id LEFT JOIN Courses co ON b.course_id = co.id LEFT JOIN Faculty f ON ` +
                `sc.faculty_id = f.id WHERE sc.term_id = '${termID}' AND (sc.block_id = '${block}' ` +
                (faculty != "pass" ? `OR sc.faculty_id = '${faculty}' ` : "") +
                (classroom ? `OR sc.room_id = '${classroom.id}'` : "") +
                `) AND sc.day = ${day} AND ((sc.start <= ${start} AND ${start} < sc.end) OR ` +
                `(sc.start < ${end} AND ${end} <= sc.end) OR (${start} <= sc.start AND sc.start < ${end}) ` +
                `OR (${start} < sc.end AND sc.end <= ${end})) ORDER BY sc.start, sc.day`
            );
            conflicts = conflicts.filter(
                (con) => con.subj_id != oldSched.subject && con.block_id != oldSched.block &&
                    con.mode != oldSched.mode && con.day != oldSched.day && con.start != oldSched.start &&
                    con.end != oldSched.end && con.faculty_id != oldSched.faculty
            )

            console.log("Found conflicts:");
            console.table(conflicts);

            if (conflicts.length > 0) {
                let message = {
                    mode: 0,
                    title: "Conflicting schedule",
                    body: "Could not specify faculty/block/room conflict, try changing time/room input."
                };

                if (conflicts.some(({ faculty_id }) => faculty_id == faculty)) {
                    message.title = "Conflicting faculty schedule";
                    message.body = `<b>Prof. ${conflicts[0].faculty}</b> has "${conflicts[0].subject}" class with ` +
                        `${conflicts[0].block} at the time.<br>Try changing time input.`;
                } else if (conflicts.some(({ block_id }) => block_id == block)) {
                    message.title = "Conflicting block schedule";
                    message.body = `<b>${conflicts[0].block}</b> has "${conflicts[0].subject}" class at the time.<br>Try changing time input.`;
                } else if (mode == 1 && conflicts.some(({ room_id }) => room_id == classroom.id)) {
                    message.title = "Conflicting room schedule";
                    message.body = `<b>${conflicts[0].name}</b> is already taken at the time.<br>Try changing classroom input.`;
                }

                return res.status(409).json({ message: message });
            }

            let partialClasses = await DB.executeQuery(
                `SELECT * FROM Schedules WHERE term_id = '${termID}' AND subj_id = '${subject}' AND ` +
                `block_id = '${block}'`
            );
            partialClasses = partialClasses.filter((c) => c.day != day && c.start != start && c.end != end);

            req_hours = req_hours * 60 - (end - start);
            console.log(req_hours);

            if (partialClasses.length > 0 && req_hours > 0) {
                partialClasses = partialClasses.map((c) => {
                    if (req_hours <= 0) {
                        return c;
                    } else if ((c.end - c.start) <= req_hours) {
                        req_hours -= (c.end - c.start);
                        return { ...c, newStart: c.start, newEnd: c.end };
                    } else {
                        c = { ...c, newStart: c.start, newEnd: c.start + req_hours };
                        req_hours = 0;
                        return c;
                    }
                })
            }
            console.table(partialClasses);

            console.log(
                partialClasses.reduce((query, c) => {
                    return query += (c.newStart && c.newEnd) ?
                        `UPDATE Schedules start = ${c.newStart}, end = ${c.newEnd} WHERE term_id = '${termID}' ` +
                        `AND subj_id = '${subject}' AND block_id = '${block}' AND day = ${c.day} AND ` +
                        `start = ${c.start} AND end = ${c.end} LIMIT 1;` :
                        `DELETE FROM Schedules WHERE term_id = '${termID}' AND subj_id = '${subject}' AND ` +
                        `block_id = '${block}' AND day = ${c.day} AND start = ${c.start} AND end = ${c.end} LIMIT 1;`
                }, "")
            );
            await DB.executeQuery(
                // if faculty is changed
                (
                    (!partial && oldSched.faculty != faculty) ? `UPDATE Preferences p INNER JOIN Terms t ON ` +
                        `p.term_id = t.id INNER JOIN Colleges col ON t.school_id = col.school_id INNER JOIN ` +
                        `Subjects s ON col.id = s.college_id SET p.assigned_load = (p.assigned_load - s.units) ` +
                        `WHERE p.term_id = '${termID}' AND s.id = '${subject}' AND p.faculty_id = '${oldSched.faculty}' ` +
                        `LIMIT 1; UPDATE Preferences p INNER JOIN Terms t ON p.term_id = t.id INNER JOIN ` +
                        `Colleges col ON t.school_id = col.school_id INNER JOIN Subjects s ON col.id = s.college_id ` +
                        `SET p.assigned_load = (p.assigned_load + s.units) WHERE p.term_id = '${termID}' AND ` +
                        `s.id = '${subject}' AND p.faculty_id = ${!faculty || faculty == "pass" ? "NULL" : `'${faculty}'`} ` +
                        `LIMIT 1; ` : ""
                ) +

                `UPDATE Schedules SET day = ${day}, start = ${start}, end = ${end}, mode = ${mode}, ` +
                `faculty_id = ${!faculty || faculty == "pass" ? "NULL" : `'${faculty}'`}, room_id = ${classroom ? `'${classroom.id}'` : "NULL"} ` +
                `WHERE term_id = '${termID}' AND subj_id = '${subject}' AND block_id = '${block}' AND day = ${oldSched.day} AND ` +
                `start = ${oldSched.start} AND end = ${oldSched.end} LIMIT 1;` +
                partialClasses.reduce((query, c) => {
                    return query += (c.newStart && c.newEnd) ?
                        `UPDATE Schedules start = ${c.newStart}, end = ${c.newEnd} WHERE term_id = '${termID}' ` +
                        `AND subj_id = '${subject}' AND block_id = '${block}' AND day = ${c.day} AND ` +
                        `start = ${c.start} AND end = ${c.end} LIMIT 1;` :
                        `DELETE FROM Schedules WHERE term_id = '${termID}' AND subj_id = '${subject}' AND ` +
                        `block_id = '${block}' AND day = ${c.day} AND start = ${c.start} AND end = ${c.end} LIMIT 1;`
                }, "")
            );

            return res.status(200).end();
        } else if (action == "delete") {
            const { subject, block, faculty, day, start, end } = oldSched;
            const [[{ sameClasses }], [{ units }]] = await DB.executeQuery(
                `SELECT COUNT(*) AS sameClasses FROM Schedules WHERE term_id = '${termID}' AND ` +
                `subj_id = '${subject}' AND block_id = '${block}';` +

                `SELECT units FROM Subjects WHERE id = '${subject}' LIMIT 1;`
            );

            if (sameClasses > 1) {
                await DB.executeQuery(
                    `DELETE FROM Schedules WHERE term_id = '${termID}' AND (subj_id = '${subject}' AND ` +
                    `block_id = '${block}') AND day = ${day} AND start = ${start} AND end = ${end} LIMIT 1`
                );
            } else {
                await DB.executeQuery(
                    // remove schedule
                    `UPDATE Schedules SET faculty_id = NULL, room_id = NULL, day = NULL, start = NULL, ` +
                    `end = NULL, mode = NULL WHERE term_id = '${termID}' AND (subj_id = '${subject}' AND ` +
                    `block_id = '${block}') AND day = ${day} AND start = ${start} AND end = ${end} LIMIT 1; ` +

                    // subtract faculty load
                    `UPDATE Preferences SET assigned_load = assigned_load - ${units} ` +
                    `WHERE faculty_id = '${faculty}' AND term_id = '${termID}' LIMIT 1;`
                );
            }

            res.status(200).end();
        } else {
            console.log("Invalid action");
            return res.status(400).end();
        }
    });

router.post("/blocks/:courseID", async (req, res) => {
    // check user credentials
    const user = req.account;
    if (!user || user.type != "chair") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before accessing admin dashboard."
            }
        })
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    const { termID, year, totalStudents } = req.body;

    let [newBlock] = await DB.executeQuery(
        `SELECT MAX(b.block_no) + 1 AS number FROM (SELECT block_no FROM Blocks WHERE year = ${year} ` +
        `AND course_id = '${req.params.courseID}' AND term_id = '${termID}' AND block_no IS NOT NULL) AS b `
    );

    // checks if input year is consistent with the curriculum
    if (!newBlock || newBlock.number <= 1) {
        return res.status(409).json({
            message: {
                mode: 2,
                title: "New block conflict",
                body: "The year is not consistent with the curriculum."
            }
        }); // block number conflict
    }

    const blockID = crypto.randomBytes(6).toString("base64url");
    let query;
    if (totalStudents) {
        query = `INSERT INTO Blocks VALUES ('${blockID}', '${req.params.courseID}', '${termID}', ` +
            `${year}, ${newBlock.number}, ${totalStudents}); `
    } else {
        query = `INSERT INTO Blocks (id, term_id, course_id, year, block_no) VALUES ('${blockID}', '${termID}', ` +
            `'${req.params.courseID}', ${year}, ${newBlock.number}); `
    }

    query += `INSERT INTO Schedules (term_id, subj_id, block_id) ` +
        `SELECT b.term_id, cu.subj_id, b.id FROM Blocks b INNER JOIN Curricula cu ON b.course_id = cu.course_id ` +
        `AND b.year = cu.year INNER JOIN Terms t ON b.term_id = t.id AND cu.term = t.term WHERE ` +
        `b.term_id = '${termID}' AND b.year = ${year} AND b.block_no = ${newBlock.number} AND cu.subj_id IS NOT NULL ` +
        `ORDER BY b.year, b.block_no;`

    await DB.executeQuery(query);
    res.status(200).json({ newBlock: newBlock.number });
});

router.post("/delete_block/:termID", async (req, res) => {
    const user = req.account;
    if (!user || user.type != "chair") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before accessing admin dashboard."
            }
        })
        return res.status(401).json({ redirect: "/logout" });
    }

    console.log(req.body);
    const { year, block } = req.body;
    const DB = req.app.locals.database;

    await DB.executeQuery(
        // update faculty load for to-be removed block schedules
        `UPDATE Preferences p INNER JOIN Schedules sc ON p.faculty_id = sc.faculty_id AND p.term_id = sc.term_id INNER JOIN Faculty f ` +
        `ON p.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id INNER JOIN Blocks b ON ` +
        `sc.block_id = b.id AND sc.term_id = b.term_id INNER JOIN Subjects s ON sc.subj_id = s.id ` +
        `SET p.assigned_load = p.assigned_load - s.units WHERE p.term_id = '${req.params.termID}' AND ` +
        `b.year = ${year} AND b.block_no = ${block} AND d.chair_id = '${user.id}';` +
        // remove block schedules
        `DELETE sc FROM Schedules sc INNER JOIN Blocks b ON sc.block_id = b.id AND sc.term_id = sc.term_id ` +
        `INNER JOIN Courses co ON b.course_id = co.id INNER JOIN Departments d ON co.dept_id = d.id ` +
        `WHERE sc.term_id = '${req.params.termID}' AND b.year = ${year} AND b.block_no = ${block} AND ` +
        `d.chair_id = '${user.id}';` +
        // remove block record
        `DELETE b FROM Blocks b INNER JOIN Courses co ON b.course_id = co.id INNER JOIN Departments d ON ` +
        `co.dept_id = d.id WHERE b.term_id = '${req.params.termID}' AND b.year = ${year} AND ` +
        `b.block_no = ${block} AND d.chair_id = '${user.id}';` +
        // update block numbers to be consecutive
        `UPDATE Blocks b INNER JOIN Courses co ON b.course_id = co.id INNER JOIN Departments d ON ` +
        `co.dept_id = d.id SET b.block_no = b.block_no - 1 WHERE b.term_id = '${req.params.termID}' AND ` +
        `b.year = ${year} AND b.block_no > ${block} AND d.chair_id = '${user.id}';`
    );

    res.cookie("serverMessage", {
        message: {
            mode: 3,
            title: "Block removed",
            body: "Deleted schedules may reduce some of facultys' assigned classes."
        }
    })
    res.status(200).end();
});

// faculty control
router.post("/preferences/:prefID", async (req, res) => {
    const user = req.account;
    if (!user || (user.type != "faculty" && user.type != "chair")) {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before accessing admin dashboard."
            }
        })
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    let { subjects, schedules } = req.body;

    let query = "";
    if (schedules && schedules.length > 0) {
        query += `INSERT INTO PrefSchedules VALUES ` +
            `(${schedules.map((val) => `'${req.params.prefID}', ` + Object.values(val).join(", ")).join(`), (`)});`;
    }

    if (subjects && subjects.length > 0) {
        query += `INSERT INTO PrefSubjects SELECT DISTINCT '${req.params.prefID}', sub.id FROM Faculty f ` +
            `INNER JOIN Departments d ON f.dept_id = d.id INNER JOIN Subjects sub ON ` +
            `d.college_id = sub.college_id WHERE f.id = '${user.id}' AND sub.title IN ('${subjects.join("', '")}');`;
    }

    await DB.executeQuery(
        query + `UPDATE Preferences SET status = 2 WHERE id = '${req.params.prefID}' AND faculty_id = '${user.id}';`
    );

    res.status(200).json({
        message: {
            mode: 1,
            title: "Preference recorded",
            body: `Schedule for this term will be posted by chairperson.`
        }
    });
});

router.post("/update-preferences/:prefID", async (req, res) => {
    const user = req.account;
    if (!user || (user.type != "faculty" && user.type != "chair")) {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before accessing admin dashboard."
            }
        })
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;

    const [deadline] = await DB.executeQuery(
        `SELECT deadline FROM Preferences WHERE id = '${req.params.prefID}' AND CURRENT_TIMESTAMP < deadline LIMIT 1`
    );

    if (!deadline) {
        return res.status(409).json({
            message: {
                mode: 0,
                title: "Late Submission",
                body: "Could not update your changes on time, contact your chairperson if you need more time to answer."
            }
        });
    }

    let { subjects, schedules } = req.body;

    console.log(req.body);

    // delete previous preferences
    let query = `DELETE FROM PrefSubjects WHERE pref_id = '${req.params.prefID}'; ` +
        `DELETE FROM PrefSchedules WHERE pref_id = '${req.params.prefID}';`;

    // re-enter new preferences
    if (schedules && schedules.length > 0) {
        query += `INSERT INTO PrefSchedules VALUES ` +
            `(${schedules.map((val) => `'${req.params.prefID}', ` + Object.values(val).join(", ")).join(`), (`)});`;
    }

    if (subjects && subjects.length > 0) {
        query += `INSERT INTO PrefSubjects SELECT DISTINCT '${req.params.prefID}', sub.id FROM Faculty f ` +
            `INNER JOIN Departments d ON f.dept_id = d.id INNER JOIN Subjects sub ON ` +
            `d.college_id = sub.college_id WHERE f.id = '${user.id}' AND sub.title IN ('${subjects.join("', '")}');`;
    }

    await DB.executeQuery(
        query + `UPDATE Preferences SET status = 2 WHERE id = '${req.params.prefID}' AND faculty_id = '${user.id}';`
    );

    res.status(200).json({
        message: {
            mode: 1,
            title: "Preference recorded",
            body: `Schedule for this term will be posted by chairperson.`
        }
    });
});

router.post("/consultation", async (req, res) => {
    const user = req.account;
    if (!user || (user.type != "faculty" && user.type != "chair")) {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before accessing admin dashboard."
            }
        })
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    const { day, start, end, update } = req.body;

    if (!start && !end) {
        await DB.executeQuery(
            `DELETE FROM ConsultationHours WHERE faculty_id = '${user.id}' AND day = ${day} LIMIT 1`
        );
        return res.status(200).end();
    } else if (update == 1) {
        await DB.executeQuery(
            `UPDATE ConsultationHours SET start = ${start}, end = ${end} WHERE faculty_id = '${user.id}' AND ` +
            `day = ${day} LIMIT 1`
        );
    } else if (update == 0) {
        await DB.executeQuery(`INSERT INTO ConsultationHours VALUES ('${user.id}', ${day}, ${start}, ${end})`);
    } else {
        return res.status(401).json({
            message: {
                mode: 2,
                title: "Unable to update consultation hours",
                body: "Please try again later."
            }
        });
    }

    res.status(200).json({
        start: `${convertMinutesTime(start, false)} ${(start >= 720 ? 'PM' : 'AM')}`,
        end: `${convertMinutesTime(end, false)} ${(end >= 720 ? 'PM' : 'AM')}`,
    });
});

router.post("/update_faculty/:deptID", async (req, res) => {
    const user = req.account;
    if (!user || (user.type != "admin" && user.type != "chair")) {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before updating department name or chairperson."
            }
        });
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    const { id, status, teach_load, last_name, first_name, middle_name, email, is_chair } = req.body.new;

    if (email != req.body.old.email) {
        const [{ totalDuplicates }] = await DB.executeQuery(
            `SELECT COUNT(*) AS totalDuplicates FROM Users WHERE email = '${email}'`
        );

        if (totalDuplicates > 0) {
            return res.status(409).json({
                message: {
                    mode: 0,
                    title: "Duplicate e-mail",
                    body: "Could not save the changes you requested"
                }
            });
        }
    }

    let query = `UPDATE Faculty f INNER JOIN Departments d ON f.dept_id = d.id INNER JOIN Colleges col ON ` +
        `d.college_id = col.id INNER JOIN Users u ON f.id = u.id SET f.status = '${status}', ` +
        `f.teach_load = ${teach_load}, f.last_name = '${last_name}', f.first_name = '${first_name}', ` +
        `f.middle_name = '${middle_name}', u.email = '${email}' WHERE (d.chair_id = '${user.id}' OR ` +
        `col.school_id = '${user.id}') AND f.id = '${id}';`;

    if (is_chair >= 1 && user.type == "admin") {
        query += `UPDATE Users u INNER JOIN Departments d ON u.id = d.chair_id SET u.type = 3 WHERE ` +
            `d.id = '${req.params.deptID}' LIMIT 1;` +
            `UPDATE Departments SET chair_id = '${id}' WHERE id = '${req.params.deptID}' LIMIT 1;` +
            `UPDATE Users SET type = 2 WHERE id = '${id}' LIMIT 1;`;
    } else if (is_chair < 1 && user.type == "admin") {
        query += `UPDATE Users u INNER JOIN Departments d ON u.id = d.chair_id SET u.type = 3 WHERE ` +
            `d.id = '${req.params.deptID}' AND d.chair_id = '${id}' LIMIT 1;` +
            `UPDATE Departments SET chair_id = CASE WHEN chair_id = '${id}' THEN NULL ELSE chair_id END ` +
            `WHERE id = '${req.params.deptID}' LIMIT 1;`;
    }

    await DB.executeQuery(query);
    res.status(200).end();
});

router.post("/update_room/:id", async (req, res) => {
    const user = req.account;
    if (!user || user.type != "admin") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before updating department name or chairperson."
            }
        });
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    const { name, level, capacity } = req.body;

    await DB.executeQuery(
        `UPDATE Rooms ` +
        `SET name = '${name}', level = '${level}', capacity = '${capacity}' ` +
        `WHERE id = '${req.params.id}'`
    );
});

router.post("/update_subject/:id", async (req, res) => {
    const user = req.account;
    if (!user || user.type != "admin") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before updating department name or chairperson."
            }
        });
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    const { code, title, type, units, req_hours, pref_rooms } = req.body;

    await DB.executeQuery(
        `UPDATE Subjects ` +
        `SET code = '${code}', title = '${title}', type = '${type}', units = '${units}', req_hours = '${req_hours}', pref_rooms = '${pref_rooms}' ` +
        `WHERE id = '${req.params.id}'`
    );
});

router.post("/import_subjects/:id", upload.single('csvFile'), async (req, res) => {
    const user = req.account;
    if (!user || user.type != "admin") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before importing schedules."
            }
        });
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    let collegeName;

    try {
        [{ collegeName }] = await DB.executeQuery(
            `SELECT name AS collegeName FROM Colleges WHERE id = '${req.params.id}' LIMIT 1`
        );
    } catch (error) {
        console.log(error);
        res.cookie("serverMessage", {
            mode: 0,
            title: "Server Error",
            body: "Unexpected issue was found, please try again later as we fix this."
        });
        return res.status(500).redirect("/admin/subjects");
    }

    if (!collegeName) {
        res.cookie("serverMessage", {
            mode: 0,
            title: "Invalid college",
            body: "Could not import subjects becuase no college was found."
        });
        return res.status(404).redirect("/admin/subjects");
    }

    let existingSubjs = await DB.executeQuery(
        `SELECT s.code FROM Subjects s INNER JOIN Colleges col ON s.college_id = col.id ` +
        `WHERE col.school_id = '${user.id}'`
    );
    existingSubjs = existingSubjs.map(subj => subj.code);

    var results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => {
            results.push(data)
        })
        .on('end', async () => {
            let i;
            for (i = 0; i < results.length; i++) {
                const { code, title, type, units, req_hours, pref_rooms } = results[i];

                if (!code || !title || !units || !req_hours) {
                    res.cookie("serverMessage", {
                        mode: 2,
                        title: "Incomplete import",
                        body: `Missing data in <b>row #${i + 1}</b>. Please ensure code, title, units, and req_hours are not empty`
                    });
                    break;
                } else if (existingSubjs.includes(code)) {
                    res.cookie("serverMessage", {
                        mode: 2,
                        title: "Duplicate import",
                        body: `Duplicate subject code was detected in <b>row #${i + 1}</b>. Please ensure code is unique.`
                    });
                    break;
                }

                const subjID = crypto.randomBytes(6).toString("base64url");
                results[i] = `('${subjID}', '${req.params.id}', '${code}', '${title}', ` +
                    `${(!type || type == '') ? 'NULL' : `'${type}'`}, ${units}, ${req_hours}, '${pref_rooms}')`;
            }

            if (i <= 0) return res.status(200).redirect("/admin/subjects/" + collegeName.split(" ").join("_"));;

            try {
                await DB.executeQuery(
                    `INSERT INTO Subjects (id, college_id, code, title, type, units, req_hours, ` +
                    `pref_rooms) VALUES ${results.slice(0, i + 1).join(", ")};`
                );
            } catch (error) {
                console.error(error);
                res.cookie("serverMessage", {
                    mode: 0,
                    title: "Server Error",
                    body: "Unexpected issue was found, please try again later as we fix this."
                });
                return res.status(500).redirect("/admin/subjects/" + collegeName.split(" ").join("_"));
            }

            res.status(200).redirect("/admin/subjects/" + collegeName.split(" ").join("_"));
        }).on("error", () => res.res.cookie("serverMessage", {
            mode: 0,
            title: "Server Error",
            body: "Unexpected issue was found, please try again later as we fix this."
        }).status(500).redirect("/admin/subjects/" + collegeName.split(" ").join("_")));
});

router.get("/unavailable-rooms/:term", async (req, res) => {
    const user = req.account;
    if (!user || user.type != "chair") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before updating schedules."
            }
        });
        return res.status(401).json({ redirect: "/logout" });
    }

    const DB = req.app.locals.database;
    const { start, end, day } = req.query || req.body;
    console.log(req.query);

    if (!start || !end || !day) {
        return res.status(400).json({
            message: "Please enter day, start and end time"
        });
    }

    const conflictRooms = await DB.executeQuery(
        `SELECT DISTINCT r.id, r.name FROM Rooms r INNER JOIN (SELECT * FROM ` +
        `Schedules WHERE day = ${day} AND ((start <= ${start} AND ${start} < end) OR ` +
        `(start < ${end} AND ${end} <= end) OR (${start} <= start AND start < ${end}) OR ` +
        `(${start} < end AND end <= ${end})) AND term_id = '${req.params.term}') AS sc ON r.id = sc.room_id ` +
        `ORDER BY r.name`
    );

    console.table(conflictRooms);
    res.status(200).json({ rooms: conflictRooms.map(r => r.id) });
});

router.post("/pref-deadline/:term", async (req, res) => {
    const user = req.account;
    if (!user || user.type != "chair") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before updating schedules."
            }
        });
        return res.status(401).json({ redirect: "/logout" });
    }

    if (!req.body.deadline) {
        return res.status(409).json({
            message: {
                mode: 0,
                title: "Invalid parameters",
                body: "Could not set deadline for preference forms without appropriate deadline."
            }
        });
    }

    const DB = req.app.locals.database;
    await DB.executeQuery(
        `UPDATE Preferences p INNER JOIN Faculty f ON p.faculty_id = f.id INNER JOIN Departments d ON ` +
        `f.dept_id = d.id SET p.deadline = '${req.body.deadline}' WHERE d.chair_id = '${user.id}' AND ` +
        `p.term_id = '${req.params.term}'`
    );

    res.cookie("serverMessage", {
        mode: 1, title: "Deadline set",
        body: "Faculty under your department should finalize their preference on or before the deadline."
    }).status(200).end();

    const [[term], faculty] = await DB.executeQuery(
        `SELECT year, term AS semester FROM Terms WHERE id = '${req.params.term}' LIMIT 1;` +

        `SELECT u.email, d.name FROM Faculty f INNER JOIN Users u ON f.id = u.id INNER JOIN Departments d ON ` +
        `f.dept_id = d.id WHERE d.chair_id = '${user.id}' ORDER BY u.email;`
    );
    let deadline = new Date(req.body.deadline);
    deadline = `${deadline.toLocaleTimeString().replace(/([\d]+:[\d]{2})(:[\d]{2})(.*)/, "$1$3")} of ` +
    `${monthNames[deadline.getMonth()]} ${deadline.getDate()}, ${deadline.getFullYear()}`;
    
    const mailer = req.app.locals.mailer;
    const content = await ejs.renderFile(
        __dirname + "/../views/mail-template/reopen-preference-form.ejs",
        { 
            year: parseInt(term.year), semester: toOrdinal(term.semester), 
            loginLink: `http://${process.env.API_DOMAIN}/login`, deadline: deadline,
            department: faculty[0].name
        }
    );
    
    let mailOptions = {
        to: faculty.map(f => f.email),
        subject: `Preference Form Deadline Extension (A.Y. ${term.year}-${term.semester})`,
        html: content
    };
    
    await mailer.sendEmail(mailOptions);
});

module.exports = router;
