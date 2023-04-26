const router = require("express").Router();
const { getFacultySched, getBlockSched, generateSchedule } = require("./../lib/schedule");
const { verifySession } = require("./../lib/verification");

router.use(verifySession);

router.get("/new", (req, res) => {
    if (!req.account) {
        res.status(401).redirect("/login");
    }
    res.status(200).render("schedule/new");
});

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

router.get("/:blockID", getBlockSched, (req, res) => {
    res.render("schedule-root/base", {
        category: req.params.blockID,
        term: req.term,
        schedule: req.data
    });
});

module.exports = router;