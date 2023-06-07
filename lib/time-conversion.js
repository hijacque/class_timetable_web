function convertMinutesTime(time, military = true) {
    let hours = Math.trunc(time / 60);
    if (!military) {
        hours = hours >= 13 ? hours - 12 : hours;
    }

    hours = ("00" + hours).slice(-2);
    let minutes = ("00" + Math.trunc(time % 60)).slice(-2);
    return `${hours}:${minutes}`;
}

function toWeekDay(day, short = false) {
    day = typeof (day) == "string" ? day.toLowerCase() : day;
    switch (day) {
        case 1:
            return short ? "Mon" : "Monday";
        case 2:
            return short ? "Tue" : "Tuesday";
        case 3:
            return short ? "Wed" : "Wednesday";
        case 4:
            return short ? "Thu" : "Thursday";
        case 5:
            return short ? "Fri" : "Friday";
        case 6:
            return short ? "Sat" : "Saturday";
        case 7:
            return short ? "Sun" : "Sunday";
        case "mon" || "monday":
            return 1;
        case "tue" || "tuesday":
            return 2;
        case "wed" || "wednesday":
            return 3;
        case "thu" || "thursday":
            return 4;
        case "fri" || "friday":
            return 5;
        case "sat" || "saturday":
            return 6;
        case "sun" || "sunday":
            return 7;
        default:
            return day;
    }
}

module.exports = {convertMinutesTime, toWeekDay};