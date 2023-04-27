const router = require("express").Router();
const crypto = require("node:crypto");
const { verifySession } = require("./../lib/verification");
const { createFaculty } = require("./../lib/account");

// for CRUD purposes, sub-directly controlled from client side
router.use(verifySession);

// for admin control
router.route("/departments/:collegeID?")
    .get(async (req, res) => {
        if (!req.account) {
            return res.status(401).end();
        }

        const DB = req.app.locals.database;
        let query =
            `SELECT d.id, d.name AS department, CASE WHEN d.chair_id IS NULL THEN "NULL" ELSE ` +
            `CONCAT(f.last_name, ", ", f.first_name, " ", f.middle_name, " (", f.faculty_id, ")") END AS chairperson, ` +
            `d.chair_id, "Logged in" as activity FROM Schools s INNER JOIN Colleges col ON ` +
            `s.id = col.school_id INNER JOIN Departments d ON col.id = d.college_id ` +
            `LEFT JOIN Faculty f ON d.chair_id = f.id WHERE s.id = "${req.account.id}"`;
        if (req.params.collegeID) {
            query += ` AND col.id = "${req.params.collegeID}"`;
        }
        query += " ORDER BY d.name";

        res.status(200).json({ departments: await DB.executeQuery(query) });

    }).post(async (req, res) => {
        if (req.account && req.params.collegeID) {
            const DB = req.app.locals.database;
            let deptID = crypto.randomBytes(6).toString("base64url");
            await DB.executeQuery(
                `INSERT INTO Departments (id, college_id, name) VALUES ('${deptID}', ` +
                `'${req.params.collegeID}', '${req.body.department}')`
            );
            res.status(200).json({
                message: {
                    mode: 1,
                    title: "New Department created",
                    body: "You can now add faculty members in the department and assign a chairperson."
                }
            });
        } else {
            res.status(401).end();
        }
    });

router.post("/chairperson/:deptID?", async (req, res) => {
    if (!req.account || !req.params.deptID) {
        return res.status(401).end();
    }

    const DB = req.app.locals.database;
    let chair = req.body.chair.split("(");
    let lastName = chair[0].split(",")[0];
    chair = chair[1].slice(0, -1);

    let newChairID = await DB.executeQuery(
        `SELECT id FROM Faculty WHERE faculty_id = '${chair}' AND last_name = '${lastName}' LIMIT 1;`
    );
    newChairID = newChairID[0]["id"];

    if (newChairID.length < 1) {
        return res.status(402).end();
    }

    let prevChairID = await DB.executeQuery(
        `SELECT chair_id FROM Departments WHERE id = '${req.params.deptID}' LIMIT 1;`
    );
    prevChairID = prevChairID[0]["id"];

    try {
        await DB.executeQuery(
            `UPDATE Users SET type = 2 WHERE id = "${newChairID}" LIMIT 1;` +
            `UPDATE Users SET type = 3 WHERE id = "${prevChairID}" LIMIT 1;` +
            `UPDATE Departments d INNER JOIN Colleges col ON d.college_id = col.id ` +
            `SET d.chair_id = "${newChairID}" WHERE d.id = "${req.params.deptID}" AND ` +
            `col.school_id = "${req.account.id}" LIMIT 1;`
        );
    } catch (error) {
        return res.status(200).json({
            message: {
                mode: 0,
                title: "Chairperson not changed",
                body: "An error occured and the chairperson was unable to be changed."
            }
        })
    }

    res.status(200).json({
        message: {
            mode: 1,
            title: "Chairperson changed",
            body: "All chairperson privileges and data have been transferred to the new chairperson."
        }
    });
});

