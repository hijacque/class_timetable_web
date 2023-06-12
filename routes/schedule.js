const router = require("express").Router();
const {
    getFacultySched, getBlockSched, generateSchedule,
    getBlockSchedTable, getFacultySchedTable,
    saveFacultySchedule, postFacultySchedules,
    unsaveFacultySchedule, unpostFacultySchedules
} = require("./../lib/schedule");
const { verifySession } = require("./../lib/verification");

router.use(verifySession);

router.post("/generate/:facultyID?", generateSchedule, (req, res) => {
    if (req.params.facultyID) {
        res.status(200).redirect(`/schedule/faculty?term=${req.body.term}&id=${req.params.facultyID}`);
    } else {
        res.status(200).redirect('/chair/schedules/' + req.body.term);
    }
});

router.get("/faculty", getFacultySched, (req, res) => {
    const { serverMessage } = req.cookies;
    if (serverMessage) res.clearCookie("serverMessage");
    res.render("schedule-root/base", {
        category: "faculty",
        term: req.term,
        schedule: req.data,
        serverAlert: serverMessage
    });
});

router.get("/:courseID", getBlockSched, (req, res) => {
    const { serverMessage } = req.cookies;
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

router.post("/save/:term", saveFacultySchedule, (req, res) => {
    console.log(req.params);
    res.redirect("/chair/schedules/" + req.params.term);
});

router.post("/unsave/:term", unsaveFacultySchedule, (req, res) => {
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
    // TODO: remove schedules assigned into faculty from the department
    console.log("Deleting departmental faculty schedules...");
    res.redirect("/chair/schedules/" + req.params.term);
});

module.exports = router;