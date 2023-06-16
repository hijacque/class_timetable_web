const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { verifyOTP, getOTP, sendOTP, changePassword, forgetPassword } = require("./../lib/verification");
const { openAdminAccount } = require("../lib/account");

router.get("/", (req, res) => {
    if (req.cookies.serverMessage) res.clearCookie("serverMessage");
    res.render("test", { serverAlert: req.cookies.serverMessage });
});

// router.get("/account/:helpID?", async (req, res) => {
//     // create helpID for specific account management
//     const helpID = req.params.helpID;
//     if (!helpID) {
//         res.status(401).send("Require helpID to help you.");
//     }
//     try {
//         const help = jwt.verify(helpID, process.env.HELP_KEY);
//         if (help.code == 0) {
//             res.cookie("help", { email: help.email, type: help.type }, { httpOnly: true }).redirect("/help/open-account/" + help.type);
//         } else if (help.code == 1) {
//             res.cookie("help", { email: help.email }, { httpOnly: true }).redirect("/help/change-password");
//         }
//     } catch (error) {
//         res.status(401).send("Invalid helpID, you cannot proceed.");
//     }
// });

router.route("/open-account/admin")
    .get(getOTP, (req, res) => {
        if (req.validHelpID) {
            res.render("verify-otp", { serverAlert: req.cookies.serverMessage, subHelp: "/help/open-account/admin" });
        } else {
            res.redirect("/help");
        }
    }).post(verifyOTP, openAdminAccount, (req, res) => {
        const otpResult = req.message;
        if (!otpResult) {
            return res.status(400).json({ redirect: "/help" });
        }

        const { mode } = otpResult;
        if (mode == 1) {
            otpResult.body = "You can now login to your new account.";
            res.cookie("serverMessage", otpResult, { httpOnly: true });
            res.status(200).json({ redirect: "/login" });
        } else if (mode == 2 || otpResult.mode == 0) {
            res.status(200).json({ message: otpResult });
        } else {
            res.status(400).json({ redirect: "/help" });
        }
    });

router.route("/open-account/faculty")
    .get(getOTP, (req, res) => {
        if (req.validHelpID) {
            res.render("verify-otp", {
                serverAlert: req.cookies.serverMessage,
                subHelp: "/help/change-password"
            });
        } else {
            res.redirect("/help");
        }
    }).post(verifyOTP, (req, res) => {
        const otpResult = req.message;
        if (otpResult && otpResult.mode == 1) {
            res.cookie("serverMessage", req.message, { httpOnly: true });
            res.cookie("id", req.accountID).redirect("/help/change-password")
        } else if (otpResult && (otpResult.mode == 2 || otpResult.mode == 0)) {
            res.status(200).json(req.message);
        } else {
            res.status(400).json({ redirect: "help" });
        }
    });

router.post("/resend-otp", sendOTP, (req, res) => {
    if (req.body.resend && req.account) {
        const { email, subHelp } = req.account;
        res.cookie("serverMessage", {
            title: "New OTP sent to " + email,
            body: "If lost, click the verification portal.",
            mode: 3
        }, { httpOnly: true }).redirect(subHelp);
    } else {
        res.redirect("/login");
    }
});

router.route("/change-password/verify")
    .get(getOTP, (req, res) => {
        res.render("verify-otp", { 
            serverAlert: req.cookies.serverMessage, subHelp: "/help/change-password/verify" 
        });
    }).post(verifyOTP, (req, res) => {
        // Login the User
        if (req.account) {
            res.cookie(
                "helpID", jwt.sign({
                    ...req.account, subHelp: "/help/change-password"}, 
                    process.env.HELP_KEY
                ), { httpOnly: true, signed: true }
            );
            return res.status(200).json({ redirect: "/help/change-password" });
        }

        const { mode } = req.message;
        if (mode == 2 || mode == 0) {
            res.status(200).json({ message: req.message });
        } else {
            res.json({ redirect: "/logout" });
        }
    });

router.route("/change-password")
    .get((req, res) => {
        try {
            const helpID = jwt.verify(req.signedCookies.helpID, process.env.HELP_KEY);
            if (helpID.subHelp == "/help/change-password") {
                res.render("change-password", {
                    serverAlert: req.cookies.serverMessage
                });
            } else {
                res.redirect("/logout");
            }
        } catch (error) {
            console.log(error);
            res.redirect("/help");
        }
    })
    .post(changePassword, (req, res) => {
        res.cookie("serverMessage", {
            title: res.locals.msg_title,
            body: res.locals.msg_body,
            mode: res.locals.msg_mode
        }).status(200).json({ redirect: "/logout" });
    });

router.route("/forgot-password")
    .get((req, res) => {
        if (req.cookies.serverMessage) res.clearCookie("serverMessage");
        if (req.cookies.serverMessage) res.clearCookie("helpID");
        res.render("forgot-password", {
            serverAlert: req.cookies.serverMessage
        });
    })
    .post(forgetPassword, sendOTP, (req, res) => {
        if (req.account) {
            res.redirect("/help/change-password/verify");
        } else {
            res.redirect("/forget-password")
        }
    });

router.route("/verify")
    .get(getOTP, (req, res) => {
        res.render("verify-otp", { serverAlert: req.cookies.serverMessage, subHelp: "/help/verify" });
    }).post(verifyOTP, (req, res) => {
        // Login the User
        if (req.account) {
            return res.status(200).json({ redirect: "/" + req.account.type });
        }

        const { mode } = req.message;
        if (mode == 2 || mode == 0) {
            res.status(200).json({ message: req.message });
        } else {
            res.json({ redirect: "/login" });
        }
    });

module.exports = router;
