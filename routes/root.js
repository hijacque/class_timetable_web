// required packages
const router = require("express").Router();
const crypt = require("node:crypto");
const path = require("node:path");

let alert;

router.get("/", (req, res) => {
    res.send("PLM Class Timetable Root page");
});

router.get("/login", (req, res) => {
    res.render("login", { serverAlert: alert });
});

router.get("/signup", (req, res) => {
    res.render("signup", { serverAlert: alert });
});

module.exports = router;