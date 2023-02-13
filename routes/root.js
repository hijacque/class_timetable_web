// required packages
const router = require("express").Router();
const { createAdmin, loginAccount } = require("../lib/account");
const { sendOTP, verifySession, createSession } = require("./../lib/verification");
require("./../lib/verification");
require("./../lib/account");

router.get("/", (req, res) => {
    res.send("PLM Class Timetable Root page");
});

router.route("/login")
    .get((req, res) => {
        if (req.signedCookies.ctsSession) {
            res.redirect("/admin");
        } else {
            if (req.cookies.serverMessage) res.clearCookie("serverMessage");
            res.render("login", { serverAlert: req.cookies.serverMessage });
        }
    })
    .post(loginAccount, createSession, (req, res) => {
        if (req.account) {
            res.redirect("/" + req.account.type);
        } else {
            res.cookie("serverMessage", {
                mode: 0,
                title: "Invalid Credentials",
                body: "You entered the wrong e-mail/password."
            }).redirect("/login");
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

router.get("/logout", (req, res) => {
    if (req.signedCookies.ctsSession) {
        res.clearCookie("ctsSession");
        res.redirect("/login");
    }
});

let taskData = {
    schoolName: "Pamantasan ng Lungsod ng Maynila",
    email: "hjadasal2020@plm.edu.ph"
};

router.get("/admin/:task?", (req, res) => {
    const user = { type: "admin"};
    const task = req.params.task || "profile";
    if (user && user.type == "admin") {
        taskData.section = 
        // TODO: develop departments view (editable table with all department heads)
        res.render("admin-root/base", {
            section: task,
            taskData: taskData
        });
    } else if (user) {
        res.redirect("/chair");
    } else {
        res.redirect("/login");
    }
});

router.get("/chair/:task?", verifySession, (req, res) => {
    const user = req.account;
    if (user && user.type == "chair") {
        res.render("chair-root/base", {
            section: req.params.task || "profile"
        });
    } else if (user) {
        res.redirect("/admin");
    } else {
        res.redirect("/login");
    }
});

module.exports = router;