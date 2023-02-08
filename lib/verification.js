const crypto = require("node:crypto");
const ejs = require("ejs");
const jwt = require("jsonwebtoken");

const sendOTP = async function (req, res, next) {
    if (req.success || req.body.resend) {
        const mailer = req.app.locals.mailer;
        const DB = req.app.locals.database;
        const email = req.body.email || req.cookies.help.email;
        if (!email) {
            next();
        }
        const pin = crypto.randomBytes(3).toString("hex").toUpperCase();
        console.log(pin);
        const pinSalt = crypto.randomBytes(24).toString("base64");
        const hashPin = crypto.createHash("sha256").update(pin + pinSalt).digest("base64");
        await DB.executeQuery(
            `INSERT INTO OTPs VALUES ("${email}", "${hashPin}", DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY), ` +
            `"${pinSalt}") ON DUPLICATE KEY UPDATE pin = "${hashPin}", pin_salt = "${pinSalt}", ` +
            `expires_on = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY)`
        );

        const helpID = jwt.sign(
            { email: email, type: 0 },
            process.env.HELP_KEY,
            { expiresIn: "7d" }
        );
        const today = new Date();
        today.setDate(today.getDate() + 7);
        try {
            const content = await ejs.renderFile(
                __dirname + "/../views/otp-email.ejs",
                { otp: pin, expiryDate: today.toUTCString(), helpID: helpID, port: process.env.API_PORT }
            );
            let mailOptions = {
                to: email,
                pin: pin,
                subject: "Class Timetable Account One-Time-Pin Verification",
                html: content
            };
            mailer.sendEmail(mailOptions);
        } catch (error) {
            console.log(error);
        }
    }
    next();
};

const getOTP = async function (req, res, next) {
    const DB = req.app.locals.database;
    const helpInfo = req.cookies.help;
    if (helpInfo) {
        const otpRecord = await DB.executeQuery(`SELECT email FROM OTPs WHERE email = "${helpInfo.email}"`);
        if (otpRecord.length < 1) {
            res.clearCookie("help");
        }
    }
    next();
};

const verifyOTP = async function (req, res, next) {
    const DB = req.app.locals.database;
    const email = req.cookies.help.email;
    let otp = req.cookies.otp;
    if (!email) {
        if (otp) res.clearCookie("otp");
        res.cookie("serverMessage", {
            mode: 0,
            title: "E-mail not found",
            body: "Cannot process help request without recognized e-mail."
        }, { httpOnly: true });
        res.status(401).json({ goto: "/help" });
        next();
    }
    let otpRecord;
    if (!otp) {
        // const otpRecord = { pin: "qwerty", pin_salt: "123456", expires_on: new Date(Date.now() + 300000) };
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
    const inputPin = crypto.createHash("sha256").update(req.body.pin + otp.pinSalt).digest("base64");
    if (otp.pin === inputPin) {
        await DB.executeQuery(
            `DELETE FROM OTPs WHERE email = "${email}" AND pin = "${otp.pin}" LIMIT 1`
        );
        res.clearCookie("otp");
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
        res.clearCookie("otp");
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
            email: req.body.email,
            loginTime: loginTime,
            id: jwt.sign({
                type: req.account.type,
                accID: req.account.id
            }, crypto.createHash("sha256").update(req.body.email + loginTime).digest("base64"),
            { expiresIn: "5s"})
        }, { signed: true, httpOnly: true });
    }
    next();
}

const verifySession = function (req, res, next) {
    const session = req.signedCookies.ctsSession;
    if (session) {
        try {
            req.account = jwt.verify(session.id,
                crypto.createHash("sha256").update(session.email + session.loginTime).digest("base64")
            );
        } catch (error) {
            if (error.expiredAt) {
                console.log("Expire!");
                // maybe replace session ID ?
            }
            res.clearCookie("ctsSession");
            console.log(error);
        }
    }
    next();
}

module.exports = { sendOTP, getOTP, verifyOTP, createSession, verifySession };