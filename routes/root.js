// required packages
const router = require("express").Router();
const crypt = require("node:crypto");
const path = require("node:path");

router.get("/", (req, res) => {
    res.send("PLM Class Timetable Root page");
});

module.exports = router;