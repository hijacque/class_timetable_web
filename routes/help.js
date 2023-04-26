const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { verifyOTP, getOTP, sendOTP } = require("./../lib/verification");
const { openAccount, openAdminAccount } = require("../lib/account");
require("./../lib/verification");

router.get("/", (req, res) => {
    if (req.cookies.serverMessage) res.clearCookie("serverMessage");
    res.render("test", { serverAlert: req.cookies.serverMessage });
});

router.get("/account/:helpID?", async (req, res) => {
    // create helpID for specific account management
    const helpID = req.params.helpID;
    if (!helpID) {
        res.status(401).send("Require helpID to help you.");
    }
    try {
        const help = jwt.verify(helpID, process.env.HELP_KEY);
        if (help.code == 0) {
            res.cookie("help", { email: help.email, type: help.type }, { httpOnly: true }).redirect("/help/open-account/" + help.type);
        } else if (helpInfo.type == 1) {
            res.cookie("help", { email: helpInfo.email }, { httpOnly: true }).redirect("/help/change-password");
        }
    } catch (error) {
        res.status(401).send("Invalid helpID, you cannot proceed.");
    }
});

router.route("/open-account/admin")
    .get(getOTP, (req, res) => {
        if (req.cookies.serverMessage || req.validHelpID) {
            res.clearCookie("serverMessage");
            res.render("verify-otp", { serverAlert: req.cookies.serverMessage, subHelp: "open-account/admin" });
        } else {
            res.redirect("/help");
        }
    }).post(verifyOTP, openAdminAccount, (req, res) => {
        const otpResult = req.message;
        if (otpResult && otpResult.mode == 1) {
            req.message.body = "You can now login to your new account.";
            res.cookie("serverMessage", req.message, { httpOnly: true });
            res.status(200).json({ redirect: "login" });
        } else if (otpResult && (otpResult.mode == 2 || otpResult.mode == 0)) {
            res.status(200).json(req.message);
        } else {
            res.status(400).json({ redirect: "help" });
        }
    });

router.route("/open-account/chair")
    .get((req, res) => {
        if (req.cookies.serverMessage) {
            res.clearCookie("serverMessage");
            res.render("verify-otp", { serverAlert: req.cookies.serverMessage, subHelp: "open-account/admin" });
        } else {
            res.redirect("/help")
        }
    }).post(verifyOTP, openAdminAccount, (req, res) => {
        const otpResult = req.message;
        if (otpResult && otpResult.mode == 1) {
            req.message.body = "You can now login to your new account.";
            res.cookie("serverMessage", req.message, { httpOnly: true });
            res.status(200).json({ redirect: "/login" });
        } else if (otpResult && (otpResult.mode == 2 || otpResult.mode == 0)) {
            res.status(200).json(req.message);
        } else {
            res.status(400).json({ redirect: "/help" });
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

router.route("/change-password").get((req, res) => {
    // TODO: make middleware for updating password in database
}).post((req, res) => { });

module.exports = router;