const express = require("express");
const path = require("path");
const fileupload = require("express-fileupload");
const tesseract = require("node-tesseract-ocr");
const { config, stdout, stderr } = require("process");
const { exec } = require("child_process");
const mysql = require("mysql2");
var pdfUtil = require("pdf-to-text");
const fs = require("fs");

//mysql connection
const connection = mysql.createConnection(
  "mysql://azad:azad123@localhost:3306/azad"
);

connection.addListener("error", (err) => {
  console.log(err);
});

const app = express();
app.set("port", process.env.PORT || 3000);
app.use(express.urlencoded({ extended: true }));
app.use(fileupload());
app.use(express.json());
// herbir link için statik bir dizin belirtilir. statik dizin = public
app.use("/dosya-al", express.static(path.join(__dirname, "public")));
app.use("/", express.static(path.join(__dirname, "public")));
app.use("/arama", express.static(path.join(__dirname, "public")));

//ana sayfaya gider
app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, "/index.html"));
});

// arama sayfasına gider
app.get("/arama", function (req, res) {
  res.sendFile(path.join(__dirname, "/arama.html"));
});

//sunucuya gönderilen dosyaları uploads klasörüne yazmak/taşımak
app.post("/dosya-al", function (req, res) {
  if (req.files) {
    var dsy = req.files.dosya;
    console.log(dsy);
    var mime = dsy.mimetype;

    if (mime != "image/png" && mime != "image/jpeg" && mime != "application/pdf") {
      console.log(mime);
      res.json({ err: "dosya tipi geçerli değil." });
    } else {
      dsy.mv(`${__dirname}/public/uploads/${dsy.name}`, function (err) {
        if (err) {
          console.log(err);
        } else {
          if (mime == "image/png" || mime == "image/jpeg") {
            // lang: "tur" ifadesi config'e eşittir yani cofig = {lang: "tur"}, config yerine lang="tur" yazdık
            tesseract
              .recognize(dsy.data, { lang: "tur" })
              .then((data) => {
                console.log("Result:", data);
                /*pdfUtil.pdfToText("uploads/" + dsy.name, function (err, data) {if (err) throw err; console.log(data);});*/
                //pdf'ten çıkarılan text veriyi veritabanına yazmak
                connection.query(
                  "insert into pdf_arama (pdfFile, data) values ('"+dsy.name+"','"+data.replace(/'/g, " ")+"')",(err, result, fields) => {
                    if (err instanceof Error) {
                      //console.log(err);
                      res.json(err);
                      //res.end();
                    } else {
                      //res.redirect("/"); //hem ana sayfaya yönlendirir, hem de yukarıdaki işlemi durdurur.
                      res.json("success");
                    }
                  }
                );
              })
              .catch((error) => {
                //console.log(error.message);
                res.json(error.message);
                //res.end();
              });
          } else {
            exec(
              "ocrmypdf --force-ocr -l tur 'public/uploads/" + dsy.name + "' 'public/uploads/ocr_" + dsy.name + "'", (error, stdout, stderr) => {
                if (error) {
                  console.log(`error: ${error.message}`);
                  res.end();
                }
                if (stderr) {
                  console.log(`stderr: ${stderr}`);
                }
                pdfUtil.pdfToText(
                  "public/uploads/ocr_" + dsy.name,
                  function (err, data) {
                    if (err) throw err;
                    fs.writeFile(
                      `${__dirname}/public/uploads/test.txt`,
                      data,
                      (err) => {
                        if (err) {
                          console.error(err);
                        } else {
                          //console.log("write success");
                          //pdf'ten çıkarılan text veriyi veritabanına yazmak
                          connection.query(
                            "insert into pdf_arama (pdfFile, data) values ('" +
                              dsy.name +
                                "','" +
                                data.replace(/'/g, " ") +
                                "')",
                            (err, result, fields) => {
                              if (err instanceof Error) {
                                console.log(err);
                                res.end();
                              } else {
                                //res.redirect("/"); //hem ana sayfaya yönlendirir, hem de yukarıdaki işlemi durdurur.
                                res.status(200).json("success");
                              }
                            }
                          );
                        }
                      }
                    );
                  }
                );
              }
            );
          }
        }
      });
      console.log(req.files.dosya.name);
    }
  }
});

//arama yapılacak kelimeyi yakalamak
app.post("/bul", function (req, res) {
  var kelime = req.body.arama;
  console.log(kelime);
  connection.query(
    "SELECT * from pdf_arama where data like '%" + kelime + "%'",
    (err, result, fields) => {
      // hata- sonuç- sqlden dönen alanlar
      if (err instanceof Error) {
        console.log(err);
        return;
      } else {
        //console.log(result);
        /*for (i = 0; i < result.length; i++) {
          //console.log(result[i].pdfFile); // Yani aradığımız kelimeinin bulunduğu pdf'in ismini basar
        }*/
        //res.redirect("/arama"); //arama sayfasına yönlendirilecek
        res.json(result);
      }
    }
  );
});

app.listen(app.get("port"), function () {
  console.log("Express server listening on port " + app.get("port"));
});
