const router = require("express").Router();
const { verifySession } = require("./../lib/verification");

router.use(verifySession);

router.get("/new", (req, res) => {
    if (!req.account) {
        res.status(401).send("Nope!!!");
    }
    res.status(200).send("Will create more on this");
});

module.exports = router;