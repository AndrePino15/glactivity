// Serves a small university-style timetable feed relative to "now".
import http from "node:http";
const pad = (n) => String(n).padStart(2, "0");
const local = (d, h, m = 0) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`;
const COLOURS = [["#c94f3d", "#f2b880"], ["#2f4858", "#86bbd8"], ["#5c4d7d", "#e0b1cb"], ["#3a5a40", "#dad7cd"], ["#9c6644", "#ede0d4"]];
http.createServer((req, res) => {
  const cover = req.url.match(/^\/cover\/(\d+)\.svg$/);
  if (cover) {
    const [a, b] = COLOURS[Number(cover[1]) % COLOURS.length];
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="420" cy="200" r="120" fill="${b}" opacity=".5"/></svg>`);
  }
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const day = (offset) => { const d = new Date(monday); d.setDate(monday.getDate() + offset); return d; };
  const ev = (uid, summary, d, h, len, loc, extra = "") => [`BEGIN:VEVENT`, `UID:${uid}`, `SUMMARY:${summary}`, `LOCATION:${loc}`, `DTSTART;TZID=Europe/London:${local(d, h)}`, `DTEND;TZID=Europe/London:${local(d, h + len)}`, extra, `END:VEVENT`].filter(Boolean).join("\r\n");
  const events = [
    ev("comp1215", "COMP1215 Foundations of Computer Science", day(0), 9, 1, "Building 32 / 1015", "RRULE:FREQ=WEEKLY;COUNT=3"),
    ev("comp1202", "COMP1202 Programming 1 Lab", day(1), 11, 2, "Building 59 / Lab 2", "RRULE:FREQ=WEEKLY;COUNT=3"),
    ev("math1058", "MATH1058 Mathematics for Computer Science", day(2), 14, 1, "Building 2 / 1083", "RRULE:FREQ=WEEKLY;COUNT=3"),
    ev("elec1201", "ELEC1201 Electronic Systems", day(3), 10, 1, "Building 35 / 1001", "RRULE:FREQ=WEEKLY;COUNT=3"),
    ev("comp1216", "COMP1216 Software Modelling", day(4), 13, 2, "Building 100 / 4007", "RRULE:FREQ=WEEKLY;COUNT=3"),
    ev("comp1215-b", "COMP1215 Foundations of Computer Science", day(56), 9, 1, "Building 32 / 1015", "RRULE:FREQ=WEEKLY;COUNT=4"),
  ];
  res.writeHead(200, { "Content-Type": "text/calendar" });
  res.end(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fake Soton//EN", ...events, "END:VCALENDAR"].join("\r\n"));
}).listen(54400, () => console.log("feed on 54400"));
