const router = require("express").Router();
const crypto = require("node:crypto");
const { verifySession } = require("./../lib/verification");
const { createFaculty } = require("./../lib/account");

// for CRUD purposes, sub-directly controlled from client side
router.use(verifySession);

// for admin control
router.route("/departments/:collegeID?")
    .get(async (req, res) => {
        if (req.account) {
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
        } else {
            res.status(401).end();
        }
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
                query = `SELECT f.faculty_id, f.status, f.first_name, f.middle_name, f.last_name, `;
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
        let query = `SELECT sub.code, sub.title, sub.units, sub.type FROM Subjects sub INNER JOIN Colleges col ON ` +
            `sub.college_id = col.id AND col.school_id = '${req.account.id}'`
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
        let subj = req.body;
        
        const subjID = crypto.randomBytes(6).toString("base64url");
        let type = (subj.type == "LEC") ? 1 : (subj.type == "LAB") ? 2 : "NULL";
        await DB.executeQuery(
            `INSERT INTO Subjects VALUES ('${subjID}', '${req.params.collegeID}', '${subj.code}', '${subj.title}', ` +
            `${type}, ${subj.units || 0})`
        );
        res.status(200).json({
            message: {
                mode: 1,
                title: "New Subject Added",
                body: `${subj.title} (${subj.type}) is available for the college curriculum.`
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
router.post("/courses", (req, res) => {
    if (!req.account || !req.body.title) {
        return res.status(401).end();
    }
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
            return res.status(200).json({ curriculum: terms });
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
        const totalUnits = await DB.executeQuery(
            `SELECT SUM(sub.units) FROM Curricula cu INNER JOIN Subjects sub ON cu.subj_id = sub.id ` +
            `WHERE cu.course_id = "${req.params.courseID}" AND cu.subj_id IS NOT NULL`
        )
        res.status(200).json({ curriculum: terms, totalUnits: totalUnits[0]["SUM(sub.units)"] });
    }).post(async (req, res) => {
        if (!req.account || !req.params.courseID) {
            return res.status(401).end();
        }

        const DB = req.app.locals.database;
        let latestYear = await DB.executeQuery(
            `SELECT MAX(year) FROM Curricula WHERE course_id = "${req.params.courseID}"`
        );
        latestYear = latestYear[0]["MAX(year)"] || 0;
        const data = req.body;
        if (data.latestYear != latestYear) {
            return res.status(409).end();
        }

        let query = `INSERT INTO Curricula VALUES `;
        let message;
        if (data.forNewYear) {
            const totalTerms = req.account.totalTerms;
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
    const data = req.body;
    let subjID;
    if (!data.title) {
        subjID = await DB.executeQuery(
            `SELECT id, code, CASE WHEN type IS NULL THEN title ELSE CONCAT(title, " (", type, ")") ` +
            `END as title, units FROM Subjects WHERE code = '${data.code}' OR title ${data.title} LIMIT 1`
        );
    } else {
        subjID = await DB.executeQuery(
            `SELECT id, code, CASE WHEN type IS NULL THEN title ELSE CONCAT(title, " (", type, ")") ` +
            `END as title, units FROM Subjects WHERE code = '${data.code}' LIMIT 1`
        );
    }
    
    if (subjID.length == 0) {
        return res.status(404).end();
    }

    const semesterContent = await DB.executeQuery(
        `SELECT subj_id FROM Curricula WHERE course_id = '${req.params.courseID}' AND year = ${data.year} ` +
        `AND term = '${data.semester}'`
    );

    subjID = subjID[0];
    // TODO: add classes for blocks in open term schedules
    if (semesterContent <= 1) {
        await DB.executeQuery(
            `UPDATE Curricula SET subj_id = '${subjID["id"]}' WHERE course_id = '${req.params.courseID}' ` +
            `AND year = ${data.year} AND term = '${data.semester}' LIMIT 1`
        );
    } else {
        await DB.executeQuery(
            `INSERT INTO Curricula VALUES ('${req.params.courseID}', '${subjID["id"]}', ${data.year}, '${data.semester}')`
        );
    }

    subjID["id"] = undefined;
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

    let schoolID = await DB.executeQuery(
        `SELECT col.school_id FROM Departments d INNER JOIN Colleges col ON d.college_id = col.id ` +
        `WHERE d.chair_id = "${user.id}" LIMIT 1`
    );
    schoolID = schoolID[0]["school_id"];
    const termID = crypto.randomBytes(6).toString("base64url");
    const faculty = await DB.executeQuery(
        `SELECT f.id FROM Faculty f INNER JOIN Departments d ON f.dept_id = d.id ` +
        `WHERE d.chair_id = "${user.id}"`
    );
    const yearsPerCourse = await DB.executeQuery(
        `SELECT DISTINCT co.id, cu.year FROM Courses co INNER JOIN Curricula cu ON co.id = cu.course_id ` +
        `INNER JOIN Departments d ON co.dept_id = d.id WHERE d.chair_id = '${user.id}'`
    );
    
    for (let i = 0; i < faculty.length; i++) {
        const prefID = crypto.randomBytes(6).toString("base64url");
        faculty[i] = `('${prefID}', '${termID}', '${faculty[i]["id"]}')`;
    }
    
    for (let i = 0; i < yearsPerCourse.length; i++) {
        const blockID = crypto.randomBytes(6).toString("base64url");
        yearsPerCourse[i] = `('${blockID}', '${yearsPerCourse[i]["id"]}', '${termID}', ${yearsPerCourse[i]["year"]})`;
    }

    // TODO: INSERT blank schedules depending on the 
    let query = `INSERT INTO Terms VALUES ('${termID}', '${schoolID}', ${year}, '${term}', 1); ` +
        `INSERT INTO Blocks (id, course_id, term_id, year) VALUES ${yearsPerCourse.join(",")}; ` +
        `INSERT INTO Preferences (id, term_id, faculty_id) VALUES ${faculty.join(",")};` +
        `INSERT INTO Schedules (term_id, subj_id, block_id) ` +
        `SELECT b.term_id, cu.subj_id, b.id FROM Blocks b INNER JOIN Curricula cu ON b.course_id = cu.course_id ` +
        ` AND b.year = cu.year WHERE b.term_id = '${termID}' AND cu.term = '${term}' AND cu.subj_id IS NOT NULL ` +
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
        if (req.query.category == "faculty") {
            let query = `SELECT f.id, CONCAT(f.last_name, ", ", f.first_name, " ", f.middle_name) as name, ` +
                `f.faculty_id, f.status AS faculty_status, pref.teach_load, pref.status AS pref_status ` +
                `FROM Terms t INNER JOIN Preferences pref ON t.id = pref.term_id INNER JOIN ` +
                `Faculty f ON pref.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id ` +
                `WHERE d.chair_id = '${user.id}' AND t.id = '${req.params.termID}' ` +
                `ORDER BY f.status, name`;
            return res.status(200).json({ schedules: await DB.executeQuery(query) });
        }
        
        let query = `SELECT id, year, block_no, total_students FROM Blocks WHERE course_id = "${req.query.category}" ` +
            `AND term_id = "${req.params.termID}" ORDER BY year, block_no`;
        res.status(200).json({ schedules: await DB.executeQuery(query) });

    }).post(async (req, res) => {
        const user = req.account;
        if (!user) {
            return res.status(401).end();
        }

        const DB = req.app.locals.database;
        const { mode, room, block, day, start, end } = req.body.schedule;
        const facultyID = req.body.faculty;
        let roomID;
        if (room == "") {
            roomID = await DB.executeQuery(
                `SELECT r.id FROM ROOMS r INNER JOIN Buildings b ON r.bldg_id = b.id INNER JOIN Terms t ON ` +
                `b.school_id = t.school_id LEFT JOIN Schedules sc ON r.id = sc.room_id WHERE sc.day != '${day}' OR ` +
                `(sc.start > '${start}' AND sc.start > '${end}') OR (sc.end < '${start}' AND sc.end < '${end}')`
            )
        }
        
        console.log(req.body);

        return res.status(200).json({
            message: "New class assigned."
        });
    });

router.post("/preferences/:termID", async (req, res) => {
    if (!req.account) {
        return res.status(401).end();
    }
    
    const DB = req.app.locals.database;
    await DB.executeQuery(
        `UPDATE Preferences pref INNER JOIN Faculty f ON pref.faculty_id = f.id INNER JOIN Departments d ` +
        `ON f.dept_id = d.id SET pref.teach_load = ${req.body.load} WHERE pref.term_id = '${req.params.termID}' AND ` +
        `f.faculty_id = '${req.body.facultyID}' AND d.chair_id = '${req.account.id}' LIMIT 1`
    );
    res.status(200).json({
        message: {
            mode: 1,
            title: "Teaching load updated",
            body: `We suggest modifying the schedule again to take account new load`
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

module.exports = router;