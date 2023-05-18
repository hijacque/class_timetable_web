const router = require("express").Router();
const { 
    getFacultySched, getBlockSched, generateSchedule, 
    getBlockSchedTable, getFacultySchedTable, 
    saveFacultySchedule, postFacultySchedules,
    unsaveFacultySchedule, unpostFacultySchedules 
} = require("./../lib/schedule");
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
    const {serverMessage} = req.cookies;
    if (serverMessage) res.clearCookie("serverMessage");
    res.render("schedule-root/base", {
        category: "faculty",
        term: req.term,
        schedule: req.data,
        serverAlert: serverMessage
    });
});

router.get("/:courseID", getBlockSched, (req, res) => {
    const {serverMessage} = req.cookies;
    if (serverMessage) res.clearCookie("serverMessage");
    res.render("schedule-root/base", {
        category: req.params.courseID,
        term: req.term,
        schedule: req.data,
        serverAlert: serverMessage
    });
});

router.post("/download/:term/department", getBlockSchedTable, getFacultySchedTable, (req, res) => {
    res.status(200).render('export-schedule', {
        workbooks: req.workbooks
    });
});

router.post("/download/:term/faculty", getFacultySchedTable, (req, res) => {
    res.status(200).render('export-schedule', {
        workbooks: req.workbooks
    });
});

router.post("/download/:term/block", getBlockSchedTable, (req, res) => {
    res.status(200).render('export-schedule', {
        workbooks: req.workbooks
    });
});

router.post("/save/:term/:faculty?", saveFacultySchedule, (req, res) => {
    console.log(req.params);
    res.redirect("/chair/schedules/" + req.params.term);
});

router.post("/unsave/:term/:faculty?", unsaveFacultySchedule, (req, res) => {
    console.log(req.params);
    res.redirect("/chair/schedules/" + req.params.term);
});

router.post("/post/:term/", postFacultySchedules, (req, res) => {
    console.log(req.params);
    res.redirect("/chair/schedules/" + req.params.term);
});

router.post("/unpost/:term/", unsaveFacultySchedule, (req, res) => {
    console.log(req.params);
    res.redirect("/chair/schedules/" + req.params.term);
});

router.post("/delete/:term/", (req, res) => {
    // TODO: remove term_id in preferences
    // TODO: remove schedules with faculty from department
    console.log("Deleting departmental faculty schedules...");
    res.redirect("/chair/schedules/" + req.params.term);
});

module.exports = router;