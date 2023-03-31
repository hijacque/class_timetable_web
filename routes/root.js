// required packages
const router = require("express").Router();
const { createAdmin, loginAccount, getAdminData, getChairData } = require("../lib/account");
const { sendOTP, verifySession, createSession } = require("./../lib/verification");
require("./../lib/verification");
require("./../lib/account");

router.get("/", (req, res) => {
    res.send("PLM Class Timetable Root page");
});

router.route("/login")
    .get(verifySession, (req, res) => {
        if (req.account) {
            return res.redirect("/" + req.account.type);
        }
        if (req.cookies.serverMessage) res.clearCookie("serverMessage");
        res.render("login", { serverAlert: req.cookies.serverMessage });

    }).post(loginAccount, createSession, (req, res) => {
        if (req.account) {
            return res.status(200).json({ root: "http://localhost:3000/" + req.account.type, });
        }
        res.cookie("serverMessage", {
            mode: 0,
            title: "Invalid Credentials",
            body: "You entered the wrong e-mail/password."
        }).status(200).json({ root: "http://localhost:3000/login" });
    });

router.route("/signup")
    .get((req, res) => {
        if (req.cookies.serverMessage) res.clearCookie("serverMessage");
        res.render("signup", { serverAlert: req.cookies.serverMessage });
    })
    .post(createAdmin, sendOTP, (req, res) => {
        if (req.account) {
            res.cookie("serverMessage", {
                title: "OTP sent to " + req.body.email,
                body: "Verify your account via the link we sent.",
                mode: 3
            }, { httpOnly: true }).redirect("/login");
        } else {
            res.redirect("/signup");
        }
    });

router.get("/logout", (req, res) => {
    if (req.signedCookies.ctsSession) {
        res.clearCookie("ctsSession");
    }
    res.redirect("/login");
});

router.get("/admin/:task?", verifySession, getAdminData, (req, res) => {
    if (req.taskData) {
        const tasks = ["departments", "faculty", "subjects", "rooms"];
        res.render("admin-root/base", {
            section: (tasks.includes(req.params.task)) ? req.params.task : "profile" || "profile",
            taskData: req.taskData,
            serverAlert: {}
        });
    } else {
        res.redirect("/logout");
    }
});

router.get("/chair/:task?", verifySession, getChairData, (req, res) => {
    if (req.taskData) {
        const tasks = ["schedules", "faculty", "courses"];
        res.render("chair-root/base", {
            section: (tasks.includes(req.params.task)) ? req.params.task : "profile" || "profile",
            taskData: req.taskData,
            serverAlert: {}
        });
    } else {
        res.redirect("/logout");
    }
});

router.get("/faculty/:task?", (req, res) => {
    req.taskData = {};
    if (req.taskData) {
        const tasks = ["schedule", "preference"];
        res.render("faculty-root/base", {
            section: (tasks.includes(req.params.task)) ? req.params.task : "profile" || "profile",
            taskData: {},
            serverAlert: {}
        });
    } else {
        res.redirect("/logout");
    }
});

module.exports = router;