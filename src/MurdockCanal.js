const cheerio = require("cheerio");
const fs = require("fs");
const fetch = require("node-fetch");
const request = require("request");
const path = require("path");

const rootDir = path.join(__dirname + "/../");
let cached = null;
try {
	cached = JSON.parse(fs.readFileSync("/data/cache.json", "utf8"));
}
catch (err) {
	cached = {};
}

let photos = [];

fs.readdir(rootDir + "/public/photos/", (err, files) => photos = files);

function GetListings(min_price, max_price) {
    return new Promise((resolve, reject) => {
        let total = -1;
        let properties = [];
        let promises = [];
        let page_number = 1;

        function RecursiveHelper() {
            promises.push(GetOnePage(min_price, max_price, page_number).then(result => {
                if (total === -1) {
                    let $ = cheerio.load(result);
                    total = Number.parseInt($(".properties-found > span").first().text());
                }

                properties = properties.concat(ParseListings(result));

                if (properties.length < total) {
                    ++page_number;
                    RecursiveHelper();
                }
                else {
                    resolve(properties);
                }
            }));
        }

        RecursiveHelper();
    });
}

function GetOnePage(min_price, max_price, page_number) {
    return new Promise((resolve, reject) => {
        fetch(`http://www.aspencreekrealty.com/search/results/3bc/?county=Utah&city=American+Fork&city=Cedar+Hills&city=Highland&city=Lehi&city=Lindon&city=Orem&city=Pleasant+Grove&type=res&list_price_min=${min_price}&list_price_max=${max_price}&style=all&area_min=all&beds_min=all&baths_min=all&year_built_min=all&acres_min=all&school_district=all&elementary_school=all&middle_school=all&high_school=all&amenities=all&interior_features=all&exterior_features=all&short_sale=all&hoa_yn=all&hoa_fee_min=all&hoa_fee_max=all&garage_spaces_min=all&lot_facts=all&master_bedroom=all&garage_features=all&page=${page_number}`)
            .then(results => results.text()).then(text => resolve(text))
    }).catch(err => reject(err));
}

function ParseListings(html) {
    let $ = cheerio.load(html);
    properties = [];

    $(".property").each((index, ele) => {
        let newProperty = {};
        newProperty.address = $(ele).find(".address").text().trim();
        newProperty.price = $(ele).find(".price").text();
        newProperty.price = newProperty.price.substr(newProperty.price.indexOf('$'), 8);
        newProperty.url = $(ele).find(".address").attr("href");

        if (!photos.includes(newProperty.address + ".jpg")) {
            DownloadImage($(ele).find("img").attr("src"), rootDir + "/public/photos/" + newProperty.address + ".jpg");
        }
        properties.push(newProperty);
    });

    return properties;
}

function LoadTrail() {
    return JSON.parse(fs.readFileSync(rootDir + "/trail.json", "utf8"));
}

function CalculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const d = R * c; // in metres

    return d * 0.000621371 // in miles
}

function GetLatLong(address) {
    return new Promise((resolve, reject) => {
        if (cached[address]) {
            resolve(cached[address]);
        }

        try {
            fetch(`http://mapquestapi.com/geocoding/v1/address?key=R3eAv3JGVqezjq9V9aZEIbVKaoyqbAXw&location='${address}'`).then(
                result => result.json()).then(
                    json => {
                        cached[address] = json.results[0].locations[0].latLng;
                        resolve(cached[address]);
                    });
        }
        catch (err) {
            reject(err);
        }
    });
}

function CalcTrailDistance(houseAddress, trailMarkers) {
    let min = 9999999;

    for (let marker of trailMarkers) {
        let distance = CalculateDistance(houseAddress.lat, houseAddress.lng, marker.lat, marker.lng);
        if (distance < min) {
            min = distance;
        }
    }
    return min;
}

function DownloadImage(uri, filename) {
    request.head(uri, function (err, res, body) {
        try {
            request(uri).pipe(fs.createWriteStream(filename));
        }
        catch(err){
        }
    });
};

module.exports = {
    GetListings: function(overrideCache) {
        return new Promise((resolve, reject) => {
            if (overrideCache || (Date.now() - JSON.parse(fs.readFileSync(rootDir + "/config.json", "utf8")).last_pulled > 24 * 60 * 60 * 1000)) {
                GetListings(250000, 450000).then(properties => {
                    let promises = [];
                    let trail = LoadTrail();
                    for (let property of properties) {
                        promises.push(GetLatLong(property.address).then(latLng => {
                            property.latLng = latLng;
                            property.trailDistance = CalcTrailDistance(latLng, trail);
                        }));
                    }

                    Promise.all(promises).then(result => {
                        fs.writeFile("/data/cache.json", JSON.stringify(cached), () => { });
                        fs.writeFile("/data/properties.json", JSON.stringify(properties), () => { });
                        fs.writeFile(rootDir + "/config.json", JSON.stringify({ "last_pulled": Date.now() }), () => { });
                        resolve(JSON.stringify(properties));
                    });
                });
            }
            else {
                resolve(fs.readFileSync("/data/properties.json", "utf8"));
            }
        });
    },

    GetTrail: function(){
        return new Promise((resolve, reject)=>{
            resolve(fs.readFileSync(rootDir + "/trail.json", "utf8"));
        });
    }
}
