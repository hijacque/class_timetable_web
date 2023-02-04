const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { verifyOTP, getOTP, sendOTP } = require("./../lib/verification");
const { openAccount } = require("../lib/account");
require("./../lib/verification");

router.get("/", (req, res) => {
    if (req.cookies.serverMessage) res.clearCookie("serverMessage");
    res.render("test", { serverAlert: req.cookies.serverMessage });
});

router.get("/account", (req, res) => {
    const helpID = req.query.helpID;
    if (!helpID) {
        res.status(401).send("Require helpID to help you.");
    }
    try {
        const helpInfo = jwt.verify(helpID, process.env.HELP_KEY);
        if (helpInfo.type == 0) {
            // if (!req.cookies.help) 
            res.cookie("help", { email: helpInfo.email }, { httpOnly: true }).redirect("/help/open-account");
        } else if (helpInfo.type == 1) {
            res.cookie("help", { email: helpInfo.email }, { httpOnly: true }).redirect("/help/change-password");
        }
    } catch (error) {
        res.status(401).send("Invalid helpID, you cannot proceed.");
    }
});

router.route("/open-account")
    .get(getOTP, (req, res) => {
        if (!req.cookies.help) {
            res.redirect("/help");
        } else {
            if (req.cookies.serverMessage) res.clearCookie("serverMessage");
            res.render("verify-otp", { serverAlert: req.cookies.serverMessage, subHelp: "open-account" });
        }
    }).post(verifyOTP, openAccount, async (req, res, next) => {
        const otpResult = req.message.mode;
        if (otpResult == 1) {
            req.message.body = "You can now login to your new account.";
            res.cookie("serverMessage", req.message, { httpOnly: true });
            res.status(200).json({ goto: "/login" });
        } else if (otpResult == 2 || otpResult == 0) {
            res.status(200).json(req.message);
        } else {
            res.status(400).json({ message: "Invalid help request." });
        }
    });

router.post("/resend-OTP", sendOTP, (req, res) => {
    if (req.body.resend) {
        const email = req.body.email || req.cookies.help.email;
        console.log(email);
        res.clearCookie("help");
        res.cookie("serverMessage", {
            title: "New OTP sent to " + email,
            body: "Verify your account via the link we sent.",
            mode: 3
        }, { httpOnly: true }).redirect("/login");
    }
});

module.exports = router;