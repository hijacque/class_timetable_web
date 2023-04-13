const crypto = require("node:crypto");
const ejs = require("ejs");
const jwt = require("jsonwebtoken");

// middleware functions for handling validation activities

const sendOTP = async function (req, res, next) {
    if (!(req.account && req.body.resend)) {
        return next();
    }

    const email = req.body.email || req.cookies.help.email;
    if (!email) {
        return next();
    }

    const DB = req.app.locals.database;
    const pin = crypto.randomBytes(3).toString("hex").toUpperCase();
    const pinSalt = crypto.randomBytes(24).toString("base64");
    const hashPin = crypto.createHash("sha256").update(pin + pinSalt).digest("base64");
    const helpID = jwt.sign(
        { email: email, type: "admin", code: 0 },
        process.env.HELP_KEY,
        { expiresIn: "7d" }
    );

    try {
        const mailer = req.app.locals.mailer;
        const content = await ejs.renderFile(
            __dirname + "/../views/mail-template/otp-email.ejs",
            { otp: pin, helpID: helpID, port: process.env.API_PORT }
        );
        let mailOptions = {
            to: email,
            pin: pin,
            subject: "Class Timetable Account One-Time-Pin Verification",
            html: content
        };
        mailer.sendEmail(mailOptions);
        await DB.executeQuery(
            `INSERT INTO OTPs VALUES ("${email}", "${hashPin}", DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY), ` +
            `"${pinSalt}") ON DUPLICATE KEY UPDATE pin = "${hashPin}", pin_salt = "${pinSalt}", ` +
            `expires_on = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY)`
        );
        next();
    } catch (error) {
        console.error(error);
        await DB.executeQuery(
            `DELETE FROM OTPs WHERE pin = "${hashPin}"; ` +
            `DELETE FROM Schools WHERE email = "${email}" AND acc_status = "pending";`
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
    const helpInfo = req.cookies.help;
    if (helpInfo) {
        const DB = req.app.locals.database;
        const otpRecord = await DB.executeQuery(`SELECT email FROM OTPs WHERE email = "${helpInfo.email}"`);
        if (otpRecord.length < 1) {
            res.clearCookie("help");
        }
    }
    next();
};

const verifyOTP = async function (req, res, next) {
    const helpInfo = req.cookies.help;
    let otp = req.cookies.otp;
    if (!helpInfo) {
        if (otp) res.clearCookie("otp");
        res.cookie("serverMessage", {
            mode: 0,
            title: "E-mail not found",
            body: "Cannot process help request without recognized e-mail."
        }, { httpOnly: true });
        res.status(401).json({ goto: "/help" });
        next();
    }

    const DB = req.app.locals.database;
    const email = helpInfo.email;
    let otpRecord;
    if (!otp) {
        otpRecord = await DB.executeQuery(
            `SELECT pin, pin_salt, expires_on FROM OTPs WHERE ` +
            `email = "${email}" AND expires_on > CURRENT_TIMESTAMP LIMIT 1`
        );
        otp = {
            pin: otpRecord[0]["pin"],
            pinSalt: otpRecord[0]["pin_salt"],
            tries: 3
        };

        res.cookie("otp", otp, { expires: otpRecord["expires_on"], httpOnly: true });
    }
    const inputPin = crypto.createHash("sha256").update(req.body.pin.toUpperCase() + otp.pinSalt).digest("base64");
    if (otp.pin === inputPin) {
        await DB.executeQuery(
            `DELETE FROM OTPs WHERE email = "${email}" AND pin = "${otp.pin}" LIMIT 1`
        );
        res.clearCookie("otp").clearCookie("help");
        req.message = {
            mode: 1,
            title: "OTP Verification Successful!"
        };
    } else if (otp.tries > 0) {
        let message = (otp.tries > 1) ? `You have ${otp.tries} tries left.` : "You have 1 last try left.";
        otp.tries--;
        res.cookie("otp", otp, { httpOnly: true });
        req.message = {
            mode: 2,
            title: "Incorrect Pin was entered",
            body: message
        };
    } else {
        res.clearCookie("otp").clearCookie("help");
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
            email: req.body.email,
            user: jwt.sign({
                id: req.account.id,
                type: req.account.type
            }, crypto.createHash("sha256").update(req.body.email + loginTime).digest("base64"),
            { expiresIn: "6h" })
        }, { signed: true, httpOnly: true });
    }
    next();
}

const verifySession = function (req, res, next) {
    const session = req.signedCookies.ctsSession;
    if (!session) {
        return next();
    }
    try {
        req.account = jwt.verify(session.user,
            crypto.createHash("sha256").update(session.email + session.loginTime).digest("base64")
        );
    } catch (error) {
        console.error(error);
        console.log(Date.now());
        if (error.expiredAt) {
            // maybe replace session ID ?
        }
        res.clearCookie("ctsSession");
    }
    next();
};

const getPassword = async (req, res, next) => {
    // 
}

const changePassword = async (req, res, next) => {
    // change password hashed and salted
};

module.exports = { sendOTP, getOTP, verifyOTP, createSession, verifySession };