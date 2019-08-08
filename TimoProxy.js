const http = require("http");
const url_parser = require("url");

module.exports = function({ request, response, configs }) {
  const proxy_methods = {
    client_cookies: request.headers.cookie || "",
    need_body: ["POST", "PUT", "DELETE"],
    without_body: ["GET", "HEAD"],
    request_method: request.method,
    client_query: "",
    validate() {
      if (!request || !response) return "NO_REQ_RES";
      else if (!(configs.allowCookie instanceof Array))
        return "COOKIE_CONF_ERR";
      else if (
        typeof configs.callbacks !== "function" &&
        !(configs.callbacks instanceof Array)
      )
        return "CALLBACK_FORMAT_ERR";
      else if (typeof configs.url !== "string") return "TARGET_FORMAT_ERR";
      else return "OK";
    },
    needleCookies(onRequest = true) {
      const c_name_set = configs.allowCookie.join(onRequest ? "|" : "=|");

      return new RegExp(`^\\s*(${c_name_set})${onRequest ? "\\s*$" : ""}`, "i");
    },
    handleCookies() {
      const incoming_cookie = this.client_cookies.split(";"),
        cookie_filter = this.needleCookies(),
        cookie_to_send = [];

      for (const cookie of incoming_cookie) {
        const [c_name, c_value] = cookie.split("=");

        if (cookie_filter.test(c_name))
          cookie_to_send.push(`${c_name}=${c_value}`);
      }

      return cookie_to_send;
    },
    makeOptions() {
      const method = this.request_method,
        headers = request.headers,
        url = url_parser.parse(configs.url);

      const [host, port] = url.host.split(":");

      headers["cookie"] = this.handleCookies();

      return {
        hostname: host,
        port: port || 80,
        path: url.pathname + this.client_query,
        method,
        headers
      };
    },
    makeRequest(options, query) {
      const requestObject = http.request(options, res => {
        let response_body = "";

        res.on("data", chunk => {
          response_body += chunk;
        });

        res.on("end", () => {
          response.setStatus = res.statusCode;

          if (configs.filterCookies && "set-cookie" in res.headers) {
            const response_filter = this.needleCookies(false);

            res.headers["set-cookie"] = res.headers["set-cookie"].filter(c =>
              response_filter.test(c)
            );
          }

          for (const header in res.headers)
            response.setHeader(header, res.headers[header]);

          response.end(response_body);

          if (configs.callbacks instanceof Array) {
            configs.callbacks.forEach(c => {
              if (typeof c === "function") c();
            });
          } else {
            configs.callbacks();
          }
        });
      });

      if (this.need_body.includes(this.request_method))
        requestObject.write(query);

      requestObject.end();
    },
    proxify() {
      new Promise((resolve, reject) => {
        if (this.need_body.includes(this.request_method)) {
          let body = "";

          request.on("data", data => {
            body += data;

            if (body.length > 1e6) request.connection.destroy();
          });

          request.on("end", data => {
            resolve(body);
          });
        } else if (this.without_body.includes(this.request_method)) {
          this.client_query = url_parser.parse(request.url, true).search || "";

          resolve();
        } else {
          reject("INVALID_REQUEST");
        }
      })
        .then(info => {
          const options = this.makeOptions();

          this.makeRequest(options, info);
        })
        .catch(error => {
          response.setStatus = 500;

          response.end(error);
        });
    }
  };

  const validated = proxy_methods.validate();

  if (validated === "OK") {
    proxy_methods.proxify();
  } else {
    response.setStatus = 422;

    response.end(validated);
  }
};
