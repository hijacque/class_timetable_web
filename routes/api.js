const router = require("express").Router();
const { verifySession } = require("./../lib/verification");
const { createChair } = require("./../lib/account");

// for CRUD purposes sub-directly controlled from client side

router.route("/departments/:collegeID?")
    .get(verifySession, async (req, res) => {
        if (req.account) {
            const DB = req.app.locals.database;
            let query =
                `SELECT d.name AS department, c.first_name, c.middle_name, c.last_name, c.email, ` +
                `c.acc_status AS accountStatus FROM Colleges col INNER JOIN Schools s ON ` +
                `s.id = col.school_id INNER JOIN Departments d ON col.id = d.college_id ` +
                `INNER JOIN Chairpersons c ON d.id = c.div_id WHERE s.id = "${req.account.accID}"`;
            if (req.params.collegeID) {
                query += ` AND col.id = "${req.params.collegeID}"`
            }
            res.status(200).json({ departments: await DB.executeQuery(query) });
        } else {
            res.status(401).end();
        }
    }).post(verifySession, createChair, (req, res) => {
        res.status(200).json({ message: {
            mode: 1,
            title: "Chairperson Signed Up",
            body: `A temporary password is sent to their e-mail.`
        }});
        // res.status(200).end();
    });

module.exports = router;