router.post("/colleges", async (req, res) => {
    if (!req.account || !req.body.name) {
        return res.status(401).end();
    }

    const DB = req.app.locals.database;
    let sameCollege = await DB.executeQuery(
        `SELECT COUNT(*) FROM Colleges WHERE school_id = '${req.account.id}' AND name = '${req.body.name}'`
    );
    if (sameCollege[0]["COUNT(*)"] > 0) {
        return res.status(409).end();
    }
    let collegeID = crypto.randomBytes(6).toString("base64url");
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
    .get(async (req, res) => {
        if (req.account) {
            const DB = req.app.locals.database;
            let query;
            if (req.query.columns) {
                query = `SELECT f.${req.query.columns.join(", f.")}, `;
            } else {
                query = `SELECT f.faculty_id, f.teach_load, f.status, f.first_name, f.middle_name, f.last_name, `;
            }

            query += `u.email, "My Schedule" AS schedule FROM Colleges col INNER JOIN Departments d ` +
                `ON col.id = d.college_id INNER JOIN Faculty f ON d.id = f.dept_id INNER JOIN Users u ` +
                `ON f.id = u.id WHERE (col.school_id = "${req.account.id}" OR d.chair_id = "${req.account.id}")`;
            if (req.params.deptID) {
                query += ` AND d.id = "${req.params.deptID}"`
            }
            query += " ORDER BY f.status, f.last_name";
            res.status(200).json({ faculty: await DB.executeQuery(query) });
        } else {
            res.status(401).end();
        }
    }).post(createFaculty, (req, res) => {
        res.status(200).json({
            message: {
                mode: 1,
                title: "Faculty Signed Up",
                body: `A temporary password was sent to their e-mail address.`
            }
        });
    });

router.route("/subjects/:collegeID?")
    .get(async (req, res) => {
        if (!req.account) {
            return res.status(401).end();
        }

        const DB = req.app.locals.database;
        let query = `SELECT sub.code, sub.title, sub.units, sub.req_hours, sub.type, sub.pref_rooms FROM Subjects sub ` +
            `INNER JOIN Colleges col ON sub.college_id = col.id AND col.school_id = '${req.account.id}'`
        if (req.params.collegeID) {
            query += ` AND col.id = "${req.params.collegeID}"`
        }
        query += " ORDER BY sub.title, sub.type"
        res.status(200).json({ subjects: await DB.executeQuery(query) });
    })
    .post(async (req, res) => {
        if (!req.account) {
            return res.status(401).end();
        }

        const DB = req.app.locals.database;
        let { code, title, type, units, req_hours, pref_rooms } = req.body;

        const subjID = crypto.randomBytes(6).toString("base64url");
        type = (type == "LEC") ? 1 : (type == "LAB") ? 2 : "NULL";
        await DB.executeQuery(
            `INSERT INTO Subjects VALUES ('${subjID}', '${req.params.collegeID}', '${code}', '${title}', ` +
            `${type}, ${units || 0}, ${req_hours || 0}, '${pref_rooms}')`
        );
        res.status(200).json({
            message: {
                mode: 1,
                title: "New Subject Added",
                body: `${title} (${type}) is available for the college curriculum.`
            }
        });
    });

router.route("/rooms/:bldgID?")
    .get(async (req, res) => {
        if (!req.account) {
            return res.status(401).end();
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
    .post(async (req, res) => {
        if (!req.account) {
            return res.status(401).end();
        }

        const DB = req.app.locals.database;
        let room = req.body;
        let sameRooms = await DB.executeQuery(
            `SELECT COUNT(*) FROM Rooms r INNER JOIN Buildings b ON r.bldg_id = b.id WHERE ` +
            `b.school_id = '${req.account.id}' AND b.id = '${req.params.bldgID}' AND r.name = '${room.name}'`
        );

        if (sameRooms[0]["COUNT(*)"] > 0) {
            return res.status(409).end();
        }

        const roomID = crypto.randomBytes(6).toString("base64url");
        await DB.executeQuery(
            `INSERT INTO Rooms VALUES ('${req.params.bldgID}', '${roomID}', '${room.name}', ` +
            `${room.level}, ${room.capacity || "NULL"})`
        );
        res.status(200).json({
            message: {
                mode: 1,
                title: "New Room Created",
                body: `${room.name} is open for new class schedules.`
            }
        });
    });

router.post("/buildings", async (req, res) => {
    if (!req.account || !req.body.name) {
        return res.status(401).end();
    }

    const DB = req.app.locals.database;
    let sameCollege = await DB.executeQuery(
        `SELECT COUNT(*) FROM Buildings WHERE school_id = '${req.account.id}' AND name = '${req.body.name}'`
    );
    if (sameCollege[0]["COUNT(*)"] > 0) {
        return res.status(409).end();
    }
    const bldgID = crypto.randomBytes(6).toString("base64url");
    await DB.executeQuery(
        `INSERT INTO Buildings VALUES ('${bldgID}', '${req.account.id}', '${req.body.name}')`
    );
    res.status(200).json({
        message: {
            mode: 1,
            title: "New Building Created",
            body: `${req.body.name} is ready for new rooms.`
        }
    });
});

// for chairperson control
router.post("/courses", async (req, res) => {
    const user = req.account;
    if (!req.account || !req.body.name) {
        return res.status(401).end();
    }

    const DB = req.app.locals.database;
    const sameCourses = await DB.executeQuery(
        `SELECT co.id FROM (SELECT s.id FROM Departments d INNER JOIN Colleges col ON d.college_id = col.id ` +
        `INNER JOIN Schools s ON col.school_id = s.id WHERE d.chair_id = '${user.id}') AS school INNER JOIN ` +
        `Colleges col ON school.id = col.school_id INNER JOIN Departments d ON col.id = d.college_id INNER JOIN ` +
        `Courses co ON d.id = co.dept_id WHERE co.title = '${req.body.name}'`
    );

    if (sameCourses.length > 0) {
        return res.status(409).end();
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

router.route("/curriculums/:courseID?") // getting and adding the semesters in a course's curriculum
    .get(async (req, res) => {
        if (!req.account || !req.params.courseID) {
            return res.status(401).end();
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
        if (!req.account || !req.params.courseID) {
            return res.status(401).end();
        }

        const DB = req.app.locals.database;
        let [latestYear] = await DB.executeQuery(
            `SELECT MAX(year) AS year FROM Curricula WHERE course_id = "${req.params.courseID}"`
        );
        latestYear = latestYear.year || 0;
        const data = req.body;
        if (data.latestYear != latestYear) {
            return res.status(409).end();
        }

        let query = `INSERT INTO Curricula VALUES `;
        let message;
        if (data.forNewYear) {
            const [{ totalTerms }] = await DB.executeQuery(
                `SELECT s.total_terms_yearly AS totalTerms FROM Schools s INNER JOIN Colleges col ON s.id = col.school_id ` +
                `INNER JOIN Departments d ON col.id = d.college_id WHERE d.chair_id = '${req.account.id}' LIMIT 1`
            )
            console.log(totalTerms);
            message = `A new academic year with ${totalTerms} semesters is ready.`;

            for (let i = 1; i <= totalTerms; i++) {
                query += `('${req.params.courseID}', NULL, ${latestYear + 1}, '${i}'), `
            }
            query = query.slice(0, -2);
        } else {
            message = "A summer term in the curriculum is ready."
            query += `('${req.params.courseID}', NULL, ${latestYear}, 's')`;
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
    const user = req.account;
    if (!user) {
        return res.status(401).end();
    }

    const DB = req.app.locals.database;
    const {code, title} = req.body;
    const {courseID} = req.params;
    let subjID;
    if (code && title) {
        [subjID] = await DB.executeQuery(
            `SELECT id, code, CASE WHEN type IS NULL THEN title ELSE CONCAT(title, " (", type, ")") ` +
            `END as title, units FROM Subjects WHERE code = '${code}' OR title LIKE '%${title}%' LIMIT 1`
        );
    } else if (title) {
        [subjID] = await DB.executeQuery(
            `SELECT s.id, s.code, CASE WHEN type IS NULL THEN title ELSE CONCAT(title, " (", type, ")") ` +
            `END as title, units FROM Subjects s INNER JOIN Curricula cu ON s.id = cu.subj_id ` +
            `WHERE s.title LIKE '%${title}$' AND cu.course_id != '${courseID}' LIMIT 1`
        );
    } else {
        [subjID] = await DB.executeQuery(
            `SELECT id, code, CASE WHEN type IS NULL THEN title ELSE CONCAT(title, " (", type, ")") ` +
            `END as title, units FROM Subjects WHERE code = '${code}' LIMIT 1`
        );
    }

    if (!subjID) {
        return res.status(404).end();
    }

    const {year, semester} = req.body;
    const semesterContent = await DB.executeQuery(
        `SELECT subj_id FROM Curricula WHERE course_id = '${req.params.courseID}' AND year = ${year} ` +
        `AND term = '${semester}'`
    );

    if (semesterContent <= 1) {
        await DB.executeQuery(
            `UPDATE Curricula SET subj_id = '${subjID.id}' WHERE course_id = '${req.params.courseID}' ` +
            `AND year = ${year} AND term = '${semester}' LIMIT 1`
        );
    } else {
        await DB.executeQuery(
            `INSERT INTO Curricula VALUES ('${req.params.courseID}', '${subjID.id}', ${year}, '${semester}')`
        );
    }

    res.status(200).json({
        newSubject: subjID,
        message: {
            mode: 1,
            title: "New Subject Added",
            body: `You can now create a class for the blocks taking this course.`
        }
    });
});

router.post("/terms", async (req, res) => {
    const user = req.account
    if (!user) {
        return res.status(401).end();
    }

    const DB = req.app.locals.database;
    const { year, term } = req.body;
    let sameTerms = await DB.executeQuery(
        `SELECT t.id FROM Departments d INNER JOIN Colleges col ON d.college_id = col.id INNER JOIN ` +
        `Terms t ON col.school_id = t.school_id WHERE d.chair_id = "${user.id}" AND ` +
        `t.year = ${year} AND t.term = "${term}"`
    );

    if (sameTerms.length > 0) {
        return res.status(409).end();
    }

    const [{ schoolID }] = await DB.executeQuery(
        `SELECT col.school_id AS schoolID FROM Departments d INNER JOIN Colleges col ON d.college_id = col.id ` +
        `WHERE d.chair_id = "${user.id}" LIMIT 1`
    );

    const termID = crypto.randomBytes(6).toString("base64url");
    const faculty = await DB.executeQuery(`SELECT id FROM Faculty ORDER by dept_id`);

    const courses = await DB.executeQuery(
        `SELECT DISTINCT co.id, MAX(cu.year) AS total_years FROM Courses co INNER JOIN Curricula cu ON co.id = cu.course_id ` +
        `INNER JOIN Departments d ON co.dept_id = d.id GROUP BY co.id`
    );

    for (let i = 0; i < faculty.length; i++) {
        const prefID = crypto.randomBytes(6).toString("base64url");
        faculty[i] = `('${prefID}', '${termID}', '${faculty[i].id}')`;
    }

    const blocks = [];
    for (const course of courses) {
        const { id, total_years } = course;
        for (let i = 1; i <= total_years; i++) {
            const blockID = crypto.randomBytes(6).toString("base64url");
            blocks.push(`('${blockID}', '${id}', '${termID}', ${i})`);
        }
    }

    console.log(faculty);
    let query = `INSERT INTO Terms VALUES ('${termID}', '${schoolID}', ${year}, '${term}', 1, current_timestamp); ` +
        `INSERT INTO Blocks (id, course_id, term_id, year) VALUES ${blocks.join(",")}; ` +
        `INSERT INTO Preferences (id, term_id, faculty_id) VALUES ${faculty.join(",")};` +
        `INSERT INTO Schedules (term_id, subj_id, block_id) ` +
        `SELECT b.term_id, cu.subj_id, b.id FROM Blocks b INNER JOIN Curricula cu ON b.course_id = cu.course_id ` +
        `AND b.year = cu.year WHERE b.term_id = '${termID}' AND cu.term = '${term}' AND cu.subj_id IS NOT NULL ` +
        `ORDER BY b.year, b.block_no`

    await DB.executeQuery(query);
    res.status(200).json({
        termID: termID,
        message: {
            mode: 1,
            title: "New Term Created",
            body: `You can now enter the teaching load of the professors for this semester.`
        }
    });
});

router.route("/schedules/:termID")
    .get(async (req, res) => {
        const user = req.account;
        if (!user) {
            return res.status(401).end();
        }

        const DB = req.app.locals.database;
        let query;
        if (req.query.category == "faculty") {
            query = `SELECT f.id, CONCAT(f.last_name, ", ", f.first_name, " ", f.middle_name) AS name, ` +
                `f.faculty_id, CONCAT(pref.assigned_load, " / ", f.teach_load) AS teach_load, pref.status AS pref_status, ` +
                `f.status AS faculty_status FROM Terms t INNER JOIN Preferences pref ON t.id = pref.term_id ` +
                `INNER JOIN Faculty f ON pref.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id ` +
                `WHERE d.chair_id = '${user.id}' AND t.id = '${req.params.termID}' ` +
                `ORDER BY f.status, name`;
        } else {
            query = `SELECT id, year, block_no, total_students FROM Blocks WHERE course_id = "${req.query.category}" ` +
                `AND term_id = "${req.params.termID}" ORDER BY year, block_no`;
        }

        res.status(200).json({ schedules: await DB.executeQuery(query) });

    }).post(async (req, res) => {
        const user = req.account;
        if (!user) {
            return res.status(401).end();
        }

        const { termID } = req.params;
        const DB = req.app.locals.database;
        const { subject, mode, room, block, partial } = req.body.schedule;
        let { day, start, end } = req.body.schedule;
        const facultyID = req.body.faculty;
        // (rs.start < start && rs.end > start) || (rs.start < end && rs.end > end)
        const conflicts = await DB.executeQuery(
            `SELECT sc.faculty_id, sc.block_id, sc.day, sc.start, sc.end FROM Schedules sc LEFT JOIN Rooms r ON ` +
            `sc.room_id = r.id WHERE sc.term_id = '${termID}' AND (sc.faculty_id = '${facultyID}' OR ` +
            `sc.block_id = '${block}') AND sc.day = ${day} AND ((sc.start < ${start} AND sc.end > ${start}) OR ` +
            `(sc.start < ${end} AND sc.end > ${end})) ORDER BY sc.start`
        );
        console.log(conflicts);

        if (conflicts.length > 0) {
            let classHours = end - start;
            const lastConflict = conflicts.at(-1);
            if (lastConflict.end + classHours <= 22 * 60) {
                start = lastConflict.end;
                end = lastConflict.end + classHours;
            } else {
                return res.status(409).end();
            }
        }

        let roomID;
        if (mode == 1 && room == "") {
            const [{ id }] = await DB.executeQuery(
                `SELECT CONCAT("'", r.id, "'") AS id FROM ROOMS r INNER JOIN Buildings b ON r.bldg_id = b.id ` +
                `INNER JOIN Terms t ON  b.school_id = t.school_id LEFT JOIN Schedules sc ON r.id = sc.room_id ` +
                `WHERE sc.day != ${day} OR ((sc.start > ${start} AND sc.start >= ${end}) OR ` +
                `(sc.end <= ${start} AND sc.end < ${end})) OR (sc.faculty_id IS NULL AND ` +
                `sc.day IS NULL AND sc.start IS NULL AND sc.end IS NULL) LIMIT 1`
            );
            roomID = id;
        } else if (mode == 1) {
            const regexRoom = room.split(" ");
            const [{ id }] = await DB.executeQuery(
                `SELECT CONCAT("'", r.id, "'") AS id FROM ROOMS r INNER JOIN Buildings b ON r.bldg_id = b.id ` +
                `INNER JOIN Terms t ON  b.school_id = t.school_id LEFT JOIN Schedules sc ON r.id = sc.room_id ` +
                `WHERE r.name LIKE '%${regexRoom.join("%")}%' AND (sc.day != ${day} OR ((sc.start > ${start} AND ` +
                `sc.start >= ${end}) OR (sc.end <= ${start} AND sc.end < ${end})) OR (sc.faculty_id IS NULL AND ` +
                `sc.day IS NULL AND sc.start IS NULL AND sc.end IS NULL)) LIMIT 1`
            );
            roomID = id;
        }

        let query;
        if (partial == 'true') {
            query = `INSERT INTO Schedules VALUES ('${termID}', '${subject}', '${block}', ` +
                `'${facultyID}', ${(!roomID) ? "NULL" : roomID}, ${day}, ${start}, ${end}, ${mode})`;
        } else {
            query = `UPDATE Schedules SET faculty_id = '${facultyID}', room_id = ${(!roomID) ? "NULL" : roomID}, ` +
                `day = ${day}, start = ${start}, end = ${end}, mode = ${mode} WHERE block_id = '${block}' AND ` +
                `subj_id = '${subject}' AND term_id = '${termID}' AND faculty_id IS NULL LIMIT 1;` +

                `UPDATE Schedules sc LEFT JOIN Subjects s ON sc.subj_id = s.id INNER JOIN Preferences p ` +
                `ON sc.term_id = p.term_id AND sc.faculty_id = p.faculty_id ` +
                `SET p.assigned_load = (p.assigned_load + s.units) WHERE sc.term_id = '${termID}' AND ` +
                `sc.subj_id = '${subject}' AND sc.block_id = '${block}' AND p.faculty_id = '${facultyID}' LIMIT 1;`;
        };

        await DB.executeQuery(query);
        return res.status(200).json({
            message: {
                mode: 1,
                title: "New Class Assigned",
                body: `If the schedule is not fully plotted, please assign the remaining hours`
            }
        });
    });

router.post("/blocks/:courseID", async (req, res) => {
    if (!req.account) {
        return res.status(401).end(); // unauthorized request
    }

    const DB = req.app.locals.database;
    const { termID, year, totalStudents } = req.body;
    let newBlock = await DB.executeQuery(
        `SELECT MAX(b.block_no) + 1 AS new_block FROM (SELECT block_no FROM Blocks WHERE year = ${year} ` +
        `AND course_id = '${req.params.courseID}' AND term_id = '${termID}' AND block_no IS NOT NULL) AS b `
    );

    newBlock = newBlock[0]["new_block"];
    if (!newBlock || newBlock <= 1) {
        return res.status(409).end(); // block number conflict
    }

    const blockID = crypto.randomBytes(6).toString("base64url");
    let query;
    if (totalStudents) {
        query = `INSERT INTO Blocks VALUES ('${blockID}', '${req.params.courseID}', '${termID}', ` +
            `${year}, ${newBlock}, ${totalStudents}); `
    } else {
        query = `INSERT INTO Blocks (id, term_id, course_id, year, block_no) VALUES ('${blockID}', '${termID}', ` +
            `'${req.params.courseID}', ${year}, ${newBlock}); `
    }

    query += `INSERT INTO Schedules (term_id, subj_id, block_id) ` +
        `SELECT b.term_id, cu.subj_id, b.id FROM Blocks b INNER JOIN Curricula cu ON b.course_id = cu.course_id ` +
        `AND b.year = cu.year INNER JOIN Terms t ON b.term_id = t.id AND cu.term = t.term WHERE ` +
        `b.term_id = '${termID}' AND b.year = ${year} AND b.block_no = ${newBlock} AND cu.subj_id IS NOT NULL ` +
        `ORDER BY b.year, b.block_no;`

    await DB.executeQuery(query);
    res.status(200).json({
        newBlock: newBlock,
        message: {
            mode: 1,
            title: "New block created",
            body: `Block ${year}-${newBlock} is ready for class scheduling.`
        }
    });
});

// faculty control
router.post("/preferences/:prefID", async (req, res) => {
    // check if logged in, that is req.account is defined
    const user = req.account;
    if (!user) {
        return res.status(401).end();
    }

    const DB = req.app.locals.database;
    let { subjects, schedules } = req.body;
    schedules = schedules.filter((val) => {
        const { start, end } = val;
        return start != "" && end != "" && parseInt(start) < parseInt(end);
    });

    if (schedules.length > 0) {
        await DB.executeQuery(
            `INSERT INTO PrefSchedules VALUES ` +
            `(${schedules.map((val) => `'${req.params.prefID}', ` + Object.values(val).join(", ")).join(`), (`)})`
        );
    }

    if (subjects.length > 0) {
        await DB.executeQuery(
            `INSERT INTO PrefSubjects SELECT DISTINCT '${req.params.prefID}', sub.id FROM Faculty f INNER JOIN Departments d ON ` +
            `f.dept_id = d.id INNER JOIN Subjects sub ON d.college_id = sub.college_id WHERE f.id = '${user.id}' ` +
            `AND sub.title IN ('${subjects.join("', '")}')`
        );
    }

    await DB.executeQuery(
        `UPDATE Preferences SET status = 2 WHERE id = '${req.params.prefID}' AND faculty_id = '${user.id}'`
    );

    res.status(200).json({
        message: {
            mode: 1,
            title: "Teaching load updated",
            body: `We suggest modifying the schedule again to take account new load`
        }
    });
});

module.exports = router;