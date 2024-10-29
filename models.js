const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
  name: String,
  phone: String,
  box: Number,
  paymentStatus: { type: Boolean, default: false }
});

module.exports = mongoose.model("Player", playerSchema);