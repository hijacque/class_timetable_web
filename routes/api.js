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

router.route("/chairperson/:deptID?")
    .post(async (req, res) => {
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
                `UPDATE Departments SET chair_id = "${chairID[0]["id"]}" WHERE id = "${req.params.deptID}" LIMIT 1`
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

router.route("/rooms/:bldgID?")
    .get(async (req, res) => {
        if (req.account) {
            const DB = req.app.locals.database;
            let query = `SELECT name, level, capacity FROM `;

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
    }).post((req, res) => {
        //
    });

module.exports = router;