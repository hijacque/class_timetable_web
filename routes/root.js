// required packages
const router = require("express").Router();
const crypt = require("node:crypto");
const path = require("node:path");

let alert;

router.get("/", (req, res) => {
    res.send("PLM Class Timetable Root page");
});

router.route("/login")
.get((req, res) => {
    res.render("login", { serverAlert: alert });
})
.post((req, res) => {
    res.status(200).json(req.body);
});

router.route("/signup")
.get((req, res) => {
    res.render("signup", { serverAlert: alert });
})
.post((req, res) => {
    res.status(200).json(req.body);
});

module.exports = router;