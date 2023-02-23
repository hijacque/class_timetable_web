A web-based class schedule and faculty loading system for the Computer Science Department of Pamantasan ng Lungsod ng Maynila, proposed by JAVAwokeez team.

###### Prerequisites:
- git
- mySQL
- node.js
- gmail app password
- github account

## Installment and set up procedures
**git:**
1. Check if you already have git, open the terminal/command prompt enter `git version`
2. If it says _git is not a command_, then go to download a git installer compatible with your OS
    - Windows: (https://gitforwindows.org/)
    - MacOS: install and setup homebrew (https://brew.sh/) then enter this command in the terminal `brew install git`
4. Open the terminal/command prompt and enter `git version` make sure installation was successful

**mySQL**
1. Download mySQL installer compatible with your OS in https://dev.mysql.com/downloads/mysql/
2. Run the mySQL installer
3. Proceed with the default options until the _Installation_ part
4. Choose "Use Strong Password Encryption" then enter a strong password for the root user
5. Wait until installation process finish
6. Open your terminal and enter `mysql -u root -p`, this will prompt you to enter the password
7. Now that mysql terminal is open, we need to create a new database and user of that database for the project, enter the following in the terminal
    * Project database
    `CREATE DATABASE class_sched_sys;`
    * New user
    ```
    CREATE USER 'class_sched_sys_user'@'localhost' IDENTIFIED BY 'YOUR_PASSWORD';
    GRANT ALL PRIVILEGE ON class_sched_sys.* TO 'class_sched_sys_user'@'localhost';
    ```
8. If no errors occur, exit sql terminal by typing `\q` or `exit`

**Node.js**
1. Choose the right installer for you OS in https://nodejs.org/en/download/
2. Run the node installer and accept all default option and license agreement
3. Wait for installation to finish then restart you computer
4. Open your terminal and check if node was installed by typing `node -v`

**Gmail App password**
(this is for e-mail transfer)
1. Go to https://myaccount.google.com/apppasswords
2. Log in to your google account as needed
3. Click the select app menu and choose custom
4. Enter *class_sched_sys* then click "GENERATE"
5. Copy the password and save it for when setting up the project

**Github**
1. Go to https://github.com/ and sign up
2. \* follow what they say *
3. You probably already have a github account
4. Log in to your github account

## How to get started with the project
1. Copy the web URL of the project repository https://github.com/hijacque/class_timetable_web
2. Open your terminal then move to the folder you want the project to be in
3. Clone the project by entering the following command
    `git clone https://github.com/hijacque/class_timetable_web`
4. Open the project folder that you just cloned from the terminal
5. Start mySQL server by typing `mysql.server start`
6. Check for `class_sched_sys.sql` file, then enter the command:
    `mysqldump -u root -p class_sched_sys < class_sched_sys.sql`
    Enter your pasword to initialize database schema
7. Install package dependencies by entering `npm init`
8. Open your text editor and in the root project folder create a file and name it `.env`
9. Open the `.env` file and fill it with the following:
    ```
    DB_PORT="localhost"
    DB_USER=“class_sched_sys_user”
    DB_PASSWORD=“class_sched_sys_user's_PASSWORD”
    DB_NAME="class_sched_sys"

    API_PORT=3000
    API_KEY=“RANDOM_32LENGTH_STRING1”

    SMTP_PORT=587
    SMTP="smtp.gmail.com"
    SMTP_SENDER="YOUR_GMAIL_ADDRESS"
    SMTP_PASSWORD="GMAIL_APP_PASSWORD"

    COOKIE_KEY="RANDOM_32LENGTH_STRING2”
    HELP_KEY="RANDOM_32LENGTH_STRING3”
    ```
10. Your computer is now a local server for the project
11. Open your terminal and enter `node index.js`
12. Open your browser (Chrome, Edge, IE, etc.) then access http://localhost:3000/ or signup an account in http://localhost:3000/login