const nodemailer = require("nodemailer");
const crypt = require("node:crypto");
const ejs = require("ejs");

class AppMailer {
    #transporter;

    constructor(host, port, email, password, domain, title) {
        this.domain = domain;
        this.title = title;
        this.email = email;
        this.#transporter = nodemailer.createTransport({
            host: host,
            port: port,
            auth: {
                user: email,
                pass: password,
            }
        });
    }

    sendEmail(envelope = {}) {
        envelope.from = `"${this.title}" ${this.email}`;
        this.#transporter.sendMail(envelope, function (err, info) {
            if (err) {
                console.log(err);
            } else {
                console.log(info);
            }
        });
    }

    emailCode(token, code, receiverEmail, route, subject = "E-mail Authentication", htmlPath) {
        let verificationLink = this.domain + route + "?sesh=" + token;

        // render verification OTP email
        ejs.renderFile(htmlPath,
            { code: code, authPage: verificationLink },
            (err, data) => {
                if (err) {
                    console.log(err);
                } else {
                    this.sendEmail({
                        to: receiverEmail,
                        subject: subject,
                        html: data
                    });
                    console.log("Code sent to " + receiverEmail);
                }
            }
        );
    }
}

module.exports = { AppMailer };