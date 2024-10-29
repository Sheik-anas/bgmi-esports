// Dependencies and configurations
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const bodyParser = require("body-parser");
const Player = require("./models");

const app = express();
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");

// MongoDB Atlas connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Event Timings for Slots
const eventTimings = [
  { box: 1, startTime: "15:30", resetAfterMinutes: 20, disableBeforeMinutes: 10 },
  { box: 2, startTime: "16:25", resetAfterMinutes: 20, disableBeforeMinutes: 10 },
  { box: 3, startTime: "17:35", resetAfterMinutes: 20, disableBeforeMinutes: 10 }
];

// Helper: Get current time in "HH:MM" format
const getCurrentTime = () => {
  const now = new Date();
  return now.toTimeString().slice(0, 5);  // format HH:MM
};

// Scheduled task to manage registration windows and slot resets
setInterval(async () => {
  const currentTime = getCurrentTime();

  for (let event of eventTimings) {
    const { box, startTime, resetAfterMinutes, disableBeforeMinutes } = event;

    // Calculate reset and disable times relative to the event's start time
    const [eventHour, eventMinute] = startTime.split(":").map(Number);
    const eventDate = new Date();
    eventDate.setHours(eventHour, eventMinute, 0, 0);
    const resetTime = new Date(eventDate.getTime() + resetAfterMinutes * 60000);
    const disableTime = new Date(eventDate.getTime() - disableBeforeMinutes * 60000);

    // If it's reset time, clear slots for this box
    if (new Date() >= resetTime) {
      await Player.deleteMany({ box });
      console.log(`Slots for Box ${box} reset at ${resetTime.toTimeString().slice(0, 5)}`);
    }

    // Disable registration if within the restricted time window
    event.registrationOpen = new Date() < disableTime;
  }
}, 60000); // Check every minute

// Routes
app.get("/", async (req, res) => {
  const box1Players = await Player.find({ box: 1, paymentStatus: true });
  const box2Players = await Player.find({ box: 2, paymentStatus: true });
  const box3Players = await Player.find({ box: 3, paymentStatus: true });

  const box1Count = box1Players.length;
  const box2Count = box2Players.length;
  const box3Count = box3Players.length;

  res.render("index", {
    box1Count, box2Count, box3Count,
    box1Players, box2Players, box3Players,
    eventTimings // Pass event timing data for registration control in front-end
  });
});

// Payment initiation route
app.post("/register", async (req, res) => {
  const { name, phone, box } = req.body;
  const currentTime = getCurrentTime();
  const event = eventTimings.find(e => e.box === parseInt(box));

  // Check if registration is allowed based on event time
  if (!event.registrationOpen || currentTime >= event.startTime) {
    return res.status(400).send("Registration closed for this event.");
  }

  const playerCount = await Player.countDocuments({ box });
  if (playerCount >= 60) {
    return res.status(400).send("Slot is full for this box.");
  }

  const options = {
    amount: 5000, // INR 50
    currency: "INR",
    receipt: `receipt_order_${Date.now()}`
  };

  try {
    const order = await razorpay.orders.create(options);
    const newPlayer = new Player({ name, phone, box, paymentStatus: false });
    await newPlayer.save();

    res.json({ orderId: order.id, playerId: newPlayer._id });
  } catch (error) {
    res.status(500).send("Payment initiation failed");
  }
});

// Payment verification route
app.post("/verify-payment", async (req, res) => {
  const { playerId, paymentId, signature } = req.body;

  try {
    const player = await Player.findById(playerId);
    if (!player) return res.status(400).send("Invalid player");

    player.paymentStatus = true;
    await player.save();

    res.send("Payment successful, registration complete.");
  } catch (error) {
    res.status(500).send("Payment verification failed");
  }
});

// Admin page to view registered players
app.get("/admin", async (req, res) => {
  const players = await Player.find({ paymentStatus: true });
  res.render("admin", { players });
});

// Additional static pages
app.get("/instructions", (req, res) => res.render("instructions"));
app.get("/prizes", (req, res) => res.render("prizes"));

// Start server
app.listen(3000, () => console.log("Server running on http://localhost:3000"));