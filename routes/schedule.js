const router = require("express").Router();
const {
    getFacultySched, getBlockSched, generateSchedule,
    getBlockSchedTable, getFacultySchedTable,
    saveFacultySchedule, postFacultySchedules,
    unsaveFacultySchedule, unpostFacultySchedules,
    resetSchedule, deleteTermSchedule
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
    if (req.incompleteScheds) {
        if (req.body.facultyID) {
            res.cookie("serverMessage", {
                mode: 2,
                title: "Unable to save faculty schedule",
                body: "<p>Some classes are not fully plotted.</p>"
            });
            return res.redirect(`/schedule/faculty?term=${req.params.term}&id=${req.body.facultyID}`);
        }
        res.cookie("serverMessage", {
            mode: 2,
            title: "Unable to save incomplete schedules",
            body: "<p>Some classes are not fully plotted in the following faculty's timetable:<br>" +
                `<ul><li>${req.incompleteScheds.map(sched => sched.name).join("</li><li>")}</li></ul></p>`
        });
    } else {
        if (req.body.facultyID) {
            res.cookie("serverMessage", {
                mode: 1,
                title: "Saved faculty schedule",
                body: "Successfully saved faculty schedule, you cannot add nor modify classes when schedule is in saved mode"
            });
            return res.redirect(`/schedule/faculty?term=${req.params.term}&id=${req.body.facultyID}`);
        }
        res.cookie("serverMessage", {
            mode: 1,
            title: "Saved faculty schedules",
            body: "Successfully saved faculty schedules, you cannot add nor modify classes in saved mode"
        });
    }

    res.redirect("/chair/schedules/" + req.params.term);
});

router.post("/unsave/:term", unsaveFacultySchedule, (req, res) => {
    if (req.body.facultyID) {
        res.cookie("serverMessage", {
            mode: 1,
            title: "Opened faculty schedule",
            body: "You can continue editing the faculty schedule."
        });
        return res.redirect(`/schedule/faculty?term=${req.params.term}&id=${req.body.facultyID}`);
    }
    res.cookie("serverMessage", {
        mode: 1,
        title: "Opened faculty schedules",
        body: "You can continue editing the faculty schedules."
    });
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

router.post("/reset/:term/", resetSchedule, (req, res) => {
    if (req.body.facultyID) {
        res.status(200).redirect(`/schedule/faculty?term=${req.params.term}&id=${req.body.facultyID}`);
    } else if (req.body.year && req.body.block) {
        res.status(200).redirect(
            `/schedule/faculty?term=${req.body.term}&year=${req.params.year}&block=${req.body.block}`
        );
    } else {
        res.status(200).redirect('/chair/schedules/' + req.params.term);
    }
    // res.redirect("/chair/schedules/" + req.params.term);
});

module.exports = router;