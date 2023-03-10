const router = require("express").Router();
const crypto = require("node:crypto");
const { verifySession } = require("./../lib/verification");
const { createChair, createFaculty } = require("./../lib/account");

// for CRUD purposes, sub-directly controlled from client side

router.use(verifySession);

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
                query += ` AND col.id = "${req.params.collegeID}"`
            }
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
    if (req.account && req.params.deptID) {
        const DB = req.app.locals.database;
        let data = req.body;
        let chair = data.chair.split("(");
        let lastName = chair[0].split(",")[0];
        // console.log(chair[1], lastName);
        let chairID = await DB.executeQuery(
            `SELECT id FROM Faculty WHERE faculty_id = '${chair[1].slice(0, -1)}' AND last_name = '${lastName}' LIMIT 1;`
        );
        if (chairID.length < 1) {
            return res.status(402).end();
        }
        await DB.executeQuery(
            `UPDATE Departments d INNER JOIN Colleges col ON d.college_id = col.id ` +
            `SET d.chair_id = "${chairID[0]["id"]}" WHERE d.id = "${req.params.deptID}" AND ` +
            `col.school_id = "${req.account.id}" LIMIT 1`
        );
        res.status(200).json({
            message: {
                mode: 1,
                title: "Chairperson changed",
                body: "All chairperson privileges and data have be transferred to the new chairperson."
            }
        });
    } else {
        res.status(401).end();
    }
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
                query = `SELECT f.faculty_id, f.status, f.teach_load, f.first_name, f.middle_name, f.last_name, `;
            }
            query += `u.email, "My Schedule" AS schedule FROM Colleges col INNER JOIN Departments d ` +
                `ON col.id = d.college_id INNER JOIN Faculty f ON d.id = f.dept_id INNER JOIN Users u ` +
                `ON f.id = u.id WHERE col.school_id = "${req.account.id}"`;
            if (req.params.deptID) {
                query += ` AND d.id = "${req.params.deptID}"`
            }

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
        res.status(200).json({ subjects: await DB.executeQuery(query) });
    })
    .post(async (req, res) => {
        if (!req.account) {
            return res.status(401).end();
        }

        const DB = req.app.locals.database;
        let subj = req.body;
        let sameSubjects = await DB.executeQuery(
            `SELECT COUNT(*) FROM Subjects sub INNER JOIN Colleges col ON sub.college_id = col.id WHERE ` +
            `col.school_id = '${req.account.id}' AND col.id = '${req.params.collegeID}' AND ` +
            `sub.title = '${subj.title}' AND sub.type = '${subj.type}'`
        );

        if (sameSubjects[0]["COUNT(*)"] > 0) {
            return res.status(409).end();
        }

        const subjID = crypto.randomBytes(6).toString("base64url");
        let type = (subj.type == "LEC") ? 1 : (subj.type == "LAB") ? 2 : "NULL";
        await DB.executeQuery(
            `INSERT INTO Subjects VALUES ('${subjID}', '${req.params.collegeID}', '${subj.code}', '${subj.title}', ` +
            `${type}, ${subj.units})`
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
            `WHERE b.school_id = '${req.account.id}'`
        if (req.params.bldgID) {
            query += ` AND b.id = "${req.params.bldgID}"`
        }
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
            `b.school_id = '${req.account.id}' AND b.id = '${req.params.bldgID} AND r.name = '${room.name}'`
        );

        if (sameRooms[0]["COUNT(*)"] > 0) {
            return res.status(409).end();
        }

        const roomID = crypto.randomBytes(6).toString("base64url");
        await DB.executeQuery(
            `INSERT INTO Colleges VALUES ('${req.params.bldgID}', '${roomID}', '${room.name}', ` +
            `${room.level}, ${room.capacity})`
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

module.exports = router;