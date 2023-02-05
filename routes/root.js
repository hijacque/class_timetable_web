// required packages
const router = require("express").Router();
const crypt = require("node:crypto");
const path = require("node:path");
const { createAdmin, loginAccount } = require("../lib/account");
const { sendOTP } = require("./../lib/verification");
require("./../lib/verification");
require("./../lib/account");

router.get("/", (req, res) => {
    res.send("PLM Class Timetable Root page");
});

router.route("/login")
    .get((req, res) => {
        if (req.cookies.serverMessage) res.clearCookie("serverMessage");
        res.render("login", { serverAlert: req.cookies.serverMessage });
    })
    .post(loginAccount, (req, res) => {
        if (req.success) {
            res.redirect("/" + req.success.accountType);
        }
    });

router.route("/signup")
    .get((req, res) => {
        if (req.cookies.serverMessage) res.clearCookie("serverMessage");
        res.render("signup", { serverAlert: req.cookies.serverMessage });
    })
    .post(createAdmin, sendOTP, (req, res) => {
        if (req.success) {
            res.cookie("serverMessage", {
                title: "OTP sent to " + req.body.email,
                body: "Verify your account via the link we sent.",
                mode: 3
            }, { httpOnly: true }).redirect("/login");
        }
    });

router.get("/admin", (req, res) => {
    if (req.signedCookies.account) {
        // TODO: create admin dashboard UI
        res.status(200).send("Welcome! Your admin dashboard will be built here.");
    } else {
        res.status(401).send("Hey.. You're not allowed here >:[");
    }
});

router.get("/chair", (req, res) => {
    if (req.signedCookies.account) {
        // TODO: create chair dashboard UI
        res.status(200).send("Welcome! Your admin dashboard will be built here.");
    } else {
        res.status(401).send("Hey.. You're not allowed here >:[");
    }
});

module.exports = router;