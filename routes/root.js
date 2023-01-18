// required packages
const router = require("express").Router();
const crypt = require("node:crypto");
const path = require("node:path");

router.get("/", (req, res) => {
    res.send("PLM Class Timetable Root page");
});

router.get("/login", (req, res) => {
    res.render("login");
});

router.get("/signup", (req, res) => {
    res.send("Class Timetable sign up page")
});

module.exports = router;