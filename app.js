const make_proxy = require('./TimoProxy.js');
const http = require('http');

http.createServer(function (req, res) {
  make_proxy({
    request: req,
    response: res,
    configs: {
      allowCookie: {
        timofood_session: 10000,
        remember_token: 15000,
        fake: 10000
      },
      callbacks: () => console.log("Hohotest bro:))"),
      url: 'http://10.0.1.20:80/api/bakery'
    }
  });
}).listen(4040); 
