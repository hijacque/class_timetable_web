// required packages
const router = require("express").Router();
const { createAdmin, loginAccount, getAdminData, getChairData, getFacultyData } = require("../lib/account");
const { getOTP, verifyOTP, sendOTP, verifySession, createSession, changePassword } = require("./../lib/verification");
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
        res.render("login", { serverAlert: req.cookies.serverMessage, root: process.env.API_DOMAIN });

    }).post(loginAccount, sendOTP, (req, res) => {
        if (req.account || res.change_pass == true) {
            return res.status(200).json({ root: "/verify" });
        }

        res.cookie("serverMessage", {
            mode: 0,
            title: res.locals.error_title,
            body: res.locals.error_body
        }).status(200).json({ root: "/login" });
    });

router.route("/verify")
    .get(getOTP, (req, res) => {
        res.render("verify-otp", { serverAlert: req.cookies.serverMessage, subHelp: "/verify"});
    }).post(verifyOTP, createSession, (req, res) => {
        // Login the User
        if (req.account) {
            return res.status(200).json({ redirect: "/" + req.account.type });
        }

        const {mode} = req.message;
        if (mode == 2 || mode == 0) {
            res.status(200).json({ message: req.message });
        } else {
            res.json({ redirect: "/login" });
        }
    });

router.route("/signup")
    .get((req, res) => {
        if (req.cookies.serverMessage) res.clearCookie("serverMessage");
        res.render("signup", { serverAlert: req.cookies.serverMessage });
    })
    .post(createAdmin, sendOTP, (req, res) => {
        if (req.account) {
            res.redirect("/help/open-account/admin");
        } else {
            res.redirect("/signup");
        }
    });

router.get("/logout", (req, res) => {
    res.clearCookie("ctsSession");
    res.clearCookie("helpID");
    res.clearCookie("otp");
    res.redirect("/login");
});

router.get("/admin/:task?/:current?", verifySession, getAdminData, (req, res) => {
    if (req.cookies.serverMessage) res.clearCookie("serverMessage");
    if (req.taskData) {
        const tasks = ["departments", "faculty", "subjects", "rooms"];
        res.render("admin-root/base", {
            section: (tasks.includes(req.params.task)) ? req.params.task : "profile" || "profile",
            taskData: req.taskData,
            serverAlert: req.cookies.serverMessage
        });
    } else {
        res.redirect("/logout");
    }
});

router.get("/chair/:task?/:current?", verifySession, getChairData, getFacultyData, (req, res) => {
    if (req.cookies.serverMessage) res.clearCookie("serverMessage");
    if (req.taskData) {
        const tasks = ["schedules", "faculty", "courses", "schedule", "preference", "consultation"];
        res.render("chair-root/base", {
            section: (tasks.includes(req.params.task)) ? req.params.task : "profile" || "profile",
            taskData: req.taskData,
            serverAlert: req.cookies.serverMessage
        });
    } else {
        res.redirect("/logout");
    }
});

router.get("/faculty/:task?",verifySession, getFacultyData, (req, res) => {
    if (req.cookies.serverMessage) res.clearCookie("serverMessage");
    if (req.taskData) {
        const tasks = ["schedule", "preference", "consultation"];
        res.render("faculty-root/base", {
            section: (tasks.includes(req.params.task)) ? req.params.task : "profile" || "profile",
            taskData: req.taskData,
            serverAlert: req.cookies.serverMessage
        });
    } else {
        res.redirect("/logout");
    }
});

module.exports = router;
