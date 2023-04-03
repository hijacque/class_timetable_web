const router = require("express").Router();
const { getSchedules } = require("./../lib/schedule");
const { verifySession } = require("./../lib/verification");

router.use(verifySession);

router.get("/new", (req, res) => {
    if (!req.account) {
        res.status(401).redirect("/login");
    }
    res.status(200).render("schedule/new");
});

router.get("/:category", getSchedules, (req, res) => {
    // TODO: check if category param is faculty of a valid course id in the department
    res.render("schedule-root/base", {
        category: req.params.category,
        deptClasses: req.deptClasses, 
        otherClasses: req.otherClasses
    });
});

module.exports = router;