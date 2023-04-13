const router = require("express").Router();
const { getSchedules, initSchedGen } = require("./../lib/schedule");
const { verifySession } = require("./../lib/verification");

router.use(verifySession);

router.get("/new", (req, res) => {
    if (!req.account) {
        res.status(401).redirect("/login");
    }
    res.status(200).render("schedule/new");
});

router.post("/generate", initSchedGen, (req, res) => {
    console.log(req.body);
    res.send("Generating department's schedule");
});

router.get("/:category", getSchedules, (req, res) => {
    // TODO: check if category param is faculty of a valid course id in the department
    res.render("schedule-root/base", {
        category: req.params.category,
        term: req.term,
        schedule: req.data
    });
});

module.exports = router;