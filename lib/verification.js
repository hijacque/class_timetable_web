const crypto = require("crypto");
const ejs = require("ejs");
const jwt = require("jsonwebtoken");

// middleware functions for handling validation activities

const sendOTP = async function (req, res, next) {
    if (req.signedCookies.otp || req.cookies.otp) res.clearCookie("otp");

    let user = req.account || req.signedCookies.helpID;
    if (!user) {
        return next();
    }

    const DB = req.app.locals.database;
    const pin = crypto.randomBytes(3).toString("hex").toUpperCase();
    const pinSalt = crypto.randomBytes(24).toString("base64");
    const hashPin = crypto.createHash("sha256").update(pin + pinSalt).digest("base64");
    console.log("correct pin: " + pin);
    console.log("verification portal: " + process.env.API_DOMAIN + user.subHelp);

    // To help redirect to otp input
    if (req.body.resend) {
        user = jwt.verify(user, process.env.HELP_KEY);
        req.account = user;
    } else if (typeof (user) == "object") {
        res.cookie(
            "helpID", jwt.sign(user, process.env.HELP_KEY, { expiresIn: "7d" }),
            { httpOnly: true, signed: true }
        );
    }

    console.log(user);
    try {
        const mailer = req.app.locals.mailer;
        const content = await ejs.renderFile(
            __dirname + "/../views/mail-template/otp-email.ejs", {
            otp: pin, link: process.env.API_DOMAIN + user.subHelp,
            message: req.otpMessage || "Hi! Here is your OTP to verify your class timetable account."
        }
        );

        let mailOptions = {
            to: user.email,
            subject: "Class Timetable Account One-Time-Pin Verification",
            html: content
        };

        await DB.executeQuery(
            `INSERT INTO OTPs VALUES ("${user.email}", "${hashPin}", "${pinSalt}", ` +
            `DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY)) ON DUPLICATE KEY UPDATE pin = "${hashPin}", ` +
            `pin_salt = "${pinSalt}", expires_on = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY)`
        );

        // mailer.sendEmail(mailOptions);
        next();
    } catch (error) {
        console.error(error);
        await DB.executeQuery(
            `DELETE FROM OTPs WHERE email = "${user.email}" AND pin = "${hashPin}"; ` +
            `DELETE FROM Schools WHERE id = "${user.id}";` +
            `DELETE FROM Users WHERE id = "${user.id}" AND opened_on IS NULL;`
        );
        res.cookie("serverMessage", {
            mode: 0,
            title: "Could not send OTP",
            body: "There was a problem sending the OTP to verify your account, please try again"
        });
        return res.redirect("/signup");
    }
};

const getOTP = async function (req, res, next) {
    if (req.cookies.serverMessage) res.clearCookie("serverMessage");
    console.log(req.signedCookies);
    let verifiedHelpID;
    try {
        verifiedHelpID = jwt.verify(req.signedCookies.helpID, process.env.HELP_KEY);
    } catch (error) {
        console.log(error);
        return res.status(401).cookie("serverMessage", {
            mode: 0,
            title: "Invalid Help ID",
            body: "Please try again later."
        }).redirect("/help");
    }

    if (verifiedHelpID && req.signedCookies.otp) {
        req.validHelpID = true;
    } else if (verifiedHelpID) {
        const { email } = verifiedHelpID;
        const DB = req.app.locals.database;
        const [otpRecord] = await DB.executeQuery(
            `SELECT pin, pin_salt FROM OTPs WHERE email = '${email}' AND expires_on > CURRENT_TIMESTAMP LIMIT 1`
        );

        if (!otpRecord) {
            return res.cookie("serverMessage", {
                mode: 0,
                title: "Invalid OTP",
                body: "Please retry your transaction"
            }).status(404).redirect("/help");
        }

        res.cookie(
            "otp", jwt.sign({ pin: otpRecord.pin, pinSalt: otpRecord.pin_salt, tries: 3 }, process.env.HELP_KEY),
            { httpOnly: true, signed: true }
        );

        req.validHelpID = true;
    }

    next();
};

