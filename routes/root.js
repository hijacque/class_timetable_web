// required packages
const router = require("express").Router();
const { createAdmin, loginAccount, getAdminData } = require("../lib/account");
const { sendOTP, verifySession, createSession } = require("./../lib/verification");
require("./../lib/verification");
require("./../lib/account");

router.get("/", (req, res) => {
    res.send("PLM Class Timetable Root page");
});

router.route("/login")
    .get((req, res) => {
        let loggedIn = req.signedCookies.ctsSession
        if (loggedIn) {
            return res.redirect("/" + loggedIn.type);
        }
        if (req.cookies.serverMessage) res.clearCookie("serverMessage");
        res.render("login", { serverAlert: req.cookies.serverMessage });

    }).post(loginAccount, createSession, (req, res) => {
        if (req.account) {
            return res.redirect("/" + req.account.type);
        }
        res.cookie("serverMessage", {
            mode: 0,
            title: "Invalid Credentials",
            body: "You entered the wrong e-mail/password."
        }).redirect("/login");
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
        res.render("admin-root/base", {
            section: req.params.task || "profile",
            taskData: req.taskData,
            serverAlert: {}
        });
    } else {
        res.redirect("/logout");
    }
});

router.get("/chair/:task?", verifySession, (req, res) => {
    const user = req.account;
    if (user && user.type == "chair") {
        res.send("This is where chairperson's dashboard will be hehe");
    } else {
        res.redirect("/login");
    }
});

router.get("/faculty/:task?", verifySession, (req, res) => {
    const user = req.account;
    if (user && user.type == "faculty") {
        res.send("This is where faculty's dashboard will be hehe");
    } else {
        res.redirect("/login");
    }
});

module.exports = router;