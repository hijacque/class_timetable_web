const router = require("express").Router();
const { getFacultySched, getBlockSched, generateSchedule, getBlockSchedTable, getFacultySchedTable } = require("./../lib/schedule");
const { verifySession } = require("./../lib/verification");

router.use(verifySession);

router.post("/generate", generateSchedule, (req, res) => {
    res.status(200).redirect('/schedule/success/' + req.body.term);
});

router.get('/success/:term', (req, res) => {
    res.send(
        `Successfully generated schedule. Go back to <a href="/chair/schedules?term=${req.params.term}">Schedules Tab</a>`
    );
});

router.get('/failed/:term', (req, res) => {
    res.send(
        `Oh no! Something went wrong on our end, please retry later.<br>` +
        `Go back to <a href="/chair/schedules?term=${req.params.term}">Schedules Tab</a>`
    );
});

router.get("/faculty", getFacultySched, (req, res) => {
    res.render("schedule-root/base", {
        category: "faculty",
        term: req.term,
        schedule: req.data
    });
});

router.get("/:courseID", getBlockSched, (req, res) => {
    res.render("schedule-root/base", {
        category: req.params.courseID,
        term: req.term,
        schedule: req.data
    });
});

router.post("/download/:term/department", getBlockSchedTable, getFacultySchedTable, (req, res) => {
    res.status(200).render('export-schedule', {
        workbooks: req.workbooks
    });
});

router.post("/download/:term/faculty", (req, res) => {
    res.status(200).json(req.body);
});

router.post("/download/:term/block", (req, res) => {
    res.status(200).json(req.body);
});

module.exports = router;