const verifyOTP = async function (req, res, next) {
    console.log(req.signedCookies);
    let correctOTP, verifiedHelpID;
    try {
        correctOTP = jwt.verify(req.signedCookies.otp, process.env.HELP_KEY);
        verifiedHelpID = jwt.verify(req.signedCookies.helpID, process.env.HELP_KEY);
    } catch (error) {
        console.log(error);
        res.clearCookie("otp").clearCookie("helpID");

        res.cookie("serverMessage", {
            mode: 0,
            title: "Invalid OTP",
            body: "Cannot verify account with this OTP record."
        }, { httpOnly: true });
        return res.status(401).json({ redirect: "/help" });
    }

    const { pin, pinSalt, tries } = correctOTP;
    console.log(correctOTP);
    const inputPin = crypto.createHash("sha256").update(req.body.pin.toUpperCase() + pinSalt).digest("base64");
    if (tries > 0 && pin === inputPin) {
        const { email } = verifiedHelpID;
        await req.app.locals.database.executeQuery(
            `DELETE FROM OTPs WHERE email = "${email}" AND pin = "${pin}" LIMIT 1`
        );

        res.clearCookie("otp").clearCookie("helpID");
        req.message = {
            mode: 1,
            title: "OTP Verification Successful!"
        };
        delete verifiedHelpID.subHelp;
        req.account = verifiedHelpID;
    } else if (tries > 0) {
        let message = (tries > 1) ? `You have ${tries} tries left.` : "You have 1 last try left.";
        correctOTP.tries--;
        res.cookie("otp", jwt.sign(correctOTP, process.env.HELP_KEY), { httpOnly: true, signed: true });

        req.message = {
            mode: 2,
            title: "Incorrect Pin was entered",
            body: message
        };
    } else {
        res.clearCookie("otp");
        await req.app.locals.database.executeQuery(
            `DELETE FROM OTPs WHERE email = "${verifiedHelpID.email}" AND pin = "${pin}" LIMIT 1`
        );
        req.message = {
            mode: 0,
            title: "OTP Verification Failed",
            body: "Sorry! There were to many wrong attempts.<br>Do you want to receive a new OTP?"
        };
    }

    next();
}

const createSession = function (req, res, next) {
    if (req.account) {
        const loginTime = Date.now();

        res.cookie("ctsSession", {
            SameSite: "strict",
            loginTime: loginTime,
            email: req.account.email,
            user: jwt.sign({
                id: req.account.id,
                type: req.account.type
            }, crypto.createHash("sha256").update(req.account.email + loginTime).digest("base64"),
                { expiresIn: "24h" })
        }, { signed: true, httpOnly: true });
    }
    next();
}

const verifySession = async function (req, res, next) {
    const session = req.signedCookies.ctsSession;
    if (!session) {
        return next();
    }
    try {
        req.account = jwt.verify(session.user,
            crypto.createHash("sha256").update(session.email + session.loginTime).digest("base64")
        );

        const DB = await req.app.locals.database;
        const [user] = await DB.executeQuery(
            `SELECT id, type FROM Users WHERE id = '${req.account.id}' LIMIT 1`
        );

        if (!user) {
            res.cookie("serverMessage", {
                mode: 0,
                title: "Invalid user",
                body: "Please login again to verify you own the account."
            });
            throw "Logged in user not consistent with record in database.";
        } else if (user.type != req.account.type) {
            res.cookie("serverMessage", {
                mode: 3,
                title: "User privileges changed",
                body: "Please login again to verify changes in your account."
            });
            throw "Logged in user not consistent with record in database.";
        }
    } catch (error) {
        console.error(error);
        console.log(Date.now());
        if (error.expiredAt) {
            res.cookie("serverMessage", {
                mode: 3,
                title: "Login session expired",
                body: "Please login again if you wish to keep using the system."
            });
        }
        return res.redirect("/logout");
    }
    next();
};

const changePassword = async (req, res, next) => {
    let user;

    try {
        user = jwt.verify(req.signedCookies.helpID, process.env.HELP_KEY);
    } catch (error) {
        console.log(error);
        res.locals.msg_title = "Unauthorized request";
        res.locals.msg_body = "Please login with your old password before changing password.";
        res.locals.msg_mode = 1;
        return next();
    }

    // Hash password
    const password = req.body.password;
    const passSalt = crypto.randomBytes(24).toString("base64");
    const hashPassword = crypto.createHash("sha256").update(password + passSalt).digest("base64");

    console.log(password, passSalt, hashPassword);
    // Update password
    await req.app.locals.database.executeQuery(
        `UPDATE Users ` +
        `SET password = "${hashPassword}", ` +
        `pass_salt = "${passSalt}" ` +
        `WHERE id = "${user.id}" LIMIT 1;`
    );
    res.locals.msg_title = "Password had been changed";
    res.locals.msg_body = "Please login again for security reason.";
    res.locals.msg_mode = 1;

    // Update account verification timestamp
    await req.app.locals.database.executeQuery(
        `UPDATE Users SET opened_on = CURRENT_TIMESTAMP WHERE id = "${user.id}"`
    );

    // clear change password cookie
    res.clearCookie("helpID");
    next();
};

const forgetPassword = async (req, res, next) => {
    const email = req.body.email;

    // Find the email
    const [account] = await req.app.locals.database.executeQuery(
        `SELECT * FROM Users WHERE email = '${email}'`
    );

    if (!account) {
        res.locals.msg_title = "Email does not exists";
        res.locals.msg_body = "Please make user the email is registered";
        res.locals.msg_mode = 2;
        return next();
    }

    req.account = {
        id: account.id,
        type: account.type,
        email: account.email,
        subHelp: "/help/forgot-password"
    };

    res.cookie("helpID", jwt.sign(
        req.account, process.env.HELP_KEY, { expiresIn: "4m" }
    ), { httpOnly: true, signed: true });

    next();
};

module.exports = { sendOTP, getOTP, verifyOTP, createSession, verifySession, changePassword, forgetPassword };
