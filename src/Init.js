const fs = require("fs");
const murdock = require("./MurdockCanal");
const express = require("express");
const path = require("path");
//const cors = require("cors");

murdock.GetListings();

let interval = setInterval(()=>murdock.GetListings(true), 86400000);

const app = express();
const port = 3000;

//app.use(cors);

app.use(express.static(path.join(__dirname, "../public/photos")));

app.get("/murdockhouses", (req, res) =>
	fs.readFile("/data/properties.json", "utf-8", (err, data)=>res.send(data))
);

app.get("/trailmarkers", (req, res) => murdock.GetTrail().then(result=>res.send(result));

app.listen(port, ()=>console.log(`Listenting on port ${port}`));
