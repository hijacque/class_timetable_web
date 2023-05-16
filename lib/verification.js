const crypto = require("node:crypto");
const ejs = require("ejs");
const jwt = require("jsonwebtoken");

// middleware functions for handling validation activities

const sendOTP = async function (req, res, next) {
    if (!(req.accountID || req.body.resend)) {
        return next();
    }

    const email = req.body.email || req.cookies.help.email;
    
    const DB = req.app.locals.database;
    const pin = crypto.randomBytes(3).toString("hex").toUpperCase();
    const pinSalt = crypto.randomBytes(24).toString("base64");
    const hashPin = crypto.createHash("sha256").update(pin + pinSalt).digest("base64");
    
    const helpID = jwt.sign(
        { email: email, type: "admin", code: 0 },
        process.env.HELP_KEY,
        { expiresIn: "7d" }
    );
    console.log("correct pin: " + pin);
    console.log("OTP link: http://localhost:3000/help/account/" + helpID);

    try {
        const mailer = req.app.locals.mailer;
        const content = await ejs.renderFile(
            __dirname + "/../views/mail-template/otp-email.ejs",
            { otp: pin, helpID: helpID, port: process.env.API_PORT }
        );

        let mailOptions = {
            to: email,
            subject: "Class Timetable Account One-Time-Pin Verification",
            html: content
        };
        
        await DB.executeQuery(
            `INSERT INTO OTPs VALUES ("${email}", "${hashPin}", "${pinSalt}", ` +
            `DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY)) ON DUPLICATE KEY UPDATE pin = "${hashPin}", ` +
            `pin_salt = "${pinSalt}", expires_on = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY)`
        );

        mailer.sendEmail(mailOptions);
        next();
    } catch (error) {
        console.error(error);
        await DB.executeQuery(
            `DELETE FROM OTPs WHERE email = "${email}" AND pin = "${hashPin}"; ` +
            `DELETE FROM Schools WHERE id = "${req.accountID}";` +
            `DELETE FROM Users WHERE id = "${req.accountID}" AND opened_on IS NULL;`
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
        const email = req.cookies.help.email;
        const DB = req.app.locals.database;
        const [otpRecord] = await DB.executeQuery(
            `SELECT pin, pin_salt FROM OTPs WHERE email = '${email}' AND expires_on > CURRENT_TIMESTAMP LIMIT 1`
        );
        
        if (!otpRecord) {
            res.clearCookie("help");
            return res.status(404).redirect("/help");
        }
        
        res.cookie("otp", {
            pin: otpRecord.pin,
            pinSalt: otpRecord.pin_salt,
            tries: 3
        }, { expires: otpRecord.expires_on, httpOnly: true });
        req.validHelpID = true;
    }
    next();
};

const verifyOTP = async function (req, res, next) {
    if (!req.cookies.help) {
        if (req.cookies.otp) res.clearCookie("otp");

        res.cookie("serverMessage", {
            mode: 0,
            title: "E-mail not found",
            body: "Cannot process help request without recognized e-mail."
        }, { httpOnly: true });
        res.status(401).json({ goto: "/help" });
        return next();
    }

    const DB = req.app.locals.database;
    const {email} = req.cookies.help;
    const correctOTP = req.cookies.otp;
    
    const inputPin = crypto.createHash("sha256").update(req.body.pin.toUpperCase() + correctOTP.pinSalt).digest("base64");
    if (correctOTP.pin == inputPin) {
        await DB.executeQuery(
            `DELETE FROM OTPs WHERE email = "${email}" AND pin = "${correctOTP.pin}" LIMIT 1`
        );

        res.clearCookie("otp").clearCookie("help");
        req.message = {
            mode: 1,
            title: "OTP Verification Successful!"
        };
    } else if (correctOTP.tries > 0) {
        let message = (correctOTP.tries > 1) ? `You have ${correctOTP.tries} tries left.` : "You have 1 last try left.";
        correctOTP.tries--;
        res.cookie("otp", correctOTP, { httpOnly: true });

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
            SameSite: "strict",
            loginTime: loginTime,
            email: req.body.email,
            user: jwt.sign({
                id: req.account.id,
                type: req.account.type
            }, crypto.createHash("sha256").update(req.body.email + loginTime).digest("base64"),
            { expiresIn: "8h" })
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
    let accountID

    // User is already logged in
    if (req.account) {
        accountID = req.account.id

    // User's (faculty/chair) first login
    } else if (req.cookies.id) {
        accountID = req.cookies.id

    } else {
        next()
    }

    // Hash password
    const password = req.body.password
    const passSalt = crypto.randomBytes(24).toString("base64");
    const hashPassword = crypto.createHash("sha256").update(password + passSalt).digest("base64");

    // Update password
    await req.app.locals.database.executeQuery(
        `UPDATE Users ` +
        `SET password = "${hashPassword}", ` +
        `pass_salt = "${passSalt}" ` +
        `WHERE id = "${accountID}";`
    );
    res.locals.msg_title = "Password had been changed",
    res.locals.msg_body = "Please login again for security reason.",
    res.locals.msg_mode = 1

    // Update last login time
    if (req.cookies.id) {
        await req.app.locals.database.executeQuery(
            `UPDATE Users SET opened_on = CURRENT_TIMESTAMP WHERE id = "${accountID}"`
        );
    }
    
    // clear change password cookie
    res.clearCookie("id");

    // clear session if any
    res.clearCookie("ctsSession");

    next();
};

module.exports = { sendOTP, getOTP, verifyOTP, createSession, verifySession, changePassword };
